"""Per-audit cost estimation for billing/observability.

The worker records ``tokens_in``, ``tokens_out``, and ``cost_usd`` on each
audit. Cost is estimated from token usage using configurable per-million-token
prices (model pricing lives in app_settings/env, not hardcoded), plus a small
fixed data-API allowance per audit for the metered search backends
(Exa web_search/web_extract and xAI x_search).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CostBreakdown:
    token_cost_usd: float
    data_api_cost_usd: float
    total_usd: float
    tokens_in: int
    tokens_out: int
    inference_cost_source: str = "rate_estimated"


class InferenceReservationError(RuntimeError):
    """A deterministic pre-call rejection; never automatically replay upstream."""


@dataclass
class InferenceReservation:
    """Attempt-local upstream ceiling, not customer-wallet/SQL admission.

    Retains worst-case liability on provider errors. Allows one analysis and one
    formatting correction. No SDK retries; no claim that timeout cancels billing.
    """
    tokens: int = 0
    usd: float = 0.0
    calls: int = 0

    def reserve(self, settings, messages, max_tokens):
        import math
        if type(max_tokens) is not int or not 1 <= max_tokens <= min(32000, settings.max_tokens):
            raise InferenceReservationError("inference reservation output bound")
        # Conservative UTF-8 byte ceiling plus chat overhead, not actual usage.
        prompt_bound = 1024 + sum(len(m["content"].encode("utf-8")) + 64 for m in messages)
        prices = (settings.price_in_per_mtok, settings.price_out_per_mtok)
        if any(not math.isfinite(p) or p <= 0 for p in prices):
            raise InferenceReservationError("inference reservation requires positive rate ceilings")
        cost = (prompt_bound * prices[0] + max_tokens * prices[1]) / 1_000_000
        if (prompt_bound > settings.max_input_tokens or self.calls >= settings.max_inference_calls or settings.token_cap <= 0
                or not math.isfinite(settings.cost_cap_usd) or settings.cost_cap_usd <= 0
                or self.tokens + prompt_bound + max_tokens > settings.token_cap
                or self.usd + cost > settings.cost_cap_usd):
            raise InferenceReservationError("inference reservation budget exhausted")
        self.tokens += prompt_bound + max_tokens
        self.usd += cost
        self.calls += 1
        return cost


def estimate_cost(
    tokens_in: int,
    tokens_out: int,
    price_in_per_mtok: float,
    price_out_per_mtok: float,
    data_api_allowance_usd: float = 0.12,
    *,
    inference_calls: list[dict] | None = None,
) -> CostBreakdown:
    token_cost = (tokens_in / 1_000_000) * price_in_per_mtok + (
        tokens_out / 1_000_000
    ) * price_out_per_mtok
    source = "rate_estimated"
    if inference_calls:
        # Keep known spend, including rejected output. Unknown remains explicitly
        # unknown: aggregate is a lower bound, never a zero-cost success/invoice.
        token_cost = sum(call.get("cost_usd") or 0 for call in inference_calls)
        sources = {call.get("cost_source", "unknown") for call in inference_calls}
        source = ("unknown" if "unknown" in sources else "provider_actual"
                  if sources == {"provider_actual"} else "rate_estimated")
    total = round(token_cost + data_api_allowance_usd, 6)
    return CostBreakdown(
        token_cost_usd=round(token_cost, 6),
        data_api_cost_usd=round(data_api_allowance_usd, 4),
        total_usd=total,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        inference_cost_source=source,
    )
