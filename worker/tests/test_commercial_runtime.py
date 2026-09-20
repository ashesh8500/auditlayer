from dataclasses import replace
from types import SimpleNamespace
import pytest
from test_openrouter_production import settings
from auditlayer_worker.billing import InferenceReservation, InferenceReservationError


def pin():
    return dict(provider='openrouter',model='deepseek/deepseek-v4-flash-0731',
        data_route='https://openrouter.ai/api/v1',rate_version='test',
        input_microusd_per_mtok=1000000,output_microusd_per_mtok=2000000,
        max_input_tokens=16000,max_output_tokens=8000,max_calls=1,
        research_microusd=100000,upstream_microusd=132000,retail_microusd=396000,
        reservation_id='reservation',brief_id='brief')


def test_quote_limits_are_enforced_before_dispatch(settings):
    from auditlayer_worker.commercial import pinned_settings
    app=SimpleNamespace(token_cap=120000,cost_cap_usd=3)
    config=pinned_settings(settings,app,pin())
    assert config.price_in_per_mtok == 1
    assert config.price_out_per_mtok == 2
    assert config.max_tokens == 8000
    hold=InferenceReservation()
    hold.reserve(config,[{'content':'x'}],100)
    with pytest.raises(InferenceReservationError): hold.reserve(config,[{'content':'x'}],100)
    with pytest.raises(InferenceReservationError): InferenceReservation().reserve(config,[{'content':'x'*16000}],100)
    with pytest.raises(InferenceReservationError): InferenceReservation().reserve(config,[{'content':'x'}],8001)


def test_commercial_research_never_dispatches_unpriced_managed_tools(settings, monkeypatch):
    from auditlayer_worker.commercial import pinned_settings
    from auditlayer_worker.hermes_inprocess import InProcessHermesClient
    config=pinned_settings(settings,SimpleNamespace(token_cap=120000,cost_cap_usd=3),pin())
    monkeypatch.setattr('auditlayer_worker.hermes_inprocess._managed_search_results',lambda *a,**k: pytest.fail('unpriced paid research'))
    monkeypatch.setattr('auditlayer_worker.hermes_inprocess._public_search_index',lambda *a,**k: [])
    assert InProcessHermesClient(config).collect_research(SimpleNamespace(id='audit',handle='example',platform='instagram'))=='{"web": []}'


def test_only_successful_reference_usage_debits_and_unknown_stays_unknown():
    from auditlayer_worker.commercial import terminal_payload
    calls=[dict(status='format_rejected',tokens_in=500,tokens_out=500,cost_source='provider_actual',cost_usd=.002),
           dict(status='completed',tokens_in=100,tokens_out=50,cost_source='rate_estimated',cost_usd=.0002)]
    summary=SimpleNamespace(status='ready',stage_timings={'_inference':calls})
    payload=terminal_payload('audit','worker',pin(),summary,calls)
    assert payload['customer_debit_microusd']==600
    assert payload['actual_upstream_microusd'] is None
    summary.status='needs_review'
    assert terminal_payload('audit','worker',pin(),summary,calls)['customer_debit_microusd']==0
