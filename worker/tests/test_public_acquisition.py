"""Public acquisition constraints, all offline (never invokes a paid provider)."""
import json
from types import SimpleNamespace

import pytest
from test_openrouter_production import settings
from test_openrouter_research import configured, research_response


@pytest.mark.parametrize('handle', ['auditlayermedia', '@auditlayermedia',
    'https://www.instagram.com/auditlayermedia/'])
def test_instagram_locator_is_exact_in_request(handle):
    from auditlayer_worker.research import research_messages, research_plugin
    data = json.loads(research_messages(handle, 'instagram')[1]['content'])
    assert data['subject'] == handle  # supplied identity retained
    assert data['profile_url'] == 'https://www.instagram.com/auditlayermedia/'
    assert data['query'] == '"auditlayermedia" Instagram profile and authored posts captions'
    assert research_plugin(handle, 'instagram')['include_domains'] == ['instagram.com']


@pytest.mark.parametrize('handle', ['https://evil.com/auditlayermedia/',
    'https://instagram.com/p/abc/', 'https://instagram.com/other/auditlayermedia/',
    'auditlayermedia" OR "other', '@@auditlayermedia', ' auditlayermedia ',
    'https://user:pass@instagram.com/auditlayermedia/',
    'https://instagram.com:443/auditlayermedia/',
    'https://instagram.com/auditlayermedia/?other=target'])
def test_invalid_instagram_locator_rejected_before_reservation(settings, monkeypatch, handle):
    from auditlayer_worker.hermes_inprocess import InProcessHermesClient
    monkeypatch.setenv('ALM_OPENROUTER_API_KEY', 'offline')
    client = InProcessHermesClient(configured(settings))
    calls = []
    client.inference_recorder = calls.append
    monkeypatch.setattr('auditlayer_worker.openrouter.one_call',
                        lambda *a: pytest.fail('must not dispatch'))
    with pytest.raises(ValueError, match='invalid research subject'):
        client.collect_research(SimpleNamespace(id='a', handle=handle, platform='instagram'))
    assert calls == []


@pytest.mark.parametrize('empty', [False, True])
def test_actual_failed_probe_is_actionable_without_fallback_or_replay(settings, monkeypatch, tmp_path, empty):
    from dataclasses import replace
    settings = replace(settings, output_dir=tmp_path)
    from pathlib import Path
    from auditlayer_worker.hermes_inprocess import InProcessHermesClient
    from auditlayer_worker.openrouter import ProviderCallError
    original = json.loads((Path(__file__).parent / 'fixtures/public-acquisition/failed-20260923-annotations.json').read_text())
    annotations = [] if empty else original['annotations']
    raw = research_response()  # envelope is offline; annotations below are real retained bytes
    raw['choices'][0]['message']['annotations'] = annotations
    receipts, requests = [], []
    def boundary(client, request, deadline):
        requests.append(request)
        return {'raw': raw}
    monkeypatch.setenv('ALM_OPENROUTER_API_KEY', 'offline')
    monkeypatch.setattr('auditlayer_worker.openrouter.one_call', boundary)
    monkeypatch.setattr('auditlayer_worker.hermes_inprocess._public_search_index',
                        lambda *a, **kw: pytest.fail('no automatic alternate search'))
    client = InProcessHermesClient(configured(settings))
    client.inference_recorder = lambda calls: receipts.append(json.loads(json.dumps(calls)))
    audit = SimpleNamespace(id='a', handle='auditlayermedia', platform='instagram')
    with pytest.raises(ProviderCallError) as exc:
        client.collect_research(audit)
    assert str(exc.value) == 'insufficient_public_instagram_evidence'
    assert exc.value.next_action == 'connect_instagram'
    assert receipts[-1][0]['status'] == 'failed'
    assert receipts[-1][0]['cost_usd'] == raw['usage']['cost']
    assert receipts[-1][0]['customer_charge_usd'] == 0
    stored = list((settings.output_dir / 'research-evidence').glob('raw-*.json'))
    assert len(stored) == 1
    assert json.loads(stored[0].read_text())['annotations'] == annotations
    with pytest.raises(RuntimeError, match='reservation'):
        client.collect_research(audit)
    assert len(requests) == 1


def test_website_request_does_not_forbid_its_own_homepage():
    from auditlayer_worker.research import research_messages, research_plugin
    system = research_messages('https://auditlayermedia.com/', 'website')[0]['content']
    assert 'not a company homepage' not in system
    assert research_plugin('https://auditlayermedia.com/', 'website') == {
        'id': 'web', 'engine': 'exa', 'mode': 'fast', 'max_results': 3}


def test_other_author_post_mentioning_target_is_not_subject_content():
    from auditlayer_worker.research import research_row
    row = dict(url='https://www.instagram.com/reel/OtherPost/',
               title='Other creator (@other) on Instagram',
               description='other on September 5, 2026: Thanks @auditlayermedia for the advice on making content.')
    assert research_row(row, 'auditlayermedia', 'instagram') is None


@pytest.mark.parametrize('url,description', [
    ('https://www.instagram.com/reel/OwnPost/', 'auditlayermedia on September 5, 2026: Save this list of content creation tools.'),
    ('https://www.instagram.com/auditlayermedia/reel/OwnPost/', 'Save this list of content creation tools, with a stepwise editing guide.'),
])
def test_subject_authored_posts_remain_admissible(url, description):
    from auditlayer_worker.research import research_row
    assert research_row(dict(url=url,title='Instagram',description=description),
                        'auditlayermedia','instagram') is not None
