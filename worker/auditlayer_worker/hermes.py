"""Low-level Hermes Gateway client (OpenAI-compatible) + diagnostics.

Talks to the Hermes Gateway ``/v1/chat/completions`` endpoint. Supports a
streaming mode so the worker can emit a live, agentic progress timeline while
the model researches and composes the report.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import socket
import time
from typing import Callable, Iterable
from urllib.parse import urlparse

import httpx


@dataclass(frozen=True)
class Usage:
    tokens_in: int
    tokens_out: int
    estimated: bool = False


@dataclass(frozen=True)
class ChatResult:
    content: str
    usage: Usage
    model: str


@dataclass(frozen=True)
class HermesValidationResult:
    ok: bool
    endpoint: str
    latency_ms: float
    model: str
    skipped: bool = False
    error: str = ""


@dataclass(frozen=True)
class HermesDiagnosticResult:
    ok: bool
    endpoint: str
    host: str
    port: int
    tcp_reachable: bool
    auth_ok: bool
    auth_status_code: int | None
    gateway_state_path: str
    gateway_state: str
    api_server_state: str
    error: str = ""
    recommendation: str = ""


def _estimate_tokens(text: str) -> int:
    # Rough heuristic when the gateway does not return a usage block.
    return max(1, round(len(text) / 4))


class HermesClient:
    def __init__(
        self,
        api_base: str,
        api_key: str | None,
        timeout_seconds: float = 600.0,
    ) -> None:
        self.api_base = api_base.rstrip("/")
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

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
        """Run a chat completion. When ``stream`` is True, ``on_delta`` is
        called with (delta_text, accumulated_text) for each token chunk."""

        prompt_chars = sum(len(m.get("content", "")) for m in messages)
        if stream:
            return self._chat_stream(
                messages,
                model,
                toolsets=toolsets,
                max_tokens=max_tokens,
                temperature=temperature,
                on_delta=on_delta,
                prompt_chars=prompt_chars,
            )
        return self._chat_blocking(
            messages,
            model,
            toolsets=toolsets,
            max_tokens=max_tokens,
            temperature=temperature,
            prompt_chars=prompt_chars,
        )

    def _payload(self, messages, model, toolsets, max_tokens, temperature) -> dict:
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if toolsets:
            payload["enabled_toolsets"] = list(toolsets)
        return payload

    def _chat_blocking(
        self, messages, model, *, toolsets, max_tokens, temperature, prompt_chars
    ) -> ChatResult:
        url = f"{self.api_base}/chat/completions"
        payload = self._payload(messages, model, toolsets, max_tokens, temperature)
        response = httpx.post(url, headers=self._headers(), json=payload, timeout=self.timeout_seconds)
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        usage = self._usage_from_block(data.get("usage"), prompt_chars, content)
        return ChatResult(content=content, usage=usage, model=data.get("model", model))

    def _chat_stream(
        self, messages, model, *, toolsets, max_tokens, temperature, on_delta, prompt_chars
    ) -> ChatResult:
        url = f"{self.api_base}/chat/completions"
        payload = self._payload(messages, model, toolsets, max_tokens, temperature)
        payload["stream"] = True
        payload["stream_options"] = {"include_usage": True}

        accumulated: list[str] = []
        usage_block: dict | None = None
        with httpx.stream(
            "POST", url, headers=self._headers(), json=payload, timeout=self.timeout_seconds
        ) as response:
            response.raise_for_status()
            for raw_line in response.iter_lines():
                if not raw_line:
                    continue
                line = raw_line.strip()
                if line.startswith("data:"):
                    line = line[len("data:") :].strip()
                if line == "[DONE]":
                    break
                if not line.startswith("{"):
                    continue
                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if chunk.get("usage"):
                    usage_block = chunk["usage"]
                choices = chunk.get("choices") or []
                if not choices:
                    continue
                delta = choices[0].get("delta") or {}
                piece = delta.get("content") or ""
                if piece:
                    accumulated.append(piece)
                    if on_delta is not None:
                        on_delta(piece, "".join(accumulated))

        content = "".join(accumulated)
        usage = self._usage_from_block(usage_block, prompt_chars, content)
        return ChatResult(content=content, usage=usage, model=model)

    @staticmethod
    def _usage_from_block(block: dict | None, prompt_chars: int, content: str) -> Usage:
        if block and (block.get("prompt_tokens") or block.get("completion_tokens")):
            return Usage(
                tokens_in=int(block.get("prompt_tokens", 0)),
                tokens_out=int(block.get("completion_tokens", 0)),
                estimated=False,
            )
        return Usage(
            tokens_in=_estimate_tokens("x" * prompt_chars),
            tokens_out=_estimate_tokens(content),
            estimated=True,
        )


# ---------------------------------------------------------------------------
# Diagnostics (reused from src/auditlayer/hermes.py, adapted)
# ---------------------------------------------------------------------------


def validate_hermes(client: HermesClient, model: str) -> HermesValidationResult:
    url = f"{client.api_base}/chat/completions"
    started = time.time()
    try:
        result = client.chat(
            messages=[
                {"role": "system", "content": "You are a health-check endpoint. Reply with OK only."},
                {"role": "user", "content": "Return OK."},
            ],
            model=model,
            max_tokens=8,
            temperature=0,
            stream=False,
        )
        latency_ms = round((time.time() - started) * 1000, 2)
        if "ok" not in result.content.lower():
            return HermesValidationResult(
                False, url, latency_ms, model, error=f"Unexpected response: {result.content[:120]}"
            )
        return HermesValidationResult(True, url, latency_ms, model)
    except Exception as exc:  # noqa: BLE001 - surface the exact error to the operator
        latency_ms = round((time.time() - started) * 1000, 2)
        return HermesValidationResult(False, url, latency_ms, model, error=str(exc))


def diagnose_hermes(client: HermesClient, model: str) -> HermesDiagnosticResult:
    endpoint = f"{client.api_base}/chat/completions"
    parsed = urlparse(endpoint)
    host = parsed.hostname or "127.0.0.1"
    if parsed.port:
        port = parsed.port
    elif parsed.scheme == "https":
        port = 443
    else:
        port = 80

    tcp_reachable = False
    tcp_error = ""
    try:
        with socket.create_connection((host, port), timeout=2):
            tcp_reachable = True
    except OSError as exc:
        tcp_error = str(exc)

    gateway_state_path = Path.home() / ".hermes" / "gateway_state.json"
    gateway_state = "unknown"
    api_server_state = "unknown"
    state_error = ""
    if gateway_state_path.exists():
        try:
            state = json.loads(gateway_state_path.read_text(encoding="utf-8"))
            gateway_state = str(state.get("gateway_state") or "unknown")
            platforms = state.get("platforms") or {}
            api_server = platforms.get("api_server") or {}
            api_server_state = str(api_server.get("state") or "not_configured")
        except (OSError, json.JSONDecodeError) as exc:
            state_error = f"Could not read Hermes gateway state: {exc}"
    else:
        state_error = f"Hermes gateway state file is missing at {gateway_state_path}"

    errors = [part for part in [tcp_error, state_error] if part]
    auth_ok = False
    auth_status_code: int | None = None
    if tcp_reachable:
        models_url = f"{client.api_base}/models"
        try:
            response = httpx.get(models_url, headers=client._headers(), timeout=5)
            auth_status_code = response.status_code
            auth_ok = response.status_code < 400
            if not auth_ok:
                errors.append(f"Hermes API auth check returned HTTP {response.status_code} for {models_url}")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"Hermes API auth check failed for {models_url}: {exc}")

    ok = tcp_reachable and auth_ok and gateway_state == "running" and api_server_state == "connected"
    recommendation = ""
    if not ok:
        if auth_status_code == 401:
            recommendation = (
                "HERMES_API_KEY does not match the gateway API_SERVER_KEY. Set HERMES_API_KEY to the "
                "gateway's API_SERVER_KEY and rerun `python -m auditlayer_worker diagnose-hermes`."
            )
        elif not tcp_reachable or api_server_state != "connected":
            recommendation = (
                "The Hermes Gateway OpenAI-compatible api_server is not listening at "
                f"{client.api_base}. Run the worker ON the host where the gateway api_server is "
                "enabled (e.g. the Hetzner VM), or enable the api_server platform locally via "
                "`hermes gateway setup` (add an API_SERVER_KEY) and restart with "
                "`hermes gateway restart`, then rerun diagnose-hermes."
            )
        else:
            recommendation = (
                "Start or repair Hermes Gateway, set HERMES_API_BASE to the api_server endpoint, "
                "and rerun diagnose-hermes."
            )
    return HermesDiagnosticResult(
        ok=ok,
        endpoint=endpoint,
        host=host,
        port=port,
        tcp_reachable=tcp_reachable,
        auth_ok=auth_ok,
        auth_status_code=auth_status_code,
        gateway_state_path=str(gateway_state_path),
        gateway_state=gateway_state,
        api_server_state=api_server_state,
        error="; ".join(errors),
        recommendation=recommendation,
    )
