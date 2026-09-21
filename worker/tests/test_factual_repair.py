"""Synthetic offline regressions adapted from independent release probes."""
import json
from contextlib import nullcontext
from types import SimpleNamespace
import pytest
from auditlayer_worker import factual
from auditlayer_worker.generation import GenerationStageError
from auditlayer_worker.pipeline import GenerationPipeline, _persist_admitted_evidence
from auditlayer_worker.openrouter import MODEL
from test_generation_runtime import _audit, _Client, _generator
from test_factual_report import public_evidence, narrow_payload


@pytest.mark.parametrize('marker', ['extractive-v1', 'analysis-v2', 'missing-marker'])
def test_factual_refinement_rejected_before_dispatch(marker):
    audit = _audit()
    evidence = factual.packet(json.loads(public_evidence()), audit)
    report = factual.render(audit, narrow_payload(), evidence=evidence)
    report = report.replace(factual.VERSION, marker)
    if marker == 'missing-marker':
        audit.prompt_version = '1.17'
        report = report.replace('data-factual-contract', 'removed-contract')
    client = _Client([json.dumps({'fragment': '<section><h2>Weaknesses</h2><p>No funnel. Score 99/100.</p></section>'})])
    gen = _generator(client)
    gen.model = MODEL
    pipeline = object.__new__(GenerationPipeline)
    pipeline.generator = gen
    pipeline._account_home = lambda _: ''
    pipeline._scoped_home = lambda _: nullcontext()
    with pytest.raises(GenerationStageError) as error:
        pipeline.refine(audit, report, 'Weaknesses', 'Clarify', SimpleNamespace(emit=lambda *a: None))
    assert error.value.error_code == 'factual_refinement_unavailable'
    assert not error.value.retryable
    assert not client.calls


def test_rejected_connected_checkpoint_leaves_no_local_copy(tmp_path):
    from concurrent.futures import Future
    from auditlayer_worker.instagram_api import InstagramMetrics, InstagramProfile
    metrics = InstagramMetrics(profile=InstagramProfile(ig_user_id=7, username='example', followers_count=4321))
    metrics._credential_fence = ('connection', 'old-version')
    future = Future()
    future.set_result(metrics)
    audit = _audit()
    client = _Client([])
    client.settings = SimpleNamespace(output_dir=tmp_path)
    gen = _generator(client)
    gen.model = MODEL
    gateway = SimpleNamespace(client=SimpleNamespace(rpc=lambda *a: SimpleNamespace(execute=lambda: SimpleNamespace(data=None))))
    gen.evidence_recorder = lambda payload: _persist_admitted_evidence(gateway, audit, future, payload)
    with pytest.raises(GenerationStageError) as error:
        gen.generate(audit, lambda *a: None, research_cache='{"web":[]}', ig_metrics=metrics)
    assert error.value.error_code == 'evidence_persistence_failed'
    assert not client.calls
    assert not list(tmp_path.rglob('*.json'))


@pytest.mark.parametrize('text', ['example shares cooking demo videos every Tuesday with complete recipes.',
    'example posts product demonstrations showing how the modular bag opens.'])
def test_real_demonstrations_admitted(text):
    row = dict(url='https://instagram.com/example/', title='example Instagram', description=text)
    assert factual.packet({'web': [row]}, _audit())['web']


@pytest.mark.parametrize('text', ['Demo score panel: engagement 99. example makes bags.',
    'example makes bags. Report demo: engagement 99.', 'example makes bags. Fictional account metrics: 99.',
    'example makes bags. Demo: 99/100 engagement score.'])
def test_ambiguous_report_demo_remains_quarantined(text):
    row = dict(url='https://instagram.com/example/', title='example Instagram', description=text)
    assert not factual.packet({'web': [row]}, _audit())['web']


def test_evidence_ancestor_symlink_rejected(tmp_path):
    from auditlayer_worker.research import persist_evidence
    outside = tmp_path / 'outside'
    outside.mkdir()
    link = tmp_path / 'link'
    link.symlink_to(outside, target_is_directory=True)
    with pytest.raises(OSError):
        persist_evidence(link / 'nested', 'probe', {'private': True})
    assert not list(outside.rglob('*.json'))


