"""Explicit ALM-owned OpenRouter completion through the existing OpenAI SDK.

No credential discovery, engineering profiles, model fallback, or hidden SDK retry.
The existing Linux containment bounds the entire request, not just socket reads.
"""
from __future__ import annotations

import math
import os
import time
from types import SimpleNamespace
from uuid import uuid4

import httpx

from .hermes import ChatResult, Usage
from .billing import InferenceReservation
from .model_execution.containment import one_call

MODEL = "deepseek/deepseek-v4-flash-0731"
BASE_URL = "https://openrouter.ai/api/v1"


def inspect_key_policy(key: str, *, transport=None) -> tuple[dict, list[str]]:
    """Explicit release-preflight GET only; never inference or credential discovery.

    Report provider limits as supplied, including null/unbounded. This neither
    changes limits nor substitutes them for application run/credit admission.
    """
    errors = []
    with httpx.Client(timeout=10, trust_env=False, follow_redirects=False, transport=transport) as client:
        response = client.get(BASE_URL + "/key", headers={"Authorization": "Bearer " + key})
        response.raise_for_status()
        data = response.json()["data"]
    metadata = {}
    for wire, name in (("limit", "limit_usd"), ("limit_remaining", "remaining_usd"), ("usage", "usage_usd")):
        value = data.get(wire)
        metadata[name] = value if type(value) in (int, float) and math.isfinite(value) and value >= 0 else None
    metadata["is_free_tier"] = data.get("is_free_tier") is True
    metadata["expires_at"] = data.get("expires_at") if isinstance(data.get("expires_at"), str) else None
    metadata["limit_reset"] = data.get("limit_reset") if data.get("limit_reset") in ("daily", "weekly", "monthly") else None
    if data.get("limit") is not None and not metadata["remaining_usd"]:
        errors.append("OpenRouter key has unknown or exhausted remaining budget")
    if metadata["is_free_tier"]:
        errors.append("OpenRouter production requires a paid product key")
    return metadata, errors


def safe_receipts(calls):
    """Allowlisted non-content telemetry for the existing service-only run JSON."""
    import re
    identifiers = {"attempt_id", "provider", "requested_model", "response_model", "response_id",
                   "upstream_provider", "correlation_id", "usage_status", "cost_source", "status"}
    numbers = {"tokens_in", "tokens_out", "cost_usd", "latency_ms", "retry_count",
               "reserved_usd", "customer_charge_usd", "input_bound", "output_bound"}
    result = []
    for call in calls[:2]:
        if not isinstance(call, dict):
            continue
        safe = {}
        for key, value in call.items():
            if key in identifiers and (value is None or
                    isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_./: -]{1,160}", value)):
                safe[key] = value
            elif key in numbers and (value is None or isinstance(value, (int, float)) and not isinstance(value, bool)
                                     and math.isfinite(value) and value >= 0):
                safe[key] = value
        result.append(safe)
    return result


class ProviderCallError(RuntimeError):
    def __init__(self, code, telemetry):
        super().__init__(code)
        self.telemetry = {**telemetry, "status": "failed", "customer_charge_usd": 0}


class _SDKCall:
    def __init__(self, key, timeout, prices):
        self.key, self.timeout, self.prices = key, timeout, prices

    def complete(self, request, model):
        from openai import OpenAI
        with OpenAI(api_key=self.key, base_url=BASE_URL, max_retries=0,
                    timeout=self.timeout,
                    http_client=httpx.Client(trust_env=False, follow_redirects=False,
                                            timeout=self.timeout)) as client:
            return client.chat.completions.create(
                model=model, messages=request.messages, max_tokens=request.max_tokens,
                temperature=request.temperature, stream=False, n=1,
                response_format={"type": "json_object"},
                extra_body={"provider": {"allow_fallbacks": False, "require_parameters": True,
                                         "max_price": {"prompt": self.prices[0], "completion": self.prices[1]}},
                            "reasoning": {"enabled": False}, "usage": {"include": True}},
            ).model_dump()


