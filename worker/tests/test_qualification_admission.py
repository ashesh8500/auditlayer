"""No-network admission regressions for the operator's real qualification pin."""
from dataclasses import replace
import json
from pathlib import Path

import pytest
from auditlayer_worker.qualify_research import qualify
from auditlayer_worker.research import ResearchPolicy
from test_openrouter_production import settings


def candidate():
    return json.loads((Path(__file__).parent / 'fixtures/product-strategy-v3/qualification-candidate.json').read_text())


def test_live_request_at_actual_contract_never_builds_generator(settings, tmp_path, monkeypatch):
    monkeypatch.setattr('auditlayer_worker.qualify_research.build_generator',
                        lambda *args: pytest.fail('unadmitted provider dispatch'))
    output = tmp_path / 'must-not-exist'
    with pytest.raises(RuntimeError, match=r'token_cap>=1398976; cost_cap_usd>=0.206253'):
        qualify(replace(settings, token_cap=120000, cost_cap_usd=3), candidate(), output, execute=True)
    assert not output.exists()


def test_reducing_search_result_input_estimate_is_not_an_enforced_bound():
    pin = candidate()['pin']
    pin['research_policy']['context_tokens'] = 31744
    pin['research_policy']['aggregate_token_cap'] = 120000
    with pytest.raises(RuntimeError, match='invalid_research_policy'):
        ResearchPolicy.from_pin(pin)


def test_exact_existing_policy_minimum_is_dry_run_only(settings, tmp_path):
    result = qualify(replace(settings, token_cap=1398976, cost_cap_usd=.206253),
                     candidate(), tmp_path / 'dry', execute=False)
    assert result['token_cap'] == 1398976
    assert result['upstream_ceiling_usd'] == .206253
    assert not (tmp_path / 'dry').exists()