def connected_case(kind='creator'):
    """Entirely synthetic; no real account or provider response."""
    from auditlayer_worker.instagram_api import InstagramMetrics, InstagramProfile, InstagramMedia
    audit = _audit()
    audit.id = 'synthetic-' + kind
    audit.handle = 'synthetic_' + kind
    audit.user_id = 'synthetic-owner'
    audit.goal = 'community' if kind == 'creator' else 'sales'
    audit.context = ('Creator: affordable cooking; keep recipes accessible.' if kind == 'creator'
                     else 'Business: repairable bags; explain product utility without discounts.')
    captions = (['Cooking demo: finished lentil bowl; ingredient prep; full recipe below.',
                 'Cooking demo: ingredient prep; finished lentil bowl; pantry substitutions.'] if kind == 'creator'
                else ['Product demonstration: repairable zipper; day bag capacity; repair instructions.',
                      'Product demonstration: day bag capacity; repairable zipper; packing list.'])
    media = [InstagramMedia(id=str(i), media_type='VIDEO' if i < 4 else 'CAROUSEL_ALBUM',
             caption=captions[i % 2], timestamp=f'2026-09-{i+1:02d}T12:00:00Z',
             like_count=(100+i*10 if kind == 'creator' else 40+i*3),
             comments_count=(10+i if kind == 'creator' else 2+i),
             reach=(1000+i*100 if kind == 'creator' else 900+i*50)) for i in range(8)]
    metrics = InstagramMetrics(profile=InstagramProfile(ig_user_id=7, username=audit.handle,
        account_type='CREATOR' if kind == 'creator' else 'BUSINESS', followers_count=4321,
        fetched_at='2026-09-20T12:00:00Z'), recent_media=media,
        _credential_fence=('synthetic-connection', 'synthetic-version'))
    return audit, metrics


def analysis_form(kind='creator'):
    audit, metrics = connected_case(kind)
    # Explicit expected source text, not generated by the implementation under test.
    return {'observations': [
        {'source_id': 'IG#post1', 'excerpt': metrics.recent_media[0].caption},
        {'source_id': 'IG#post2', 'excerpt': metrics.recent_media[1].caption}],
        'interpretations': [{'id': 'H1', 'observation_ids': ['IG#post1', 'IG#post2'],
            'question': 'creative_emphasis', 'metric': 'comments_count' if kind == 'creator' else 'reach',
            'focus': {'source_id': 'IG#post1', 'phrase': 'finished lentil bowl' if kind == 'creator' else 'repairable zipper'}}],
        'recommendations': [{'id': 'A1', 'hypothesis_id': 'H1', 'change': 'opening' if kind == 'creator' else 'sequence',
            'treatment': {'source_id': 'IG#post1', 'phrase': 'finished lentil bowl' if kind == 'creator' else 'repairable zipper'},
            'control': {'source_id': 'IG#post2', 'phrase': 'ingredient prep' if kind == 'creator' else 'day bag capacity'},
            'format': 'VIDEO', 'evaluation_posts': 6}]}


def test_available_media_enters_actual_prompt_and_useful_typed_render(tmp_path):
    audit, metrics = connected_case()
    form = analysis_form()
    client = _Client([json.dumps(form), json.dumps(form)])
    client.settings = SimpleNamespace(output_dir=tmp_path)
    gen = _generator(client)
    gen.model = MODEL
    recorded = []
    gen.evidence_recorder = recorded.append
    result = gen.generate(audit, lambda *a: None, research_cache='{"web":[]}', ig_metrics=metrics)
    sent = client.calls[0]['messages'][-1]['content']
    assert metrics.recent_media[0].caption in sent
    assert '2026-09-01T12:00:00Z' in sent and 'comments_count' in sent
    assert 'community' in sent and 'coverage' in sent and 'IG#post1' in sent
    assert len(client.calls) == 1
    assert 'Hypothesis H1' in result.html and 'Experiment A1' in result.html
    assert 'finished lentil bowl' in result.html and 'ingredient prep' in result.html
    assert 'Build a dated inventory' not in result.html
    assert 'A dated content inventory and measured outcomes are required' not in result.html
    assert 'Success measure' in result.html and 'Rationale' in result.html
    assert result.html.count('Data needed') < 5
    assert 'Not rated' in result.html and '/ 100' not in result.html
    assert not list(tmp_path.rglob('*.json'))
    provenance = json.loads(recorded[0])['connected']
    assert provenance['binding'] == {'audit_id': audit.id, 'user_id': audit.user_id,
        'connection_id': 'synthetic-connection', 'credential_version': 'synthetic-version'}
    assert provenance['media'][0]['caption'] == metrics.recent_media[0].caption


