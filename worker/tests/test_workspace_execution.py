"""Workspace execution uses canonical contracts and the real SQL authority."""
import importlib.util
from pathlib import Path
import pytest

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('execution_sql_test',ROOT/'supabase/tests/workspace_execution_test.py')
sqltests=importlib.util.module_from_spec(spec)
spec.loader.exec_module(sqltests)


def test_pipeline_has_explicit_workspace_port_without_legacy_fallback():
    from auditlayer_worker.pipeline import GenerationPipeline
    class Port:
        def run(self, audit, sink, *, gateway):
            return ('workspace',audit,gateway)
    pipeline=GenerationPipeline(None,None)
    assert pipeline.run('audit',None,gateway='db',workspace_execution=Port())==('workspace','audit','db')


@pytest.mark.parametrize('successful_analysis', [False, True])
def test_real_sql_pipeline_unknown_provider_failure_cannot_replay(tmp_path, successful_analysis):
    from auditlayer_worker.workspace_execution import WorkspaceExecution
    from auditlayer_worker.model_execution.execution import Request, request_expectations
    from auditlayer_worker.model_execution.catalog import CATALOG
    from auditlayer_worker.pipeline import GenerationPipeline
    from auditlayer_worker.core import AuditRecord
    import multiprocessing
    calls=multiprocessing.get_context('fork').Value('i',0)
    class Boundary:
        def count_input(self,messages): return 1
        def complete(self,request,model):
            with calls.get_lock(): calls.value+=1
            if successful_analysis:
                import json
                from auditlayer_worker.core import STANDARD_SECTIONS
                analysis={'sections':[{'heading':h.replace('[Milestone]','20K Followers'),'lede':'Data needed.','items':[{'title':'Observe','body':'Collect evidence before a decision.'}]} for h in STANDARD_SECTIONS]}
                return {'model':model.model,'choices':[{'finish_reason':'stop','message':{'content':json.dumps(analysis)}}]}
            raise RuntimeError('provider transport ambiguity')
    class Gateway:
        def workspace_rpc(self,name,p): return db.rpc(name,p)
        def upload_workspace_report(self,audit_id,attempt_id,html):
            path=f'{audit_id}/revisions/{attempt_id}.html'
            target=tmp_path/path; target.parent.mkdir(parents=True,exist_ok=True); target.write_text(html)
            return path
    class Sink:
        def emit(self,*args,**kwargs): pass
    with sqltests.Database() as db:
        p=sqltests.setup(db)
        audit=AuditRecord(id=p['audit_id'],user_id=p['expected']['owner_id'],handle='test',platform='instagram',goal='growth',context='')
        model=CATALOG['gpt-5.6-sol']
        req=Request(owner_id=audit.user_id,subject_id=p['expected']['subject_id'],intent_id=p['intent']['id'],attempt_id=p['attempt_id'],model=model,audit=audit,system='JSON only',user='Previously admitted evidence snapshot',max_input=100,max_output=100,timeout_seconds=1)
        expected=request_expectations(req)
        q=p['intent']['quote']; q.update(model={k:expected[k] for k in ('provider','model','model_version','data_route')},rate_card_version=model.rate_version,input_fingerprint='sha256:'+expected['request_fingerprint'],customer_max=dict(currency='USD',microusd=expected['customer_max_microusd']),upstream_max=dict(currency='USD',microusd=expected['upstream_max_microusd']))
        def port(qualification='offline-fixture-only'):
            return WorkspaceExecution(intent=p['intent'],request=req,reservation_id=p['reservation_id'],intelligence_run_id=p['intelligence_run_id'],worker_id=p['worker_id'],boundary=Boundary(),qualification_id=qualification,bundle_version='offline-fixture-bundle-v1')
        with pytest.raises(ValueError,match='qualification'): port(None)
        result=GenerationPipeline(None,None).run(audit,Sink(),gateway=Gateway(),workspace_execution=port())
        assert result.receipt['measurement']=='unknown'
        assert result.receipt['customer_charge']['microusd']==0
        assert result.receipt['total_upstream_cost'] is None
        assert calls.value==1
        with pytest.raises(RuntimeError,match='dispatch_consumed'):
            GenerationPipeline(None,None).run(audit,Sink(),gateway=Gateway(),workspace_execution=port())
        assert calls.value==1


def test_gateway_forwards_single_p_argument_and_result():
    from auditlayer_worker.supabase_client import SupabaseGateway
    class Rpc:
        def __init__(self, log): self.log=log
        def rpc(self,name,payload):
            self.log.append((name,payload)); return self
        def execute(self): return type('R',(),{'data':['version-1']})()
    log=[]
    gateway=object.__new__(SupabaseGateway)
    gateway.client=Rpc(log)
    assert gateway.workspace_rpc('workspace_execution_finish',{'reservation_id':'r'})=='version-1'
    assert log==[('workspace_execution_finish',{'p':{'reservation_id':'r'}})]
    with pytest.raises(ValueError): gateway.workspace_rpc('workspace_credit_finish',{})


