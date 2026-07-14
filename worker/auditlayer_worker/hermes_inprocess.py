"""In-process Hermes client via ``run_agent.AIAgent`` (HERMES_MODE=inprocess)."""

from __future__ import annotations

import os
import sys
from typing import Callable, Iterable

from .hermes import ChatResult, Usage, _estimate_tokens
from .hermes_runtime import resolve_agent_root
from .config import WorkerSettings


class InProcessHermesClient:
    """Drop-in replacement for :class:`~auditlayer_worker.hermes.HermesClient`."""

    def __init__(
        self,
        settings: WorkerSettings,
        *,
        hermes_home: str | None = None,
        max_iterations: int | None = None,
        skip_memory: bool = False,
    ) -> None:
        self.settings = settings
        self._hermes_home = hermes_home
        self._max_iterations = max_iterations or settings.hermes_max_iterations
        self._skip_memory = skip_memory
        self._agent_root = resolve_agent_root(settings)
        self._ensure_import_path()

    @property
    def api_base(self) -> str:
        return self.settings.hermes_api_base

    def _ensure_import_path(self) -> None:
        root = str(self._agent_root)
        if root not in sys.path:
            sys.path.insert(0, root)

    @staticmethod
    def _request_overrides(model: str, temperature: float) -> dict[str, float]:
        """Return only parameters supported by the selected embedded runtime.

        Codex-backed GPT-5 models reject an explicit ``temperature`` value.
        Other providers retain the worker's deterministic temperature control.
        """
        if model.strip().lower().startswith("gpt-5"):
            return {}
        return {"temperature": temperature}

    def _scope_hermes_home(self) -> str | None:
        previous = os.environ.get("HERMES_HOME")
        if self._hermes_home is not None:
            os.environ["HERMES_HOME"] = self._hermes_home
        return previous

    @staticmethod
    def _restore_hermes_home(previous: str | None) -> None:
        if previous is None:
            os.environ.pop("HERMES_HOME", None)
        else:
            os.environ["HERMES_HOME"] = previous

    def chat(
        self,
        messages: list[dict],
        model: str,
        *,
        toolsets: Iterable[str] = (),
        max_tokens: int = 32000,
        temperature: float = 0.2,
        stream: bool = True,
        on_delta: Callable[[str, str], None] | None = None,
        session_id: str = "",
    ) -> ChatResult:
        del session_id  # In-process sessions are isolated through HERMES_HOME.

        previous_home = self._scope_hermes_home()
        try:
            from run_agent import AIAgent, IterationBudget  # type: ignore[import-not-found]

            system_parts = [str(m.get("content", "")) for m in messages if m.get("role") == "system"]
            user_parts = [str(m.get("content", "")) for m in messages if m.get("role") == "user"]
            system_message = "\n\n".join(p for p in system_parts if p) or None
            user_message = "\n\n".join(p for p in user_parts if p)
            prompt_chars = sum(len(m.get("content", "")) for m in messages)

            accumulated: list[str] = []

            def stream_callback(delta: str) -> None:
                if not delta:
                    return
                accumulated.append(delta)
                if on_delta is not None:
                    on_delta(delta, "".join(accumulated))

            iteration_budget = IterationBudget(self._max_iterations)
            agent = AIAgent(
                model=model,
                provider=self.settings.hermes_provider,
                enabled_toolsets=list(toolsets) or None,
                max_tokens=max_tokens,
                max_iterations=self._max_iterations,
                iteration_budget=iteration_budget,
                request_overrides=self._request_overrides(model, temperature),
                quiet_mode=True,
                verbose_logging=False,
                platform="api_server",
                skip_memory=self._skip_memory,
            )

            result = agent.run_conversation(
                user_message,
                system_message=system_message,
                stream_callback=stream_callback if stream else None,
            )
            if iteration_budget.used >= iteration_budget.max_total:
                raise RuntimeError(
                    f"iteration budget exhausted ({iteration_budget.used}/{iteration_budget.max_total})"
                )
            content = str(result.get("final_response") or "")
            if stream and on_delta is not None and content and not accumulated:
                on_delta(content, content)

            tokens_in = int(getattr(agent, "session_prompt_tokens", 0) or 0)
            tokens_out = int(getattr(agent, "session_completion_tokens", 0) or 0)
            if tokens_in or tokens_out:
                usage = Usage(tokens_in=tokens_in, tokens_out=tokens_out, estimated=False)
            else:
                usage = Usage(
                    tokens_in=_estimate_tokens("x" * prompt_chars),
                    tokens_out=_estimate_tokens(content),
                    estimated=True,
                )
            return ChatResult(content=content, usage=usage, model=model)
        finally:
            self._restore_hermes_home(previous_home)
