"""Offline boundary tests; no provider credentials or paid calls."""
from dataclasses import replace
import pytest


def test_normalize_usage_preserves_unknown_and_actual_zero():
    from auditlayer_worker.model_execution import normalize_usage
    assert normalize_usage(None).state == 'unknown'
    assert normalize_usage({}).input_tokens is None
    usage = normalize_usage({'prompt_tokens': 0, 'completion_tokens': 0})
    assert usage.state == 'actual'
    assert usage.input_tokens == usage.output_tokens == 0
    assert normalize_usage({'prompt_tokens': 10}).state == 'unknown'
    assert normalize_usage({'prompt_tokens': True, 'completion_tokens': 2}).state == 'unknown'
    assert normalize_usage({'prompt_tokens': -1, 'completion_tokens': 2}).state == 'unknown'


def test_usage_provenance_and_details_do_not_invent_invoiced_cost():
    from auditlayer_worker.model_execution import normalize_usage
    estimated = normalize_usage({'prompt_tokens': 10, 'completion_tokens': 2, 'estimated': True})
    assert estimated.state == 'estimated'
    assert normalize_usage({'prompt_tokens': 10, 'completion_tokens': 2, 'total_tokens': 99}).state == 'unknown'
    actual = normalize_usage({'prompt_tokens': 10, 'completion_tokens': 4,
        'prompt_tokens_details': {'cached_tokens': 3},
        'completion_tokens_details': {'reasoning_tokens': 2}})
    assert actual.cached_input_tokens == 3 and actual.reasoning_tokens == 2
    assert normalize_usage({'prompt_tokens': 10, 'completion_tokens': 2,
        'prompt_cache_hit_tokens': 11}).state == 'unknown'


def test_catalog_is_pinned_and_unqualified_routes_stay_unavailable():
    from auditlayer_worker.model_execution.catalog import CATALOG, resolve
    default = CATALOG['deepseek-v4-flash']
    assert default.model_version == 'DeepSeek-V4-Flash-0731'
    assert default.input_rate == 440000 and default.output_rate == 1320000
    frontier = CATALOG['gpt-5.6-sol']
    assert frontier.provider == 'openai'
    assert frontier.input_rate == 5000000  # worst case cache write, not base $4
    assert frontier.output_rate == 20000000
    assert frontier.worst_case(1000, 1000) == 25000
    for model in CATALOG.values():
        assert model.unavailable_reason
    with pytest.raises(ValueError, match='route'):
        resolve('openai-codex', 'gpt-5.6-sol', 'https://api.openai.com/v1')
    with pytest.raises(ValueError, match='route'):
        resolve('openai', 'gpt-5.6-sol', 'https://attacker.invalid/v1')