def test_workspace_port_reads_no_ambient_configuration(tmp_path):
    """Trusted composition only: no env, credential file or provider client."""
    import builtins
    import json as jsonlib
    import os
    from dataclasses import replace
    from auditlayer_worker.core import AuditRecord, STANDARD_SECTIONS
    from auditlayer_worker.model_execution.catalog import CATALOG
    from auditlayer_worker.model_execution.execution import Request, request_expectations
    from auditlayer_worker.workspace_execution import WorkspaceExecution, WorkspaceRunResult

    analysis = {'sections': [{'heading': h.replace('[Milestone]', '20K Followers'), 'lede': 'Data needed.',
        'items': [{'title': 'Observe', 'body': 'Collect evidence before a decision.'}]} for h in STANDARD_SECTIONS]}
    class Boundary:
        def count_input(self, messages): return 1
        def complete(self, request, model):
            return {'model': model.model, 'choices': [{'finish_reason': 'stop',
                'message': {'content': jsonlib.dumps(analysis)}}]}
    rpcs = []
    admitted = {}
    class Gateway:
        def workspace_rpc(self, name, payload):
            rpcs.append(name)
            if name == 'workspace_execution_dispatch':
                admitted.update(payload['expected'])
                return dict(payload['expected'], receipt_id=payload['attempt_id'])
            return 'version-1'
        def upload_workspace_report(self, audit_id, attempt_id, html): return 'path'
    class Sink:
        def __init__(self): self.events = []
        def emit(self, phase, detail='', **kwargs): self.events.append((phase, detail))

    class Ambient(dict):
        def __getitem__(self, key): raise AssertionError('environment read: ' + key)
        def get(self, *args, **kwargs): raise AssertionError('environment read')
        def __contains__(self, key): raise AssertionError('environment read')
    real_open = builtins.open
    def guarded(path, *args, **kwargs):
        if isinstance(path, int) or str(path).startswith(str(tmp_path)):
            return real_open(path, *args, **kwargs)
        raise AssertionError('filesystem read: ' + str(path))

    from auditlayer_worker import workspace_execution as module
    from uuid import uuid4
    owner, subject = str(uuid4()), str(uuid4())
    audit = AuditRecord(id=str(uuid4()), user_id=owner, handle='test',
        platform='instagram', goal='growth', context='')
    model = CATALOG['gpt-5.6-sol']
    intent_id = str(uuid4())
    request = Request(owner_id=owner, subject_id=subject, intent_id=intent_id,
        attempt_id=str(uuid4()), model=model, audit=audit,
        system='JSON only', user='Previously admitted evidence snapshot.',
        max_input=100, max_output=100, timeout_seconds=1)
    expected = request_expectations(request)
    refs = dict(owner_id=owner, subject_id=subject, context_version_id=str(uuid4()),
        workflow_id=str(uuid4()), workflow_version_id=str(uuid4()),
        policy_version='P-01.v1', contract_version='workspace.v1')
    quote = dict(id=str(uuid4()), refs=refs,
        model={k: expected[k] for k in ('provider', 'model', 'model_version', 'data_route')},
        rate_card_version=model.rate_version, input_fingerprint='sha256:' + expected['request_fingerprint'],
        customer_max=dict(currency='USD', microusd=expected['customer_max_microusd']),
        upstream_max=dict(currency='USD', microusd=expected['upstream_max_microusd']),
        created_at='2026-09-19T00:00:00Z', expires_at='2033-05-18T03:33:20Z')
    intent = dict(id=intent_id, quote=quote, idempotency_key='k' * 16,
        requested_at='2026-09-19T00:00:00Z', consent=dict(model_data_route=True, customer_max=True),
        trigger='manual', schedule_id=None)
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(os, 'environ', Ambient())
        patch.setattr(builtins, 'open', guarded)
        patch.setattr(module, 'open', guarded, raising=False)
        result = module.WorkspaceExecution(intent=intent, request=request,
            reservation_id=str(uuid4()), intelligence_run_id=str(uuid4()),
            worker_id='worker', boundary=Boundary(), qualification_id='deployment-qualification',
            bundle_version='bundle-v1').run(audit, Sink(), gateway=Gateway())
    assert isinstance(result, WorkspaceRunResult)
    assert rpcs == ['workspace_execution_admit', 'workspace_execution_dispatch', 'workspace_execution_publish']
    assert result.receipt['measurement'] == 'unknown'
    assert result.receipt['customer_charge']['microusd'] == 0
    assert result.receipt['total_upstream_cost'] is None
    with pytest.raises(ValueError): module.WorkspaceExecution(intent=intent,
        request=replace(request, tools=('web',)), reservation_id=str(uuid4()),
        intelligence_run_id=str(uuid4()), worker_id='worker', boundary=Boundary(),
        qualification_id='deployment-qualification', bundle_version='bundle-v1')


def test_generated_contract_boundary_rejects_malformed_intent():
    from auditlayer_worker.workspace_execution import validate_intent
    with pytest.raises(ValueError): validate_intent({})
