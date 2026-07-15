"""Embedded Hermes — direct in-process AIAgent with iteration budget control.

``EmbeddedHermes`` wraps ``run_agent.AIAgent`` with hard ``max_iterations`` and
budget exhaustion fallback.  This is a higher-level interface than
``InProcessHermesClient`` (which mirrors the HTTP client's ``chat()``): it owns
the full generation lifecycle with structured progress and fallback behaviour.

Supports per-account ``HERMES_HOME`` scoping for persistent creator memory.

Usage
-----
    embedded = EmbeddedHermes(settings)
    result = embedded.generate(audit, progress=my_progress)
    print(result.html)
"""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
import os
import sys
import time
from typing import Any, Callable, Iterator

from .hermes_home_scope import HERMES_HOME_LOCK

from .config import WorkerSettings
from .core import (
    AuditRecord,
    REFINE_SYSTEM_PROMPT,
    WORKER_SYSTEM_PROMPT,
    build_refinement_prompt,
    build_worker_prompt,
    extract_fragment,
    extract_html,
    html_looks_complete,
)
from .hermes import _estimate_tokens, ChatResult, Usage
from .hermes_runtime import resolve_agent_root

# ---------------------------------------------------------------------------
# Diagnostics dataclass
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class EmbeddedDiagnosticResult:
    """Result of :func:`diagnose_embedded` health check."""

    ok: bool
    agent_root: str
    agent_root_exists: bool
    aiagent_importable: bool
    iterationbudget_importable: bool
    error: str = ""
    recommendation: str = ""


# ---------------------------------------------------------------------------
# Budget exhaustion sentinel
# ---------------------------------------------------------------------------


class BudgetExhausted(Exception):
    """Raised when the AIAgent hits the hard iteration budget.

    Catch this inside ``generate()`` and produce a partial/final fallback
    report from whatever content the agent produced before being halted.
    """


# ---------------------------------------------------------------------------
# Helper: scope HERMES_HOME for the duration of a block
# ---------------------------------------------------------------------------


@contextmanager
def _scoped_hermes_home(hermes_home: str | None) -> Iterator[None]:
    """Temporarily set ``HERMES_HOME`` in the process environment.

    Restores the previous value (or removes the key) when the context exits.
    No-op when ``hermes_home`` is ``None``.
    """
    if hermes_home is None:
        yield
        return
    with HERMES_HOME_LOCK:
        prev = os.environ.get("HERMES_HOME")
        os.environ["HERMES_HOME"] = hermes_home
        try:
            yield
        finally:
            if prev is None:
                os.environ.pop("HERMES_HOME", None)
            else:
                os.environ["HERMES_HOME"] = prev


# ---------------------------------------------------------------------------
# EmbeddedHermes
# ---------------------------------------------------------------------------