def chat(settings, messages, model, *, toolsets=(), max_tokens=32000,
         temperature=0.2, correlation_id="", reservation=None, on_receipt=None):
    if model != MODEL or settings.hermes_model != MODEL:
        raise RuntimeError("ALM OpenRouter model must be " + MODEL)
    if tuple(toolsets):
        raise ValueError("AuditLayer inference is tool-free")
    key = os.environ.get("ALM_OPENROUTER_API_KEY")
    if not key:
        raise RuntimeError("ALM_OPENROUTER_API_KEY is required; no credential fallback")
    timeout = min(settings.hermes_timeout_seconds, 150.0)
    if not math.isfinite(timeout) or timeout <= 0:
        raise RuntimeError("inference reservation requires a positive timeout")
    reservation = reservation if reservation is not None else InferenceReservation()
    reserved = reservation.reserve(settings, messages, max_tokens)
    started = time.monotonic()
    telemetry = {
        "provider": "openrouter", "requested_model": model,
        "correlation_id": correlation_id or uuid4().hex,
        "retry_count": reservation.calls - 1, "reserved_usd": reserved,
        "input_bound": 1024 + sum(len(m["content"].encode("utf-8")) + 64 for m in messages),
        "output_bound": max_tokens,
        "usage_status": "unknown", "cost_usd": None, "cost_source": "unknown",
        "tokens_in": None, "tokens_out": None,
        "attempt_id": uuid4().hex, "status": "reserved",
    }
    def record(code):
        if on_receipt is not None:
            try:
                on_receipt(telemetry)
            except Exception as exc:
                raise ProviderCallError(code, telemetry) from exc
    record("openrouter_reservation_persistence_failed")
    envelope = one_call(_SDKCall(key, timeout, (settings.price_in_per_mtok, settings.price_out_per_mtok)), SimpleNamespace(
        model=model, messages=messages, max_tokens=max_tokens, temperature=temperature), started + timeout)
    telemetry["latency_ms"] = round((time.monotonic() - started) * 1000, 3)
    if "error" in envelope:
        telemetry.update(status="failed", customer_charge_usd=0)
        record("openrouter_receipt_persistence_failed")
        raise ProviderCallError("openrouter_" + envelope["error"], telemetry)
    raw = envelope["raw"]
    usage = raw.get("usage") or {}
    cost = usage.get("cost")
    if isinstance(cost, bool) or not isinstance(cost, (int, float)) or not math.isfinite(cost) or cost < 0:
        cost = None
    valid_tokens = all(type(usage.get(k)) is int and usage[k] >= 0
                       for k in ("prompt_tokens", "completion_tokens"))
    tokens_in = usage["prompt_tokens"] if valid_tokens else 0
    tokens_out = usage["completion_tokens"] if valid_tokens else 0
    source = "provider_actual" if cost is not None else "unknown"
    if cost is None and valid_tokens:
        cost = round((tokens_in * settings.price_in_per_mtok +
                      tokens_out * settings.price_out_per_mtok) / 1_000_000, 12)
        source = "rate_estimated"
    telemetry.update({
        "usage_status": "actual" if valid_tokens else "unknown",
        "tokens_in": tokens_in if valid_tokens else None,
        "tokens_out": tokens_out if valid_tokens else None,
        "cost_usd": cost, "cost_source": source,
        "provider": "openrouter", "requested_model": model,
        "response_model": raw.get("model"), "response_id": raw.get("id"),
        "upstream_provider": raw.get("provider"),
        "status": "completed",
    })
    choices = raw.get("choices") or []
    choice = choices[0] if choices else {}
    content = (choice.get("message") or {}).get("content")
    if (raw.get("model") != MODEL or choice.get("finish_reason") != "stop"
            or choice.get("error") or not isinstance(content, str)
            or (choice.get("message") or {}).get("tool_calls")):
        telemetry.update(status="failed", customer_charge_usd=0)
        record("openrouter_receipt_persistence_failed")
        raise ProviderCallError("openrouter_response_rejected", telemetry)
    record("openrouter_receipt_persistence_failed")
    return ChatResult(content=content, model=model,
                      usage=Usage(tokens_in, tokens_out, estimated=not valid_tokens,
                                  cost_usd=cost, cost_source=source),
                      telemetry=telemetry)