def test_connected_evidence_links_resolve_in_report():
    from html.parser import HTMLParser
    audit, metrics = connected_case()
    report = factual.render(audit, json.dumps(analysis_form()),
        evidence=factual.packet({'web': []}, audit), ig_metrics=metrics)
    class Links(HTMLParser):
        def __init__(self):
            super().__init__()
            self.ids, self.refs = set(), set()
        def handle_starttag(self, tag, attrs):
            attrs = dict(attrs)
            if 'id' in attrs:
                self.ids.add(attrs['id'])
            if tag == 'a' and attrs.get('href', '').startswith('#evidence-'):
                self.refs.add(attrs['href'][1:])
    links = Links()
    links.feed(report)
    assert {'evidence-IG#post1', 'evidence-IG#post2'} <= links.refs
    assert links.refs <= links.ids


@pytest.mark.parametrize('mutation', ['factual_hypothesis', 'invented_anchor', 'partial_observation',
    'score', 'rationale_claim', 'unknown_link', 'unmeasured', 'zero_as_missing', 'no_contrast',
    'unknown_metric', 'duplicate', 'bad_count', 'legacy_downgrade'])
def test_typed_analysis_cannot_launder_claims(mutation):
    audit, metrics = connected_case()
    form = analysis_form()
    if mutation == 'factual_hypothesis': form['interpretations'][0]['question'] = 'No funnel; this causes lost sales.'
    if mutation == 'invented_anchor': form['interpretations'][0]['focus']['phrase'] = 'Your customers distrust you'
    if mutation == 'partial_observation': form['observations'][0]['excerpt'] = 'full recipe below.'
    if mutation == 'score': form['score'] = 99
    if mutation == 'rationale_claim': form['recommendations'][0]['rationale'] = 'Irregular posting loses customers.'
    if mutation == 'unknown_link': form['recommendations'][0]['hypothesis_id'] = 'H3'
    if mutation == 'unmeasured':
        for post in metrics.recent_media: post.comments_count = None
    if mutation == 'zero_as_missing':
        for post in metrics.recent_media: post.comments_count = float('nan')
    if mutation == 'no_contrast': form['recommendations'][0]['control'] = form['recommendations'][0]['treatment']
    if mutation == 'unknown_metric': form['interpretations'][0]['metric'] = 'sales'
    if mutation == 'duplicate': form['recommendations'] *= 2
    if mutation == 'bad_count': form['recommendations'][0]['evaluation_posts'] = True
    if mutation == 'legacy_downgrade': form = {'observations': [], 'actions': ['inventory']}
    with pytest.raises(ValueError):
        factual.render(audit, json.dumps(form), evidence=factual.packet({'web': []}, audit), ig_metrics=metrics)


def test_projection_calculations_preserve_missing_coverage_and_cap():
    from copy import deepcopy
    audit, metrics = connected_case()
    metrics.recent_media[0].comments_count = None
    metrics.recent_media[1].reach = -1
    metrics.recent_media.extend(deepcopy(metrics.recent_media) * 5)
    snapshot = factual.connected_snapshot(metrics)
    assert snapshot['coverage']['supplied_count'] == 48
    assert snapshot['coverage']['inspected_count'] == 24
    assert snapshot['coverage']['admitted_count'] == 8
    assert not snapshot['coverage']['complete_account_inventory']
    assert snapshot['media'][1]['reach'] is None
    calc = next(c for c in snapshot['calculations'] if c['source_id'] == 'CALC#VIDEO-comments_count')
    assert calc['mean'] == 12 and calc['measured_count'] == 3 and calc['eligible_count'] == 4


