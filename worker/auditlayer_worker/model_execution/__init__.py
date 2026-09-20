"""Opt-in bounded execution primitives, not wired to production generation.

These dataclasses are internal adapter values, not alternate workspace wire schemas.
No configuration, environment, profile, credential or network access at import time.
"""
from dataclasses import dataclass
from typing import Mapping


@dataclass(frozen=True)
class NormalizedUsage:
    state: str = 'unknown'
    input_tokens: int | None = None
    output_tokens: int | None = None
    cached_input_tokens: int | None = None
    reasoning_tokens: int | None = None


def normalize_usage(raw: Mapping | None) -> NormalizedUsage:
    if not isinstance(raw, Mapping):
        return NormalizedUsage()
    incoming, outgoing = raw.get('prompt_tokens'), raw.get('completion_tokens')
    if (not isinstance(incoming, int) or isinstance(incoming, bool) or incoming < 0
            or not isinstance(outgoing, int) or isinstance(outgoing, bool) or outgoing < 0):
        return NormalizedUsage()
    if raw.get('total_tokens', incoming + outgoing) != incoming + outgoing:
        return NormalizedUsage()
    input_details = raw.get('prompt_tokens_details') or {}
    output_details = raw.get('completion_tokens_details') or {}
    if not isinstance(input_details, Mapping) or not isinstance(output_details, Mapping):
        return NormalizedUsage()
    cached = raw.get('prompt_cache_hit_tokens', input_details.get('cached_tokens'))
    reasoning = output_details.get('reasoning_tokens')
    if any(n is not None and (type(n) is not int or not 0 <= n <= ceiling)
           for n, ceiling in ((cached, incoming), (reasoning, outgoing))):
        return NormalizedUsage()
    state = 'estimated' if raw.get('estimated') else 'actual'
    return NormalizedUsage(state, incoming, outgoing, cached, reasoning)
