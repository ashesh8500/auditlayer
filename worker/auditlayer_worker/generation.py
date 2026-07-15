"""Report generators.

``MockReportGenerator`` is deterministic (no model tokens) for QA/CI/demo when
Hermes is unreachable. ``HermesReportGenerator`` calls the live gateway and
streams progress so the pipeline can emit a granular agentic timeline.

Both call a ``progress(phase, detail)`` callback as they advance through the
shared GENERATION_PHASES (researching -> metrics -> peers -> scoring ->
composing), which the pipeline turns into ``audit_events`` rows.
"""

from __future__ import annotations

from dataclasses import dataclass
import html as html_lib
import time
from typing import Any, Callable, Protocol

from .core import (
    GENERATION_PHASES,
    AuditRecord,
    REFINE_SYSTEM_PROMPT,
    WORKER_SYSTEM_PROMPT,
    assemble_report_html,
    build_refinement_prompt,
    build_report_prompt,
    build_section_prompt,
    build_worker_prompt,
    extract_fragment,
    extract_html,
    html_looks_complete,
)
from .hermes import HermesClient

Progress = Callable[[str, str], None]


@dataclass(frozen=True)
class GenerationResult:
    html: str
    tokens_in: int
    tokens_out: int
    model: str
    estimated: bool = False
    research_cache: str = ""  # saved so retries can skip Stage 1
    tokens_saved: int = 0     # tokens avoided by using cache


@dataclass(frozen=True)
class RefinementResult:
    fragment: str
    tokens_in: int
    tokens_out: int
    model: str


class ReportGenerator(Protocol):
    def generate(
        self, audit: AuditRecord, progress: Progress, *,
        ig_metrics: Any = None, research_cache: str = "",
        benchmarks: list[dict] | None = None,
    ) -> GenerationResult: ...
    def refine(
        self, audit: AuditRecord, current_html: str, section: str,
        instruction: str, progress: Progress,
    ) -> RefinementResult: ...


_PHASE_DETAILS = {
    "researching": "Querying web, browser, and x_search for @{handle}",
    "metrics": "Reconciling follower, engagement, and cadence metrics",
    "peers": "Selecting same-tier peers and benchmarking",
    "scoring": "Scoring across 8 weighted dimensions",
    "composing": "Composing the self-contained HTML report",
}

_REPORT_MAX_TOKENS = {
    "pulse": 6000,
    "standard": 12000,
    "blueprint": 12000,
    "extended": 18000,
    "enterprise": 24000,
}

SECTION_SYSTEM_PROMPT = (
    "You are AuditLayer's report analyst. Use only the supplied verified evidence "
    "and account data. Return the required section elements only, with exact h2 "
    "headings. Do not call tools and do not return the fixed page shell or CSS."
)


class _PhaseEmitter:
    """Emits GENERATION_PHASES in order, at most once each, monotonically."""

    def __init__(self, audit: AuditRecord, progress: Progress, interval: float):
        self._audit = audit
        self._progress = progress
        self._interval = interval
        self._phases = list(GENERATION_PHASES)
        self._idx = -1
        self._last = time.monotonic()

    def advance_to(self, target: str) -> None:
        target_idx = self._phases.index(target)
        while self._idx < target_idx:
            self._idx += 1
            phase = self._phases[self._idx]
            detail = _PHASE_DETAILS.get(phase, "").format(handle=self._audit.handle)
            self._progress(phase, detail)
            self._last = time.monotonic()

    def tick_timed(self, ceiling: str = "scoring") -> None:
        if self._interval <= 0:
            return
        ceiling_idx = self._phases.index(ceiling)
        if self._idx >= ceiling_idx:
            return
        if time.monotonic() - self._last >= self._interval:
            self.advance_to(self._phases[self._idx + 1])


