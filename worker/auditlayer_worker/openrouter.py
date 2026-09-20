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
                   "upstream_provider", "correlation_id", "usage_status", "cost_source", "status",
                   "stage", "research_version", "search_engine", "search_mode", "search_cost_source"}
    numbers = {"tokens_in", "tokens_out", "cost_usd", "latency_ms", "retry_count",
               "reserved_usd", "customer_charge_usd", "input_bound", "output_bound",
               "max_results", "search_fee_bound_usd", "search_cost_usd", "inference_cost_usd"}
    result = []
    if len(calls) > 3:
        raise ValueError("inference receipt count exceeded")
    for call in calls:
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
        from .research import PLUGIN
        research = getattr(request, "research", False)
        with OpenAI(api_key=self.key, base_url=BASE_URL, max_retries=0,
                    timeout=self.timeout,
                    http_client=httpx.Client(trust_env=False, follow_redirects=False,
                                            timeout=self.timeout)) as client:
            return client.chat.completions.create(
                model=model, messages=request.messages, max_tokens=request.max_tokens,
                temperature=request.temperature, stream=False, n=1,
                **({} if research else {"response_format": {"type": "json_object"}}),
                extra_body={"provider": {"allow_fallbacks": False, "require_parameters": True,
                                         "max_price": {"prompt": self.prices[0], "completion": self.prices[1], "request": 0}},
                            "reasoning": {"enabled": False}, "usage": {"include": True},
                            **({"plugins": [PLUGIN]} if research else {})},
            ).model_dump()


def chat(settings, messages, model, *, toolsets=(), max_tokens=32000,
         temperature=0.2, correlation_id="", reservation=None, on_receipt=None):
    return _complete(settings, messages, model, toolsets=toolsets, max_tokens=max_tokens,
                     temperature=temperature, correlation_id=correlation_id,
                     reservation=reservation, on_receipt=on_receipt)


def research(settings, audit, *, reservation, on_receipt):
    from .research import research_messages
    messages = research_messages(audit.handle, audit.platform)
    return _complete(settings, messages, MODEL, max_tokens=256, temperature=0,
                     correlation_id="audit-" + str(audit.id), reservation=reservation,
                     on_receipt=on_receipt, research_subject=(audit.handle, audit.platform))


def _complete(settings, messages, model, *, toolsets=(), max_tokens=32000,
              temperature=0.2, correlation_id="", reservation=None, on_receipt=None,
              research_subject=None):
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
    is_research = research_subject is not None
    if is_research and (settings.research_policy is None or on_receipt is None):
        raise RuntimeError("research requires pinned policy and durable recorder")
    reserved = (reservation.reserve_research(settings) if is_research
                else reservation.reserve(settings, messages, max_tokens))
    started = time.monotonic()
    telemetry = {
        "provider": "openrouter", "requested_model": model,
        "correlation_id": correlation_id or uuid4().hex,
        "retry_count": 0 if is_research else reservation.calls - 1, "reserved_usd": reserved,
        "stage": "research" if is_research else "analysis" if reservation.calls == 1 else "correction",
        "input_bound": settings.research_policy.context_tokens if is_research else
            1024 + sum(len(m["content"].encode("utf-8")) + 64 for m in messages),
        "output_bound": max_tokens,
        "usage_status": "unknown", "cost_usd": None, "cost_source": "unknown",
        "tokens_in": None, "tokens_out": None,
        "attempt_id": uuid4().hex, "status": "reserved",
    }
    if is_research:
        telemetry.update(research_version=settings.research_policy.version, search_engine="exa",
                         search_mode="fast", max_results=3, search_fee_bound_usd=.007)
    def record(code):
        if on_receipt is not None:
            try:
                on_receipt(telemetry)
            except Exception as exc:
                raise ProviderCallError(code, telemetry) from exc
    record("openrouter_reservation_persistence_failed")
    envelope = one_call(_SDKCall(key, timeout, (settings.price_in_per_mtok, settings.price_out_per_mtok)), SimpleNamespace(
        model=model, messages=messages, max_tokens=max_tokens, temperature=temperature,
        research=is_research), started + timeout)
    telemetry["latency_ms"] = round((time.monotonic() - started) * 1000, 3)
    if "error" in envelope:
        telemetry.update(status="failed", customer_charge_usd=0)
        record("openrouter_receipt_persistence_failed")
        raise ProviderCallError("openrouter_" + envelope["error"], telemetry)
    raw = envelope.get("raw")
    if (not isinstance(raw, dict) or not isinstance(raw.get('usage') or {}, dict)
            or not isinstance(raw.get('choices'), list) or len(raw['choices']) != 1
            or not isinstance(raw['choices'][0], dict)
            or not isinstance(raw['choices'][0].get('message'), dict)):
        telemetry.update(status='failed', customer_charge_usd=0)
        record('openrouter_receipt_persistence_failed')
        raise ProviderCallError('openrouter_response_rejected', telemetry)
    usage = raw.get("usage") or {}
    if is_research and not isinstance(usage.get('cost_details') or {}, dict):
        telemetry.update(status='failed', customer_charge_usd=0)
        record('openrouter_receipt_persistence_failed')
        raise ProviderCallError('openrouter_response_rejected', telemetry)
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
        if is_research:
            cost += .007
        source = "rate_estimated"
    if is_research:
        details = usage.get("cost_details") or {}
        inference = details.get("upstream_inference_cost")
        if (source == "provider_actual" and type(inference) in (int, float)
                and math.isfinite(inference) and inference >= 0
                and abs(cost - inference - .007) < 1e-9):
            telemetry.update(inference_cost_usd=inference, search_cost_usd=.007,
                             search_cost_source="provider_reconciled")
        else:
            telemetry.update(search_cost_source="included_total_unitemized" if source == "provider_actual"
                             else "rate_estimated" if source == "rate_estimated" else "unknown")
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
    if (raw.get("model") != MODEL or choice.get("finish_reason") not in (("stop", "length") if is_research else ("stop",))
            or choice.get("error") or raw.get("error") or (not is_research and not isinstance(content, str))
            or (is_research and ((valid_tokens and (tokens_in > telemetry["input_bound"] or tokens_out > max_tokens))
                                 or cost is not None and cost > reserved))
            or (choice.get("message") or {}).get("tool_calls")):
        telemetry.update(status="failed", customer_charge_usd=0)
        record("openrouter_receipt_persistence_failed")
        raise ProviderCallError("openrouter_response_rejected", telemetry)
    if is_research:
        from .research import annotation_evidence
        try:
            content = annotation_evidence(choice.get("message", {}).get("annotations"), *research_subject)
        except ValueError as exc:
            telemetry.update(status="failed", customer_charge_usd=0)
            record("openrouter_receipt_persistence_failed")
            raise ProviderCallError("openrouter_annotations_rejected", telemetry) from exc
    record("openrouter_receipt_persistence_failed")
    return ChatResult(content=content, model=model,
                      usage=Usage(tokens_in, tokens_out, estimated=not valid_tokens,
                                  cost_usd=cost, cost_source=source),
                      telemetry=telemetry)
