"""Offline research contract. No paid network or production configuration."""
from dataclasses import replace
from types import SimpleNamespace
import json
import pytest
from test_openrouter_production import settings
from test_commercial_runtime import pin

POLICY = dict(version='openrouter-exa-fast-v1', context_tokens=1310720,
              output_tokens=256, search_fee_microusd=7000,
              reservation_microusd=190573, aggregate_token_cap=1398976)


def research_pin():
    return {**pin(), 'rate_version': 'exa-v1-test-only',
            'input_microusd_per_mtok': 140000, 'output_microusd_per_mtok': 280000,
            'max_input_tokens': 32000, 'max_output_tokens': 12000, 'max_calls': 2,
            'research_microusd': 0, 'research_policy': POLICY,
            'upstream_microusd': 206253, 'retail_microusd': 618759}


def test_research_quote_requires_explicit_full_context_operator_budget(settings):
    from auditlayer_worker.commercial import pinned_settings
    with pytest.raises(RuntimeError, match='research_operator_budget'):
        pinned_settings(settings, SimpleNamespace(token_cap=120000, cost_cap_usd=3), research_pin())
    config = pinned_settings(replace(settings, token_cap=1398976, cost_cap_usd=1),
                             SimpleNamespace(token_cap=1398976, cost_cap_usd=1), research_pin())
    assert config.research_policy.version == POLICY['version']
    assert config.max_input_tokens == 32000  # report bounds unchanged
    assert config.max_inference_calls == 2
    assert config.token_cap == 1398976
    assert config.cost_cap_usd == .206253
    assert config.data_api_allowance_usd == 0
    with pytest.raises(RuntimeError, match='research_operator_budget'):
        pinned_settings(replace(settings, token_cap=1398976, cost_cap_usd=1, max_tokens=128),
                        SimpleNamespace(token_cap=1398976, cost_cap_usd=1), research_pin())


def configured(settings):
    from auditlayer_worker.commercial import pinned_settings
    return pinned_settings(replace(settings, token_cap=1398976, cost_cap_usd=1),
                           SimpleNamespace(token_cap=1398976, cost_cap_usd=1), research_pin())


def research_response():
    return dict(model='deepseek/deepseek-v4-flash-0731', id='gen-research', provider='fixture',
                choices=[dict(finish_reason='length', message=dict(content='GENERATED NOT EVIDENCE',
                  annotations=[dict(type='url_citation', url_citation=dict(
                    url='https://www.instagram.com/example/', title='example Instagram',
                    content='example shares weekly cooking tutorials on Instagram with 1000 followers.'))]))],
                usage=dict(prompt_tokens=1241, completion_tokens=256, cost=.0070906,
                           cost_details=dict(upstream_inference_cost=.0000906)))


def test_fixed_research_sdk_annotation_only_and_shared_reservation(settings, monkeypatch):
    import httpx
    from openai import OpenAI
    from auditlayer_worker.hermes_inprocess import InProcessHermesClient
    requests = []
    receipts = []
    def handle(request):
        requests.append(json.loads(request.content))
        assert receipts[-1][-1]['status'] == 'reserved'
        return httpx.Response(200, json=research_response())
    sdk = OpenAI(api_key='offline', base_url='https://openrouter.ai/api/v1', max_retries=0,
                 http_client=httpx.Client(transport=httpx.MockTransport(handle)))
    monkeypatch.setenv('ALM_OPENROUTER_API_KEY', 'offline')
    monkeypatch.setattr('openai.OpenAI', lambda **kw: sdk)
    monkeypatch.setattr('auditlayer_worker.openrouter.one_call',
                        lambda boundary, request, deadline: {'raw': boundary.complete(request, request.model)})
    monkeypatch.setattr('auditlayer_worker.hermes_inprocess._public_search_index',
                        lambda *a, **k: pytest.fail('fallback is forbidden'))
    client = InProcessHermesClient(configured(settings))
    client.inference_recorder = lambda calls: receipts.append(json.loads(json.dumps(calls)))
    evidence = json.loads(client.collect_research(SimpleNamespace(id='audit', handle='example', platform='instagram')))
    assert len(evidence['web']) == 1
    assert 'GENERATED' not in str(evidence)
    assert requests[0]['plugins'] == [{'id':'web','engine':'exa','mode':'fast','max_results':3}]
    assert requests[0]['provider']['max_price'] == {'prompt':.14,'completion':.28,'request':0}
    assert requests[0]['max_tokens'] == 256
    assert 'response_format' not in requests[0] and 'tools' not in requests[0]
    assert client._inference_reservation.tokens == 1310976
    receipt = receipts[-1][0]
    assert receipt['stage'] == 'research'
    assert receipt['reserved_usd'] == pytest.approx(.19057248)
    assert receipt['cost_usd'] == .0070906  # fee already included, not doubled
    assert receipt['search_cost_usd'] == .007
    assert receipt['inference_cost_usd'] == .0000906
    assert receipt['cost_source'] == 'provider_actual'
    assert receipt['status'] == 'completed'
    with pytest.raises(RuntimeError, match='reservation'):
        client.collect_research(SimpleNamespace(id='audit',handle='example',platform='instagram'))
    assert len(requests) == 1