class MockReportGenerator:
    """Deterministic generator used when Hermes is unreachable or for CI."""

    def __init__(self, phase_interval: float = 0.0):
        self.phase_interval = phase_interval

    def generate(
        self, audit: AuditRecord, progress: Progress, *,
        ig_metrics: Any = None, research_cache: str = "",
        benchmarks: list[dict] | None = None,
    ) -> GenerationResult:
        """Deterministic generator used when Hermes is unreachable or for CI."""
        emitter = _PhaseEmitter(audit, progress, self.phase_interval)
        for phase in GENERATION_PHASES:
            emitter.advance_to(phase)
            if self.phase_interval > 0:
                time.sleep(self.phase_interval)
        html = _mock_report_html(audit)
        return GenerationResult(
            html=html, tokens_in=18_000, tokens_out=22_000,
            model="mock", estimated=True,
        )

    def refine(
        self, audit: AuditRecord, current_html: str, section: str,
        instruction: str, progress: Progress,
    ) -> RefinementResult:
        progress("refinement", f"Refining section '{section}' (mock)")
        safe_section = html_lib.escape(section)
        safe_instruction = html_lib.escape(instruction)
        fragment = (
            f'<section class="card"><h2>{safe_section}</h2>'
            f"<p><strong>Refined:</strong> {safe_instruction}</p>"
            f"<p>This deterministic refinement proves scoped report editing "
            f"without general-purpose chat access.</p></section>"
        )
        return RefinementResult(
            fragment=fragment, tokens_in=1200, tokens_out=400, model="mock",
        )


