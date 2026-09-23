"""Offline regressions for bounded public-research report integrity."""
import json
import re
from types import SimpleNamespace

import pytest

from auditlayer_worker.hermes_inprocess import _is_subject_relevant, InProcessHermesClient
from auditlayer_worker.generation import _filter_evidence_payload, _indexed_instagram_metrics
from auditlayer_worker.core import assemble_structured_report_html
from test_generation_runtime import _audit, _payload, _Client, _generator


@pytest.mark.parametrize('count', [0, 1, 3, 10])
def test_creative_cards_render_only_distinct_supplied_ideas(count):
    payload = json.loads(_payload())
    section = next(s for s in payload['sections'] if s['heading'] == 'Content Calendar & Creative Board')
    section['items'] = [{'title': f'Idea {i}', 'body': f'Film specific demonstration {i}', 'value': 'Reel'} for i in range(count)]
    if 0 < count < 10:
        section['items'].append(dict(section['items'][0]))
    report = assemble_structured_report_html(_audit(), json.dumps(payload))
    assert report.count('class="idea-card"') == count
    assert report.count('<section') == 15



def test_metric_extraction_rejects_conflicting_profile_even_without_prefilter():
    payload = {'web': [{'url': 'https://instagram.com/bloom.supps/',
                       'title': 'BloomSupps on Instagram', 'description': '12K followers',
                       'evidence_mode': 'public_search_index'}]}
    assert _indexed_instagram_metrics(payload, 'bloomsupps') == {}


def test_index_only_score_labels_cannot_bypass_withholding():
    payload = json.loads(_payload())
    payload['sections'][0]['items'][3]['title'] = 'Audience Health'
    with pytest.raises(ValueError, match='score dimension must be Audience Fit'):
        assemble_structured_report_html(_audit(), json.dumps(payload), public_index_only=True)


def test_cta_links_to_current_pricing_without_unverified_price():
    report = assemble_structured_report_html(_audit(), _payload())
    assert '$50/month' not in report
    assert 'href="https://auditlayermedia.com/pricing?plan=pro"' in report
    assert 'View Extended pricing' in report


def test_index_only_generation_withholds_unsupported_scores_and_qualifies_claims():
    client = _Client([_payload()])
    report = _generator(client).generate(_audit(), lambda *_: None).html
    scores = dict(re.findall(r'<span class="sd-label">([^<]+)</span><div class="sd-track">.*?<span class="sd-value [^"]+">([^<]+)</span>', report))
    for dimension in ('Content Consistency', 'Audience Fit', 'Engagement Health', 'Growth Readiness'):
        assert scores[dimension] == 'N/A'
    assert '<span class="sd-overall">N/A</span>' in report
    assert 'dated representative sample' in report
    assert 'achievable growth forecasts' in report
    assert 'first-party analytics' in report
    assert 'Evidence-backed analysis' in report
    prompt = client.calls[0]['messages'][1]['content']
    assert 'public_search_index' in prompt
    assert 'format proportions' in prompt
    assert 'hypotheses' in prompt


def test_correction_requests_distinct_creative_examples_with_original_bounds():
    client = _Client(['invalid JSON', _payload()])
    _generator(client).generate(_audit(), lambda *_: None)
    for message in client.calls[1]['messages']:
        assert 'exactly 10 distinct creative ideas' in message['content']
    assert client.calls[1]['max_tokens'] == 6000
    assert client.calls[1]['toolsets'] == ()
    assert client.calls[1]['session_id'] == ''


def test_managed_snippets_keep_index_provenance_and_metrics(monkeypatch):
    import auditlayer_worker.hermes_inprocess as hip
    raw = {'url': 'https://www.instagram.com/bloomsupps/',
           'title': 'BloomSupps on Instagram', 'description': '12K followers'}
    monkeypatch.setattr(hip, '_managed_search_results', lambda *a, **k: [
        json.dumps({'success': True, 'data': {'web': [raw]}})])
    client = object.__new__(InProcessHermesClient)
    data = json.loads(client.collect_research(SimpleNamespace(id='offline', handle='bloomsupps', platform='instagram')))
    assert data['web'][0]['evidence_mode'] == 'public_search_index'
    assert data['web'][0]['description'] == raw['description']
    filtered = _filter_evidence_payload(data, handle='bloomsupps', platform='instagram')
    assert _indexed_instagram_metrics(filtered, 'bloomsupps') == {'followers': '12k'}
    audit = _audit()
    audit.handle = 'bloomsupps'
    report = _generator(_Client([_payload()])).generate(
        audit, lambda *_: None, research_cache=json.dumps(data)
    ).html
    assert '12k*' in report
    assert raw['url'] in report
    assert 'Public search index' in report




@pytest.mark.parametrize('path', ['bloom.supps', 'otherbrand', 'otherbrand/reels', 'otherbrand/p/abc', 'stories/otherbrand/123'])
def test_conflicting_instagram_identity_overrides_brand_title(path):
    assert not _is_subject_relevant({
        'url': f'https://www.instagram.com/{path}/',
        'title': 'BloomSupps (@bloom.supps) on Instagram',
        'description': 'bloomsupps 12K followers',
    }, 'bloomsupps', 'instagram')


@pytest.mark.parametrize('path', ['bloomsupps', 'BLOOMSUPPS/reels', 'p/abc', 'reel/abc'])
def test_exact_profile_or_attributed_post_is_relevant(path):
    assert _is_subject_relevant({
        'url': f'https://www.instagram.com/{path}/',
        'title': 'bloomsupps on Instagram',
    }, 'bloomsupps', 'instagram')
