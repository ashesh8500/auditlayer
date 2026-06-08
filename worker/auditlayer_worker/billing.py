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


def estimate_cost(
    tokens_in: int,
    tokens_out: int,
    price_in_per_mtok: float,
    price_out_per_mtok: float,
    data_api_allowance_usd: float = 0.12,
) -> CostBreakdown:
    token_cost = (tokens_in / 1_000_000) * price_in_per_mtok + (
        tokens_out / 1_000_000
    ) * price_out_per_mtok
    total = round(token_cost + data_api_allowance_usd, 4)
    return CostBreakdown(
        token_cost_usd=round(token_cost, 4),
        data_api_cost_usd=round(data_api_allowance_usd, 4),
        total_usd=total,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
    )