class HermesReportGenerator:
    def __init__(
        self,
        client: HermesClient,
        model: str,
        toolsets: tuple[str, ...],
        max_tokens: int,
        temperature: float,
        phase_interval: float = 20.0,
    ):
        self.client = client
        self.model = model
        self.toolsets = toolsets
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.phase_interval = phase_interval

    def generate(
        self, audit: AuditRecord, progress: Progress, *,
        ig_metrics: Any = None, research_cache: str = "",
        benchmarks: list[dict] | None = None,
    ) -> GenerationResult:
        """Generate a report. If ``research_cache`` is provided from a previous
        failed attempt, Stage 1 (tool-calling research) is skipped entirely and
        we go straight to Stage 2 (compose-only) — saving all research tokens.
        """
        emitter = _PhaseEmitter(audit, progress, self.phase_interval)

        def on_delta(_piece: str, accumulated: str) -> None:
            if html_looks_complete(accumulated):
                emitter.advance_to("composing")
            else:
                emitter.tick_timed(ceiling="scoring")

        collect_research = getattr(self.client, "collect_research", None)

        # HTTP clients retain the legacy cached path. In-process generation reuses
        # cached evidence through the same validated local assembly path below.
        if research_cache and not callable(collect_research):
            progress("composing", "Session resumed — reusing cached research, composing report")
            emitter.advance_to("composing")
            return self._compose_report(audit, progress, emitter, on_delta,
                                        research_cache, tokens_saved=32_000)

        # ── fresh or cached bounded path ──
        session_id = f"audit-{audit.id}"
        emitter.advance_to("researching")
        prompt = build_report_prompt(
            audit,
            ig_metrics=ig_metrics,
            benchmarks=benchmarks,
        )
        chat_toolsets = self.toolsets
        system_prompt = WORKER_SYSTEM_PROMPT
        local_assembly = False
        research_material = ""
        if callable(collect_research):
            evidence = research_cache or str(collect_research(audit))
            research_material = evidence
            emitter.advance_to("scoring")
            prompt = build_section_prompt(
                audit,
                evidence,
                ig_metrics=ig_metrics,
                benchmarks=benchmarks,
            )
            chat_toolsets = ()
            system_prompt = SECTION_SYSTEM_PROMPT
            local_assembly = True

        result = self.client.chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            model=self.model,
            toolsets=chat_toolsets,
            max_tokens=min(
                self.max_tokens,
                _REPORT_MAX_TOKENS.get(audit.report_type or "standard", 12000),
            ),
            temperature=self.temperature,
            stream=True,
            on_delta=on_delta,
            session_id=session_id,
        )
        emitter.advance_to("composing")

        if local_assembly:
            try:
                report_html = assemble_report_html(audit, result.content)
                tokens_in = result.usage.tokens_in
                tokens_out = result.usage.tokens_out
                estimated = result.usage.estimated
            except ValueError:
                retry_result = self.client.chat(
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "Formatting correction only. Return HTML section elements now. "
                                "The first character must be < and the response must start with <section>."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    model=self.model,
                    toolsets=(),
                    max_tokens=min(
                        self.max_tokens,
                        _REPORT_MAX_TOKENS.get(audit.report_type or "standard", 12000),
                    ),
                    temperature=self.temperature,
                    stream=False,
                    session_id=session_id,
                )
                report_html = assemble_report_html(audit, retry_result.content)
                tokens_in = result.usage.tokens_in + retry_result.usage.tokens_in
                tokens_out = result.usage.tokens_out + retry_result.usage.tokens_out
                estimated = result.usage.estimated or retry_result.usage.estimated
            return GenerationResult(
                html=report_html,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                model=result.model,
                estimated=estimated,
                research_cache=research_material,
            )

        # Try to extract HTML from the combined response
        try:
            report_html = extract_html(result.content)
            return GenerationResult(
                html=report_html,
                tokens_in=result.usage.tokens_in,
                tokens_out=result.usage.tokens_out,
                model=result.model,
                estimated=result.usage.estimated,
                research_cache=result.content,
            )
        except ValueError:
            pass  # No HTML found — Stage 2 fallback

        return self._compose_report(audit, progress, emitter, on_delta,
                                    result.content, tokens_saved=0,
                                    stage1_usage=result.usage)

    def _compose_report(
        self, audit: AuditRecord, progress: Progress,
        emitter: _PhaseEmitter, on_delta, research_brief: str,
        tokens_saved: int = 0,
        stage1_usage: Any = None,
    ) -> GenerationResult:
        """Stage 2: generate ONLY the HTML report from research findings.
        No tools — entire token budget goes to the HTML output."""
        progress("composing", "Composing report from research findings")

        max_brief_chars = 8000
        if len(research_brief) > max_brief_chars:
            research_brief = research_brief[:max_brief_chars] + "\n...\n[research truncated]"

        compose_prompt = (
            f"You just completed research for an audit of @{audit.handle} "
            f"({audit.goal}).\n\n"
            f"=== RESEARCH FINDINGS ===\n{research_brief}\n=== END RESEARCH ===\n\n"
            f"Now generate ONLY the complete, self-contained HTML report. "
            f"Do NOT use any tools. Do NOT include markdown fences. "
            f"Output the full <!doctype html> document with all sections, "
            f"scores, metrics, strengths, gaps, competitive context, content ideas, "
            f"and 90-day growth map. The report must be complete and production-ready. "
            f"Use the report design system styles from the social-media-audit skill."
        )

        compose_result = self.client.chat(
            messages=[
                {"role": "system", "content": WORKER_SYSTEM_PROMPT},
                {"role": "user", "content": compose_prompt},
            ],
            model=self.model,
            toolsets=(),  # NO tools — preserve all tokens for the HTML
            # Never override the configured completion ceiling during fallback.
            # Cost/token caps are meaningless if a retry can silently jump to 64k.
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            stream=True,
            on_delta=on_delta,
            session_id=f"audit-{audit.id}",
        )
        emitter.advance_to("composing")
        report_html = extract_html(compose_result.content)

        total_in = compose_result.usage.tokens_in
        total_out = compose_result.usage.tokens_out
        if stage1_usage is not None:
            total_in += stage1_usage.tokens_in
            total_out += stage1_usage.tokens_out

        return GenerationResult(
            html=report_html,
            tokens_in=total_in,
            tokens_out=total_out,
            model=compose_result.model,
            estimated=compose_result.usage.estimated,
            research_cache=research_brief,
            tokens_saved=tokens_saved,
        )

    def refine(
        self, audit: AuditRecord, current_html: str, section: str,
        instruction: str, progress: Progress,
    ) -> RefinementResult:
        progress("refinement", f"Refining section '{section}'")
        prompt = build_refinement_prompt(audit, current_html, section, instruction)
        result = self.client.chat(
            messages=[
                {"role": "system", "content": REFINE_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            model=self.model,
            toolsets=self.toolsets,
            max_tokens=4000,
            temperature=self.temperature,
            stream=False,
        )
        fragment = extract_fragment(result.content)
        return RefinementResult(
            fragment=fragment,
            tokens_in=result.usage.tokens_in,
            tokens_out=result.usage.tokens_out,
            model=result.model,
        )


def _mock_report_html(audit: AuditRecord) -> str:
    safe_handle = html_lib.escape(audit.handle)
    safe_goal = html_lib.escape(audit.goal.replace("_", " ").title())
    milestone = html_lib.escape(audit.milestone_label or "Road to next verified milestone")
    limitations = (
        "".join(f"<li>{html_lib.escape(item)}</li>" for item in audit.limitations)
        or "<li>No collection limitations declared.</li>"
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AuditLayer Report - @{safe_handle}</title>
  <style>
    body {{ font-family: Inter, Arial, sans-serif; margin: 0; color: #1c1917; background: #fafaf9; }}
    main {{ max-width: 960px; margin: 0 auto; padding: 40px 24px; }}
    .eyebrow {{ color: #0d9488; font-weight: 700; text-transform: uppercase; font-size: 12px; }}
    .card {{ border: 1px solid #e7e5e4; background: #fff; border-radius: 8px; padding: 20px; margin: 18px 0; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }}
    .metric {{ border: 1px solid #d6d3d1; border-radius: 8px; padding: 16px; }}
    .metric strong {{ display: block; font-family: "JetBrains Mono", monospace; font-size: 24px; }}
    table {{ width: 100%; border-collapse: collapse; }}
    th, td {{ text-align: left; border-bottom: 1px solid #e7e5e4; padding: 10px; vertical-align: top; }}
  </style>
</head>
<body>
<main>
  <p class="eyebrow">AuditLayer QA Report</p>
  <h1>@{safe_handle} social media audit</h1>
  <p>This deterministic report proves the intake, event-stream, report rendering, upload, and billing path.
     Production mode swaps this section for Hermes-generated analysis using the social-media-audit skill.</p>
  <section class="grid">
    <div class="metric"><span>Goal</span><strong>{safe_goal}</strong></div>
    <div class="metric"><span>Platform</span><strong>{html_lib.escape(audit.platform.title())}</strong></div>
    <div class="metric"><span>Status</span><strong>Ready</strong></div>
  </section>
  <section class="card">
    <h2>Data Quality Notes</h2>
    <ul>{limitations}</ul>
  </section>
  <section class="card">
    <h2>The Six Audit Outputs</h2>
    <table>
      <tr><th>Question</th><th>QA placeholder</th></tr>
      <tr><td>Where you're at</td><td>Pending live Hermes research sweep.</td></tr>
      <tr><td>What's holding you back</td><td>Pending bottleneck diagnosis.</td></tr>
      <tr><td>Who's doing it better</td><td>Same-tier peers only; aspirational custom comparisons are Pro-gated.</td></tr>
      <tr><td>What to post next week</td><td>Calendar generated by Hermes in production mode.</td></tr>
      <tr><td>When you hit the next milestone</td><td>{milestone}</td></tr>
      <tr><td>The money move</td><td>Monetization recommendation generated from audience and format mix.</td></tr>
    </table>
  </section>
  <!-- PROMPT_VERSION_LINE -->
</main>
</body>
</html>"""
