"""Offline generator regression; all evidence and responses are synthetic."""
import json
from copy import deepcopy

import pytest
from auditlayer_worker.generation import GenerationStageError

from auditlayer_worker.openrouter import MODEL
from test_factual_repair import connected_case, analysis_form
from test_generation_runtime import _Client, _generator


def test_measured_support_reason_reaches_actual_correction_and_metadata():
    audit, metrics = connected_case()
    good = analysis_form()
    bad = deepcopy(good)
    # Two selected observations, but only one is a measured post. A calculation
    # does not stand in for the posts listed in its evidence_ids.
    from auditlayer_worker import factual
    snapshot = factual.connected_snapshot(metrics)
    assert snapshot is not None
    calc = snapshot['calculations'][0]
    bad['observations'].append({'source_id': calc['source_id'], 'excerpt': calc['description']})
    bad['interpretations'][0]['observation_ids'] = ['IG#post1', calc['source_id']]
    client = _Client([json.dumps(bad), json.dumps(good)])
    gen = _generator(client)
    gen.model = MODEL
    result = gen.generate(audit, lambda *a: None, research_cache='{"web":[]}', ig_metrics=metrics)
    sent = client.calls[1]['messages'][0]['content']
    assert 'connected_support_measured_posts' in sent
    assert 'interpretations[].observation_ids' in sent
    assert 'at least two distinct selected IG#post' in sent
    assert result.stage_timings['_validation'][0]['code'] == 'connected_support_measured_posts'
    assert len(client.calls) == 2 and not client.research_calls
    assert client.calls[1]['session_id'] == ''
    assert all(call['toolsets'] == () and call['model'] == MODEL for call in client.calls)
    assert client.calls[1]['max_tokens'] <= 6000
    assert 'Hypothesis H1' in result.html and 'Experiment A1' in result.html
    assert 'finished lentil bowl' in result.html and 'Success measure' in result.html


@pytest.mark.parametrize('mutation,code', [
    ('question', 'connected_support_domain'),
    ('support', 'connected_support_domain'),
    ('metric', 'connected_support_domain'),
    ('focus', 'connected_focus_treatment'),
    ('change', 'connected_question_change'),
])
def test_both_rejections_keep_static_reason_and_zero_charge(mutation, code):
    audit, metrics = connected_case()
    bad = analysis_form()
    if mutation == 'question': bad['interpretations'][0]['question'] = 'HOSTILE_PRIVATE_TEXT'
    if mutation == 'support': bad['interpretations'][0]['observation_ids'] = ['IG#post1', 'HOSTILE_PRIVATE_TEXT']
    if mutation == 'metric': bad['interpretations'][0]['metric'] = 'HOSTILE_PRIVATE_TEXT'
    if mutation == 'focus': bad['recommendations'][0]['treatment']['phrase'] = 'ingredient prep'
    if mutation == 'change': bad['interpretations'][0]['question'] = 'format_transfer'
    class ReceiptedClient(_Client):
        def chat(self, **kwargs):
            from dataclasses import replace
            return replace(super().chat(**kwargs), telemetry={'cost_usd': 0.001, 'status': 'completed'})
    client = ReceiptedClient([json.dumps(bad), json.dumps(bad)])
    gen = _generator(client)
    gen.model = MODEL
    with pytest.raises(GenerationStageError) as caught:
        gen.generate(audit, lambda *a: None, research_cache='{"web":[]}', ig_metrics=metrics)
    error = caught.value
    reasons = error.stage_timings['_validation']
    assert [r['code'] for r in reasons] == [code, code]
    assert [r['stage'] for r in reasons] == ['analysis', 'format_correction']
    assert code in client.calls[1]['messages'][0]['content']
    assert 'HOSTILE_PRIVATE_TEXT' not in json.dumps(reasons) + json.dumps([c['messages'] for c in client.calls]) + str(error)
    assert len(client.calls) == 2 and not client.research_calls
    assert error.error_code == 'structured_output_invalid' and not error.retryable
    assert all(r['customer_charge_usd'] == 0 for r in error.stage_timings['_inference'])
    assert all(r['cost_usd'] == 0.001 for r in error.stage_timings['_inference'])


@pytest.mark.parametrize("factual_mode", [True, False])
def test_hostile_untyped_exception_never_enters_correction_or_stage_metadata(monkeypatch, factual_mode):
    from auditlayer_worker import factual
    def hostile(*args, **kwargs):
        error = ValueError('SECRET_EXCEPTION_TEXT')
        setattr(error, 'code', 'SECRET_EXCEPTION_ATTRIBUTE')
        raise error
    if factual_mode:
        monkeypatch.setattr(factual, 'render', hostile)
    else:
        monkeypatch.setattr('auditlayer_worker.generation.assemble_structured_report_html', hostile)
    audit, metrics = connected_case()
    client = _Client([json.dumps(analysis_form())] * 2)
    gen = _generator(client)
    if factual_mode:
        gen.model = MODEL
    with pytest.raises(GenerationStageError) as caught:
        gen.generate(audit, lambda *a: None, research_cache='{"web":[]}', ig_metrics=metrics)
    reasons = caught.value.stage_timings['_validation']
    assert [r['code'] for r in reasons] == ['analysis_contract_invalid'] * 2
    assert 'SECRET_EXCEPTION' not in json.dumps([c['messages'] for c in client.calls]) + json.dumps(caught.value.stage_timings)


def test_outgoing_prompt_matches_connected_constraints():
    audit, metrics = connected_case()
    client = _Client([json.dumps(analysis_form())])
    gen = _generator(client)
    gen.model = MODEL
    gen.generate(audit, lambda *a: None, research_cache='{"web":[]}', ig_metrics=metrics)
    sent = client.calls[0]['messages'][-1]['content']
    for rule in ('distinct selected IG#post', 'CALC and WEB', 'exactly equal',
                 'if and only if', 'case-insensitively', 'unique experiment design'):
        assert rule in sent

