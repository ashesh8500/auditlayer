"""In-process Hermes client via ``run_agent.AIAgent`` (HERMES_MODE=inprocess)."""

from __future__ import annotations

import os
import sys
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Callable, Iterable

from .hermes import ChatResult, Usage, _estimate_tokens
from .hermes_runtime import resolve_agent_root
from .config import WorkerSettings
from .hermes_home_scope import HERMES_HOME_LOCK


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

    def collect_research(self, audit) -> str:
        """Run a fixed, parallel web sweep without an open-ended model loop."""
        from model_tools import handle_function_call  # type: ignore[import-not-found]

        handle = str(audit.handle).strip().lstrip("@")
        platform = str(audit.platform).strip()
        queries = (
            f'"{handle}" {platform}',
            f'"{handle}" social media followers engagement',
            f'"{handle}" content creator brand',
        )

        def search(query: str) -> str:
            return handle_function_call(
                "web_search",
                {"query": query, "limit": 5},
                task_id=f"audit-{audit.id}-research",
                user_task="bounded public account research",
                enabled_toolsets=["web"],
            )

        with HERMES_HOME_LOCK:
            account_home = os.environ.get("HERMES_HOME")
            os.environ["HERMES_HOME"] = str(Path.home() / ".hermes")
            try:
                with ThreadPoolExecutor(max_workers=len(queries)) as pool:
                    results = list(pool.map(search, queries))
            finally:
                if account_home is None:
                    os.environ.pop("HERMES_HOME", None)
                else:
                    os.environ["HERMES_HOME"] = account_home

        verified: list[dict] = []
        seen_urls: set[str] = set()
        for raw in results:
            try:
                payload = json.loads(raw)
            except (TypeError, json.JSONDecodeError):
                continue
            web = (payload.get("data") or {}).get("web") if payload.get("success") else None
            for item in web or []:
                url = str(item.get("url") or "")
                if not url or url in seen_urls:
                    continue
                seen_urls.add(url)
                verified.append(
                    {
                        "url": url,
                        "title": str(item.get("title") or ""),
                        "description": str(item.get("description") or ""),
                    }
                )
        if not verified:
            import logging
            logging.getLogger("auditlayer").warning("collect_research: no web evidence found — proceeding without web research")
        return json.dumps({"web": verified[:8]}, ensure_ascii=False)[:12000]


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

        if self.settings.hermes_provider != "deepseek" or model != "deepseek-v4-flash":
            raise RuntimeError("AuditLayer embedded generation requires DeepSeek V4 Flash")

        HERMES_HOME_LOCK.acquire()
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
            requested_toolsets = list(toolsets)
            no_tools = not requested_toolsets
            agent = AIAgent(
                model=model,
                provider=self.settings.hermes_provider,
                enabled_toolsets=requested_toolsets,
                max_tokens=max_tokens,
                max_iterations=self._max_iterations,
                iteration_budget=iteration_budget,
                request_overrides=self._request_overrides(model, temperature),
                quiet_mode=True,
                verbose_logging=False,
                platform="api_server",
                skip_context_files=no_tools,
                skip_memory=self._skip_memory or no_tools,
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
            HERMES_HOME_LOCK.release()
