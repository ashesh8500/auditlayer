"""Synthetic product controls, never live inference qualification."""
import json
import pytest
from auditlayer_worker import factual
from test_factual_repair import connected_case
from product_strategy_fixtures import strategy_form



def test_strategy_positive_render_contains_diagnosis_priorities_and_original_briefs():
    audit, metrics = connected_case()
    evidence = factual.packet({'web': []}, audit)
    report = factual.render(audit, json.dumps(strategy_form()), evidence=evidence, ig_metrics=metrics)
    assert 'Descriptive diagnosis' in report
    assert '15.5' in report and '11.5' in report
    assert 'Priority 1' in report and 'Priority 2' in report
    assert 'pantry-to-bowl transformation' in report
    assert 'Proposed effort: medium' in report
    assert 'Dependency: S1' in report
    assert 'not a causal explanation' in report
    assert 'data-factual-contract="strategy-v3"' in report


def public_case():
    from test_generation_runtime import _audit
    audit = _audit()
    audit.goal = 'community'
    rows = [dict(url='https://instagram.com/example/p/a/', title='example pantry tutorial',
                 description='example shares a pantry substitution tutorial and invites readers to suggest alternative ingredients.'),
            dict(url='https://instagram.com/example/p/b/', title='example lentil recipe',
                 description='example shares a lentil bowl recipe with a stepwise ingredient preparation sequence and serving suggestions.')]
    evidence = factual.packet({'web': rows}, audit)
    form = {'observations': [dict(source_id=r['source_id'], excerpt=r['description']) for r in evidence['web']],
            'actions': ['measure'], 'strategy': strategy_form()['strategy']}
    form['strategy']['diagnosis_ids'] = ['DIAG#public-positioning']
    for d in form['strategy']['decisions']:
        d['diagnosis_id'] = 'DIAG#public-positioning'
        d['evidence_ids'] = ['WEB#1', 'WEB#2']
    return audit, evidence, form


def test_public_strategy_can_use_unmeasured_connected_profile_without_downgrade():
    from auditlayer_worker.instagram_api import InstagramMetrics, InstagramProfile, InstagramMedia
    audit, evidence, form = public_case()
    metrics = InstagramMetrics(profile=InstagramProfile(ig_user_id=7, username='example'), recent_media=[
        InstagramMedia(id=str(i), media_type='VIDEO', caption='A complete caption with no measured counts.', timestamp='2026-09-01T00:00:00Z')
        for i in range(2)])
    report = factual.render(audit, json.dumps(form), evidence=evidence, ig_metrics=metrics)
    assert 'Priority 1' in report and 'Unmeasured public-source strategy' in report


def test_format_transfer_is_explicitly_a_bundled_contrast():
    audit, metrics = connected_case()
    form = strategy_form()
    form['interpretations'][0]['question'] = 'format_transfer'
    form['recommendations'][0]['change'] = 'format'
    form['recommendations'][0]['format'] = 'CAROUSEL_ALBUM'
    report = factual.render(audit, json.dumps(form), evidence=factual.packet({'web': []}, audit), ig_metrics=metrics)
    assert 'Bundled topic-and-format contrast' in report
    assert 'A: CAROUSEL_ALBUM; B: VIDEO' in report


def test_validated_form_pinned_to_fenced_canonical_cache(tmp_path):
    from types import SimpleNamespace
    from test_generation_runtime import _Client, _generator
    from auditlayer_worker.openrouter import MODEL
    audit, metrics = connected_case()
    form = strategy_form()
    client = _Client([json.dumps(form)])
    client.settings = SimpleNamespace(output_dir=tmp_path)
    gen = _generator(client)
    gen.model = MODEL
    checkpoints = []
    gen.evidence_recorder = checkpoints.append
    result = gen.generate(audit, lambda *a: None, research_cache='{"web":[]}', ig_metrics=metrics)
    saved = json.loads(result.research_cache)
    assert saved['analysis']['form'] == form
    assert saved['analysis']['version'] == factual.VERSION
    assert saved['analysis']['audit_id'] == audit.id
    assert json.loads(checkpoints[-1]) == saved
    assert len(checkpoints) == 2
    assert not list(tmp_path.rglob('*.json'))


def test_final_canonical_checkpoint_rejection_withholds_report(tmp_path):
    from types import SimpleNamespace
    from test_generation_runtime import _Client, _generator
    from auditlayer_worker.openrouter import MODEL
    from auditlayer_worker.generation import GenerationStageError
    audit, metrics = connected_case()
    client = _Client([json.dumps(strategy_form())])
    client.settings = SimpleNamespace(output_dir=tmp_path)
    gen = _generator(client)
    gen.model = MODEL
    def record(payload):
        if 'analysis' in json.loads(payload):
            raise RuntimeError('synthetic revoked credential')
    gen.evidence_recorder = record
    with pytest.raises(GenerationStageError) as error:
        gen.generate(audit, lambda *a: None, research_cache='{"web":[]}', ig_metrics=metrics)
    assert error.value.error_code == 'evidence_persistence_failed'
    assert len(client.calls) == 1
    assert not list(tmp_path.rglob('*.json'))


