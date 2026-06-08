"""In-process Hermes client via ``run_agent.AIAgent`` (HERMES_MODE=inprocess)."""

from __future__ import annotations

import sys
from typing import Callable, Iterable

from .hermes import ChatResult, Usage, _estimate_tokens
from .hermes_runtime import resolve_agent_root
from .config import WorkerSettings


class InProcessHermesClient:
    """Drop-in replacement for :class:`~auditlayer_worker.hermes.HermesClient`."""

    def __init__(self, settings: WorkerSettings) -> None:
        self.settings = settings
        self._agent_root = resolve_agent_root(settings)
        self._ensure_import_path()

    @property
    def api_base(self) -> str:
        return self.settings.hermes_api_base

    def _ensure_import_path(self) -> None:
        root = str(self._agent_root)
        if root not in sys.path:
            sys.path.insert(0, root)

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
    ) -> ChatResult:
        del temperature  # AIAgent reads temperature from Hermes config / request_overrides.

        from run_agent import AIAgent  # type: ignore[import-not-found]

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

        agent = AIAgent(
            model=model,
            enabled_toolsets=list(toolsets) or None,
            max_tokens=max_tokens,
            quiet_mode=True,
            verbose_logging=False,
            platform="api_server",
            skip_memory=True,
        )

        result = agent.run_conversation(
            user_message,
            system_message=system_message,
            stream_callback=stream_callback if stream else None,
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