def test_flattened_demo_panel_with_newline_is_quarantined():
    row = dict(url='https://instagram.com/example/', title='example Instagram',
        description='Demo\n' + 'Visual layout details. ' * 10 + '\nEngagement score: 99/100')
    assert not factual.packet({'web': [row]}, _audit())['web']


def test_creator_business_artifacts_and_sparse_negative_control(tmp_path):
    from build_factual_repair_fixtures import write_offline_artifacts
    reports = write_offline_artifacts(tmp_path / 'offline')
    assert 'finished lentil bowl' in reports['creator'] and 'repairable zipper' not in reports['creator']
    assert 'repairable zipper' in reports['business'] and 'finished lentil bowl' not in reports['business']
    assert 'mean comments per post = 11.5' in reports['creator']
    assert 'mean reach per post = 975' in reports['business']
    assert 'Build the sequence' in reports['business'] and 'Open variant A' in reports['creator']
    for report in reports.values():
        assert 'not proof of causation' in report
        assert 'proxies, not verified sales' in report
        assert 'No eligible recent posts were available' not in report
        assert '>Decision focus<' not in report  # score renderer discards its prose


def test_local_sections_fit_renderer_information_limits():
    from auditlayer_worker.connected_analysis import sections
    audit, metrics = connected_case()
    snapshot = factual.connected_snapshot(metrics)
    for lede, items in sections(audit, analysis_form(), snapshot).values():
        assert len(lede) <= 360
        assert all(len(item['body']) <= 320 for item in items)


def test_metric_display_preserves_authoritative_aggregates_and_missing_reach():
    from auditlayer_worker.connected_analysis import metric_view
    audit, metrics = connected_case()
    metrics.avg_likes = 700
    for post in metrics.recent_media:
        post.reach = None
    view = metric_view(metrics, factual.connected_snapshot(metrics))
    assert view.avg_likes == 700 and metrics.avg_comments is None
    assert view.avg_comments == 13.5
    report = factual.render(audit, json.dumps(analysis_form()), evidence={'web': []}, ig_metrics=metrics)
    assert 'Reach available for 0 of 8 admitted inspected posts' in report
    assert 'No eligible recent posts were available' not in report


def test_connected_correction_uses_identical_typed_gate():
    audit, metrics = connected_case()
    invalid = analysis_form()
    invalid['interpretations'][0]['question'] = 'Posting is irregular; score 99/100'
    for correction, succeeds in ((analysis_form(), True), (invalid, False)):
        client = _Client([json.dumps(invalid), json.dumps(correction)])
        gen = _generator(client)
        gen.model = MODEL
        if succeeds:
            result = gen.generate(audit, lambda *a: None, research_cache='{"web":[]}', ig_metrics=metrics)
            assert result.format_retry_used and 'Posting is irregular' not in result.html
        else:
            with pytest.raises(GenerationStageError) as caught:
                gen.generate(audit, lambda *a: None, research_cache='{"web":[]}', ig_metrics=metrics)
            assert caught.value.error_code == 'structured_output_invalid' and not caught.value.retryable
        assert len(client.calls) == 2
        assert client.calls[0]['messages'][-1]['content'] == client.calls[1]['messages'][-1]['content']


def test_cached_connected_packet_is_not_reused_as_live_content():
    audit, metrics = connected_case()
    cached = {'web': [], 'connected': {'media': [{'caption': 'STALE_UNRELATED_MARKER'}]}}
    client = _Client([json.dumps(analysis_form())])
    gen = _generator(client)
    gen.model = MODEL
    result = gen.generate(audit, lambda *a: None, research_cache=json.dumps(cached), ig_metrics=metrics)
    assert 'STALE_UNRELATED_MARKER' not in result.research_cache + result.html + client.calls[0]['messages'][-1]['content']