class EmbeddedHermes:
    """In-process AIAgent with hard ``max_iterations`` and budget fallback.

    ``EmbeddedHermes`` wraps ``AIAgent`` directly instead of talking to the
    Hermes Gateway over HTTP.  The agent runs fully in-process with tool access
    (web, browser, x_search via the Hermes skill system), but is limited to a
    hard iteration budget to prevent runaway tool loops.

    .. rubric:: Budget exhaustion

    When the iteration budget is exhausted, ``generate()`` does NOT crash.
    Instead it catches :class:`BudgetExhausted` internally and returns a
    ``GenerationResult`` with the content the agent produced before it was
    stopped, plus ``budget_exhausted=True`` in the metadata.  The caller
    (pipeline) can then fall back to a Stage 2 compose-only pass.

    Parameters
    ----------
    settings : WorkerSettings
    hermes_home : str or None
        If set, ``HERMES_HOME`` is scoped to this directory so Hermes memory
        persists per-account.  When ``None``, the process-level ``HERMES_HOME``
        (or Hermes's default) is used.
    skip_memory : bool
        When ``False`` (the default), Hermes auto-writes ``MEMORY.md`` after
        each session so the next audit of the same creator can reuse facts.
    max_iterations : int
        Hard cap on tool-calling iterations before ``BudgetExhausted`` is raised.
    """

    def __init__(
        self,
        settings: WorkerSettings,
        *,
        hermes_home: str | None = None,
        skip_memory: bool = False,
        max_iterations: int = 30,
    ) -> None:
        self.settings = settings
        self._hermes_home = hermes_home
        self._skip_memory = skip_memory
        self.max_iterations = max_iterations
        self._agent_root = resolve_agent_root(settings)
        self._ensure_import_path()

    # ------------------------------------------------------------------
    # Import helpers
    # ------------------------------------------------------------------

    def _ensure_import_path(self) -> None:
        root = str(self._agent_root)
        if root not in sys.path:
            sys.path.insert(0, root)

    # ------------------------------------------------------------------
    # generate  (compatible with ReportGenerator protocol)
    # ------------------------------------------------------------------

    def generate(
        self,
        audit: AuditRecord,
        progress: Callable[[str, str], None],
        *,
        ig_metrics: Any = None,
        research_cache: str = "",
    ) -> dict[str, Any]:
        """Run a full audit generation in-process.

        Parameters
        ----------
        audit : AuditRecord
            The audit to generate a report for.
        progress : Callable[[str, str], None]
            Called with ``(phase, detail)`` as the agent advances through stages.
        ig_metrics : Any, optional
            Pre-fetched Instagram metrics (unused in embedded mode).
        research_cache : str
            Pre-existing research content used to skip the research phase
            (resume path).

        Returns
        -------
        dict with keys ``html``, ``tokens_in``, ``tokens_out``, ``model``,
        ``estimated``, ``research_cache``, ``tokens_saved``,
        ``budget_exhausted``, ``error``.
        """
        from run_agent import AIAgent  # type: ignore[import-not-found]
        from run_agent import IterationBudget  # type: ignore[import-not-found]
        # The default AIAgent.max_iterations=90 may be too generous for embedded
        # report generation.  We create an explicit IterationBudget with our own
        # hard cap so the agent stops promptly at our limit.

        _ = ig_metrics  # accepted for interface compatibility; unused.

        accumulated_content: list[str] = []
        budget_exhausted = False
        error: str | None = None
        started = time.time()

        # ── Stage 1: research (if no cached research) ──────────────────
        if not research_cache:
            progress("researching", f"Researching @{audit.handle} via embedded AIAgent")
            prompt = build_worker_prompt(audit, ig_metrics)
            try:
                stage1_content = self._run_agent(
                    AIAgent, IterationBudget,
                    user_message=prompt,
                    system_message=WORKER_SYSTEM_PROMPT,
                    progress=progress,
                )
            except BudgetExhausted:
                budget_exhausted = True
                stage1_content = ""
            research_cache = stage1_content
            accumulated_content.append(stage1_content)
        else:
            progress("composing", "Session resumed — using cached research")

        # ── Stage 2: compose report ────────────────────────────────────
        progress("composing", "Composing report from research findings")
        max_brief_chars = 8000
        brief = research_cache
        if len(brief) > max_brief_chars:
            brief = brief[:max_brief_chars] + "\n...\n[research truncated]"

        compose_prompt = (
            f"You just completed research for an audit of @{audit.handle} "
            f"({audit.goal}).\n\n"
            f"=== RESEARCH FINDINGS ===\n{brief}\n=== END RESEARCH ===\n\n"
            f"Now generate ONLY the complete, self-contained HTML report. "
            f"Do NOT use any tools. Do NOT include markdown fences. "
            f"Output the full <!doctype html> document with all sections, "
            f"scores, metrics, strengths, gaps, competitive context, content ideas, "
            f"and 90-day growth map. The report must be complete and production-ready. "
            f"Use the report design system styles from the social-media-audit skill."
        )

        try:
            compose_result = self._run_agent(
                AIAgent, IterationBudget,
                user_message=compose_prompt,
                system_message=WORKER_SYSTEM_PROMPT,
                progress=progress,
                toolsets=(),  # NO tools — all tokens go to HTML
            )
        except BudgetExhausted:
            budget_exhausted = True
            compose_result = ""
        accumulated_content.append(compose_result)

        # ── Extract HTML from the combined output ──────────────────────
        combined = "\n\n".join(accumulated_content)
        try:
            report_html = extract_html(combined)
        except ValueError:
            # Fallback: the raw combined content is the report
            report_html = combined

        elapsed = time.time() - started
        tokens_in = _estimate_tokens(combined)
        tokens_out = _estimate_tokens(report_html)

        # Emit composing phase so pipeline sees it
        progress("composing", f"Report composed ({len(report_html)} chars in {elapsed:.1f}s)")

        return {
            "html": report_html,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "model": self.settings.hermes_model,
            "estimated": True,
            "research_cache": research_cache,
            "tokens_saved": 0,
            "budget_exhausted": budget_exhausted,
            "error": error,
        }

    def _run_agent(
        self,
        AIAgent_cls: type,
        IterationBudget_cls: type,
        *,
        user_message: str,
        system_message: str | None,
        progress: Callable[[str, str], None] | None = None,
        toolsets: tuple[str, ...] | None = None,
    ) -> str:
        """Instantiate an AIAgent, run a single conversation, return the text.

        Catches budget exhaustion and re-raises as ``BudgetExhausted``.
        HERMES_HOME is scoped for the duration of the agent run.
        """
        budget = IterationBudget_cls(max_total=self.max_iterations)
        accumulated: list[str] = []

        def stream_callback(delta: str) -> None:
            if delta:
                accumulated.append(delta)

        with _scoped_hermes_home(self._hermes_home):
            agent = AIAgent_cls(
                model=self.settings.hermes_model,
                provider=self.settings.hermes_provider,
                enabled_toolsets=list(toolsets) if toolsets is not None
                else list(self.settings.enabled_toolsets) or None,
                max_tokens=self.settings.max_tokens,
                quiet_mode=True,
                verbose_logging=False,
                platform="api_server",
                skip_memory=self._skip_memory,
                max_iterations=self.max_iterations,
                iteration_budget=budget,
            )

            if progress:
                progress("running", "Agent conversation started")

            result = agent.run_conversation(
                user_message,
                system_message=system_message,
                stream_callback=stream_callback,
            )

        if budget.used >= self.max_iterations:
            raise BudgetExhausted(
                f"Iteration budget ({self.max_iterations}) exhausted "
                f"after {budget.used} iterations"
            )

        content = str(result.get("final_response") or "")
        if not accumulated and content:
            accumulated.append(content)

        return "".join(accumulated) or content

    # ------------------------------------------------------------------
    # _run_agent_simple — no iteration budget tracking (for refine)
    # ------------------------------------------------------------------

    def _run_agent_simple(
        self,
        user_message: str,
        system_message: str | None,
        *,
        max_tokens: int | None = None,
    ) -> dict[str, Any]:
        """Run a single-turn AIAgent conversation with no budget tracking.

        Used for refinement calls where the conversation is bounded (single
        prompt, single response) and doesn't need iteration-budget safety.
        """
        from run_agent import AIAgent  # type: ignore[import-not-found]

        with _scoped_hermes_home(self._hermes_home):
            agent = AIAgent(
                model=self.settings.hermes_model,
                provider=self.settings.hermes_provider,
                enabled_toolsets=list(self.settings.enabled_toolsets) or None,
                max_tokens=max_tokens or 4000,
                quiet_mode=True,
                verbose_logging=False,
                platform="api_server",
                skip_memory=self._skip_memory,
            )
            return agent.run_conversation(
                user_message,
                system_message=system_message,
            )

    # ------------------------------------------------------------------
    # refine  (compatible with ReportGenerator protocol)
    # ------------------------------------------------------------------

    def refine(
        self,
        audit: AuditRecord,
        current_html: str,
        section: str,
        instruction: str,
        progress: Callable[[str, str], None],
    ) -> dict[str, Any]:
        """Refine a specific section of an existing report.

        Parameters
        ----------
        audit : AuditRecord
        current_html : str
            The full current HTML report.
        section : str
            Section name (e.g. ``"strengths"``).
        instruction : str
            Free-text refinement instruction.
        progress : Callable[[str, str], None]

        Returns
        -------
        dict with keys ``fragment``, ``tokens_in``, ``tokens_out``, ``model``.
        """
        progress("refinement", f"Refining section '{section}' (embedded)")
        prompt = build_refinement_prompt(audit, current_html, section, instruction)

        result = self._run_agent_simple(
            prompt,
            system_message=REFINE_SYSTEM_PROMPT,
        )
        content = str(result.get("final_response") or "")
        fragment = extract_fragment(content)

        return {
            "fragment": fragment,
            "tokens_in": _estimate_tokens(content),
            "tokens_out": _estimate_tokens(fragment),
            "model": self.settings.hermes_model,
        }


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