@pytest.mark.parametrize('url,title,excerpt', [
    ('https://www.instagram.com/examplefake/', 'examplefake Instagram', 'examplefake posts weekly tutorials.'),
    ('https://www.getexample.com/', 'example Instagram', 'example has 999999 followers on Instagram.'),
    ('http://127.0.0.1/example', 'example Instagram', 'example posts weekly tutorials on Instagram.'),
    ('https://user:pass@instagram.com/example', 'example Instagram', 'example posts weekly tutorials.'),
    ('https://instagram.com.evil.invalid/example', 'example Instagram', 'example posts weekly tutorials.'),
    ('https://instagram.com/example/', 'example Instagram', 'https://instagram.com/example/'),
    ('https://instagram.com/example/', 'example Instagram', 'example Instagram ' + 'x'*20000),
])
def test_research_rejects_unsafe_lookalike_locator_and_huge_cache(url, title, excerpt):
    from auditlayer_worker.generation import _filter_evidence_payload
    row = dict(url=url,title=title,description=excerpt,evidence_mode='openrouter_exa')
    assert _filter_evidence_payload({'web':[row]},handle='example',platform='instagram') == {'web':[]}


def test_three_stage_receipts_are_preserved_and_tariff_is_versioned():
    from auditlayer_worker.openrouter import safe_receipts
    from auditlayer_worker.commercial import terminal_payload
    calls=[dict(attempt_id=str(i), stage=stage, status='completed', tokens_in=100,tokens_out=50,
                cost_source='provider_actual',cost_usd=.00702 if i==0 else .00002,
                research_version=POLICY['version']) for i,stage in enumerate(('research','analysis','correction'))]
    calls[1]['status']='format_rejected'
    safe=safe_receipts(calls)
    assert len(safe)==3 and safe[0]['stage']=='research'
    summary=SimpleNamespace(status='ready',stage_timings={'_inference':safe})
    assert terminal_payload('a','w',research_pin(),summary,calls)['customer_debit_microusd']==21168
    summary.status='failed'
    assert terminal_payload('a','w',research_pin(),summary,calls)['customer_debit_microusd']==0


