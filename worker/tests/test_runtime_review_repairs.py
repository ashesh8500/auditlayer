"""Acceptance inversions of the independent offline review reproducers."""
import json
from dataclasses import replace
from types import SimpleNamespace
from test_openrouter_production import settings


def test_refinement_records_reserved_before_provider(settings,monkeypatch):
    from auditlayer_worker import worker
    from auditlayer_worker.hermes_inprocess import InProcessHermesClient
    from auditlayer_worker.pipeline import GenerationPipeline
    from test_refinement_bundle_lineage import _Gateway
    monkeypatch.setenv('ALM_OPENROUTER_API_KEY','offline-fixture')
    client=InProcessHermesClient(settings)
    gen=worker.build_generator(settings,runtime=SimpleNamespace(build_client=lambda:client))
    gateway=_Gateway({'id':'audit-1','handle':'example','platform':'youtube','goal':'growth','report_path':'old'})
    persisted=[]
    gateway.start_report_generation_run=lambda **kw: 'ref-run'
    gateway.record_report_inference_calls=lambda rid,calls:persisted.append([dict(c) for c in calls])
    gateway.finish_report_generation_run=lambda *a,**kw: None
    monkeypatch.setattr(worker,'_download_report',lambda *a:'old')
    monkeypatch.setattr(GenerationPipeline,'_account_home',lambda *a:'')
    monkeypatch.setattr(GenerationPipeline,'_scoped_home',lambda *a:__import__('contextlib').nullcontext())
    monkeypatch.setattr(gen,'refine',lambda *a,**kw:client.chat([{'role':'user','content':'x'}],settings.hermes_model,max_tokens=100))
    observed=[]
    def dispatch(*a):
        observed.append(bool(persisted and persisted[-1][0]['status']=='reserved'))
        return {'error':'timeout'}
    monkeypatch.setattr('auditlayer_worker.openrouter.one_call',dispatch)
    assert worker._process_refinement_attempt(settings,gateway,GenerationPipeline(settings,gen),{'id':'ref-1','audit_id':'audit-1','section':'Key Gaps'}) is False
    assert observed==[True]


def test_estimated_usd_refinement_is_not_labelled_reported(settings,monkeypatch):
    from auditlayer_worker import worker
    from test_refinement_bundle_lineage import _Gateway
    gateway=_Gateway({'id':'audit-1','handle':'example','platform':'youtube','goal':'growth','report_path':'old'})
    def refine(*a,**kw):
        kw['usage_callback'](100,50,False,{'cost_usd':.000028,'cost_source':'rate_estimated','usage_status':'actual'})
        return 'new',100,50
    monkeypatch.setattr(worker,'_download_report',lambda *a:'old')
    worker._process_refinement_attempt(settings,gateway,SimpleNamespace(refine=refine),{'id':'ref-1','audit_id':'audit-1','section':'Key Gaps'})
    usage=next(payload[1] for name,payload in gateway.calls if name=='update_refinement')
    assert usage['usage_estimated'] is True and usage['usage_status']=='estimated'

def test_missing_migration_fence_fails_closed():
    from unittest.mock import MagicMock
    from auditlayer_worker.supabase_client import SupabaseGateway
    gateway=SupabaseGateway.__new__(SupabaseGateway)
    calls=[{'attempt_id':'a1','status':'reserved'}]
    runs=MagicMock();fences=MagicMock()
    runs.select.return_value.eq.return_value.eq.return_value.execute.return_value.data=[{'audit_id':'audit-1','refinement_id':None,'stage_timings':{'_inference':calls}}]
    fences.select.return_value.eq.return_value.eq.return_value.execute.return_value.data=[]
    gateway.client=MagicMock()
    gateway.client.table.side_effect=lambda name:runs if name=='report_generation_runs' else fences
    with pytest.raises(RuntimeError,match='fence'):
        gateway.record_report_inference_calls('run-1',calls)

import pytest

pytestmark = pytest.mark.usefixtures("fake_agent_root")
from test_generation_runtime import _Client, _payload, _generator, _audit
from auditlayer_worker.generation import GenerationStageError

@pytest.mark.parametrize('row', [
    {'url':'https://www.instagram.com/example/','title':'','description':''},
    {'url':'','title':'example Instagram','description':''},
    {'url':'javascript:alert(1)','title':'example Instagram','description':'100 followers'},
    {'url':'https://instagram.com/example/','title':'example Instagram','description':'example Instagram'},
])
def test_locator_is_not_factual_evidence(row):
    client = _Client([_payload()])
    with pytest.raises(GenerationStageError, match='insufficient_evidence'):
        _generator(client).generate(_audit(), lambda *a: None, research_cache=json.dumps({'web':[row]}))
    assert client.calls == []

@pytest.mark.parametrize('function,expected', [('normalize_latency_ms',1000),('normalize_total_seconds',1)])
def test_nested_receipts_are_not_durations(function, expected):
    from auditlayer_worker.intelligence import telemetry_persistence as tp
    assert getattr(tp,function)({'analysis':1.0,'_inference':[{'cost_usd':None}], 'unknown':100, 'research':float('nan')},None)==expected