def diagnose_embedded() -> EmbeddedDiagnosticResult:
    """Verify the embedded Hermes runtime is importable and ready.

    Returns
    -------
    EmbeddedDiagnosticResult
        ``ok=True`` when both ``run_agent.AIAgent`` and
        ``run_agent.IterationBudget`` can be imported.
    """
    errors: list[str] = []

    try:
        agent_root = resolve_agent_root(WorkerSettings.from_env())
        agent_root_exists = agent_root.exists()
    except (FileNotFoundError, OSError):
        agent_root = None
        agent_root_exists = False
        errors.append("Hermes Agent root not found")

    aiagent_importable = False
    iterationbudget_importable = False

    if agent_root is not None:
        try:
            sys.path.insert(0, str(agent_root))
            from run_agent import AIAgent  # noqa: F401

            aiagent_importable = True
        except ImportError as exc:
            errors.append(f"AIAgent import failed: {exc}")

        try:
            from run_agent import IterationBudget  # noqa: F401

            iterationbudget_importable = True
        except ImportError as exc:
            errors.append(f"IterationBudget import failed: {exc}")

    ok = agent_root_exists and aiagent_importable and iterationbudget_importable
    error = "; ".join(errors) if errors else ""
    recommendation = ""
    if not ok:
        if not agent_root_exists:
            recommendation = (
                f"Hermes Agent source not found at {agent_root}. "
                "Set HERMES_AGENT_ROOT to the hermes-agent checkout, or install "
                "Hermes Agent via the official installer."
            )
        elif not aiagent_importable:
            recommendation = (
                f"Found agent root at {agent_root} but could not import AIAgent. "
                "Check that the Hermes Agent dependencies are installed "
                "(e.g. `uv sync` or `pip install -r requirements.txt` in the agent root)."
            )
        else:
            recommendation = (
                "IterationBudget is required for budget-exhaustion safety. "
                "Update your Hermes Agent install to a version that exports it."
            )

    return EmbeddedDiagnosticResult(
        ok=ok,
        agent_root=str(agent_root) if agent_root is not None else "",
        agent_root_exists=agent_root_exists,
        aiagent_importable=aiagent_importable,
        iterationbudget_importable=iterationbudget_importable,
        error=error,
        recommendation=recommendation,
    )