@pytest.mark.parametrize('mode',['timeout','persist_reserve','persist_complete','missing_annotations','estimated','unknown'])
def test_research_failure_liability_and_no_replay(settings,monkeypatch,mode):
    from auditlayer_worker.hermes_inprocess import InProcessHermesClient
    from auditlayer_worker.openrouter import ProviderCallError
    client=InProcessHermesClient(configured(settings))
    calls=[]
    monkeypatch.setenv('ALM_OPENROUTER_API_KEY','offline')
    def boundary(*args):
        calls.append(1)
        if mode=='timeout': return {'error':'timeout'}
        raw=research_response()
        if mode=='missing_annotations': raw['choices'][0]['message'].pop('annotations')
        if mode=='estimated': raw['usage'].pop('cost')
        if mode=='unknown': raw['usage']={}
        return {'raw':raw}
    monkeypatch.setattr('auditlayer_worker.openrouter.one_call',boundary)
    def record(receipts):
        if mode=='persist_reserve' or mode=='persist_complete' and receipts[-1]['status']=='completed':
            raise RuntimeError('durable store unavailable')
    client.inference_recorder=record
    audit=SimpleNamespace(id='a',handle='example',platform='instagram')
    if mode in ('estimated','unknown'):
        client.collect_research(audit)
        receipt=client._inference_receipts[0]
        assert receipt['cost_source']==('rate_estimated' if mode=='estimated' else 'unknown')
        assert receipt['cost_usd']==(pytest.approx(.00724542) if mode=='estimated' else None)
    else:
        with pytest.raises(ProviderCallError): client.collect_research(audit)
        assert client._inference_receipts[0]['reserved_usd']>0
        if mode=='timeout': assert client._inference_receipts[0]['cost_usd'] is None
    with pytest.raises(RuntimeError,match='reservation'): client.collect_research(audit)
    assert len(calls)==(0 if mode=='persist_reserve' else 1)


@pytest.mark.parametrize('raw',[None, {'choices':'bad'}, {'usage':'bad','choices':[]},
                                {'choices':[{'message':'bad'}]},
                                {**research_response(), 'usage': {'cost_details': 'bad'}}])
def test_malformed_research_response_persists_failure(settings,monkeypatch,raw):
    from auditlayer_worker.hermes_inprocess import InProcessHermesClient
    from auditlayer_worker.openrouter import ProviderCallError
    client=InProcessHermesClient(configured(settings))
    persisted=[]
    client.inference_recorder=lambda calls: persisted.append(json.loads(json.dumps(calls)))
    monkeypatch.setenv('ALM_OPENROUTER_API_KEY','offline')
    monkeypatch.setattr('auditlayer_worker.openrouter.one_call',lambda *a: {'raw':raw})
    with pytest.raises(ProviderCallError):
        client.collect_research(SimpleNamespace(id='a',handle='example',platform='instagram'))
    assert persisted[-1][0]['status']=='failed'
    assert persisted[-1][0]['cost_usd'] is None


@pytest.mark.parametrize('mutation', ['null_prose','over_input','over_output','over_cost'])
def test_research_annotations_independent_of_prose_but_usage_bounded(settings,monkeypatch,mutation):
    from auditlayer_worker.hermes_inprocess import InProcessHermesClient
    from auditlayer_worker.openrouter import ProviderCallError
    client=InProcessHermesClient(configured(settings))
    client.inference_recorder=lambda calls: None
    raw=research_response()
    if mutation=='null_prose': raw['choices'][0]['message']['content']=None
    if mutation=='over_input': raw['usage']['prompt_tokens']=1310721
    if mutation=='over_output': raw['usage']['completion_tokens']=257
    if mutation=='over_cost': raw['usage']['cost']=1
    monkeypatch.setenv('ALM_OPENROUTER_API_KEY','offline')
    monkeypatch.setattr('auditlayer_worker.openrouter.one_call',lambda *a: {'raw':raw})
    if mutation=='null_prose':
        assert 'weekly cooking' in client.collect_research(SimpleNamespace(id='a',handle='example',platform='instagram'))
    else:
        with pytest.raises(ProviderCallError):
            client.collect_research(SimpleNamespace(id='a',handle='example',platform='instagram'))
        assert client._inference_receipts[0]['status']=='failed'


def test_research_requires_a_real_recorder(settings,monkeypatch):
    from auditlayer_worker.hermes_inprocess import InProcessHermesClient
    monkeypatch.setenv('ALM_OPENROUTER_API_KEY','offline')
    monkeypatch.setattr('auditlayer_worker.openrouter.one_call',lambda *a: pytest.fail('undurable dispatch'))
    with pytest.raises(RuntimeError,match='durable recorder'):
        InProcessHermesClient(configured(settings)).collect_research(SimpleNamespace(id='a',handle='example',platform='instagram'))
