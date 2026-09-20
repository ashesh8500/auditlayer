"""Documentation-evaluated candidates; NOT a live selectable product catalog.

Integer USD microunits per million tokens. Admission uses peak/uncached or
cache-write ceilings, never cache discounts. Export to workspace contracts only
after product credential, tokenizer, version and behavioral qualification.
"""
from dataclasses import dataclass
from types import MappingProxyType


@dataclass(frozen=True)
class Model:
    provider: str
    model: str
    model_version: str
    data_route: str
    input_rate: int
    output_rate: int
    rate_version: str
    source: str
    unavailable_reason: str
    max_input: int = 32000
    max_output: int = 18000

    def worst_case(self, incoming: int, outgoing: int) -> int:
        if any(type(n) is not int or n < 0 for n in (incoming, outgoing)):
            raise ValueError('invalid token bound')
        return (incoming * self.input_rate + outgoing * self.output_rate + 999999) // 1000000


CATALOG = MappingProxyType({
    'deepseek-v4-flash': Model(
        'deepseek', 'deepseek-v4-flash', 'DeepSeek-V4-Flash-0731',
        'https://api.deepseek.com', 440000, 1320000,
        'docs-2026-09-19.deepseek-peak.v1',
        'https://api-docs.deepseek.com/quick_start/pricing',
        'Alias only: immutable version dispatch unverified; product adapter qualification pending.'),
    'gpt-5.6-sol': Model(
        'openai', 'gpt-5.6-sol', 'gpt-5.6-sol',
        'https://api.openai.com/v1', 5000000, 20000000,
        'docs-2026-09-19.openai-standard-cache-write-ceiling.v1',
        'https://developers.openai.com/api/docs/models/gpt-5.6.md',
        'Product credential, tokenizer and behavioral qualification not performed.'),
})


def resolve(provider: str, model: str, data_route: str) -> Model:
    candidate = CATALOG.get(model)
    if candidate is None or (candidate.provider, candidate.data_route) != (provider, data_route):
        raise ValueError('invalid provider/model/data route')
    return candidate