def test_single_format_supports_strategy_without_fabricated_comparison():
    from auditlayer_worker.strategic_analysis import diagnoses
    audit, metrics = connected_case()
    metrics.recent_media = metrics.recent_media[:4]
    snapshot = factual.connected_snapshot(metrics)
    catalogue = diagnoses(snapshot)
    assert any(d['id'] == 'DIAG#VIDEO-comments_count-baseline' for d in catalogue)
    data = strategy_form()
    did = 'DIAG#VIDEO-comments_count-baseline'
    data['strategy']['diagnosis_ids'] = [did]
    for row in data['strategy']['decisions']:
        row['diagnosis_id'] = did
    report = factual.render(audit, json.dumps(data), evidence=factual.packet({'web': []}, audit), ig_metrics=metrics)
    assert 'Single-format baseline' in report
    assert '11.5' in report
    assert 'CAROUSEL_ALBUM:' not in report


def test_projection_orders_mixed_offset_dates_chronologically():
    from auditlayer_worker.connected_analysis import project
    audit, metrics = connected_case()
    metrics.recent_media = metrics.recent_media[:2]
    metrics.recent_media[0].timestamp = '2026-09-01T00:30:00+02:00'
    metrics.recent_media[1].timestamp = '2026-08-31T23:00:00Z'
    coverage = project(metrics)['coverage']
    assert coverage['start'] == metrics.recent_media[0].timestamp
    assert coverage['end'] == metrics.recent_media[1].timestamp


def test_sparse_public_generation_withheld_before_analysis():
    from test_factual_report import public_evidence
    from test_generation_runtime import _audit, _Client, _generator
    from auditlayer_worker.generation import GenerationStageError
    from auditlayer_worker.openrouter import MODEL
    client = _Client([])
    gen = _generator(client)
    gen.model = MODEL
    with pytest.raises(GenerationStageError) as error:
        gen.generate(_audit(), lambda *a: None, research_cache=public_evidence())
    assert error.value.error_code == 'insufficient_strategy_evidence'
    assert not error.value.retryable and not client.calls


def test_public_strategy_actual_prompt_preserves_goal_and_one_analysis():
    from test_generation_runtime import _Client, _generator
    from auditlayer_worker.openrouter import MODEL
    audit, evidence, form = public_case()
    client = _Client([json.dumps(form)])
    gen = _generator(client)
    gen.model = MODEL
    result = gen.generate(audit, lambda *a: None, research_cache=json.dumps(evidence))
    assert len(client.calls) == 1
    sent = client.calls[0]['messages'][-1]['content']
    assert '"goal": "community"' in sent
    assert 'strategy' in sent and 'DIAG#public-positioning' in sent
    assert 'pantry-to-bowl transformation' in result.html
    assert json.loads(result.research_cache)['analysis']['form'] == form


def test_public_report_has_original_strategy_without_connected_metrics():
    audit, evidence, form = public_case()
    report = factual.render(audit, json.dumps(form), evidence=evidence)
    assert 'Priority 1' in report and 'pantry-to-bowl transformation' in report
    assert 'Positioning diagnosis' in report
    assert 'Unmeasured' in report
    assert 'not verified performance' in report
    assert '/ 100' not in report


@pytest.mark.parametrize('mutation', ['unknown_diagnosis', 'duplicate_rank', 'cycle', 'invented_metric', 'absence', 'certainty', 'scope', 'unsupported_ref'])
def test_strategy_negative_controls(mutation):
    audit, metrics = connected_case()
    data = strategy_form()
    first = data['strategy']['decisions'][0]
    if mutation == 'unknown_diagnosis': first['diagnosis_id'] = 'DIAG#invented'
    elif mutation == 'duplicate_rank': data['strategy']['decisions'][1]['rank'] = 1
    elif mutation == 'cycle': first['depends_on'] = ['S2']
    elif mutation == 'invented_metric': first['tasks'][0] = 'Film a demonstration that increases sales by 50 percent.'
    elif mutation == 'absence': first['tasks'][0] = 'Show that the account has no funnel.'
    elif mutation == 'certainty': first['tasks'][0] = 'Show how this format guarantees growth.'
    elif mutation == 'scope': first['tasks'][0] = 'Redesign the website checkout.'
    elif mutation == 'unsupported_ref': first['evidence_ids'] = ['IG#post24']
    with pytest.raises(ValueError):
        factual.render(audit, json.dumps(data), evidence=factual.packet({'web': []}, audit), ig_metrics=metrics)
