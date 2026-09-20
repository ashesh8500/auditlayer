"""Real full-chain SQL → ordinary worker → pinned research → settlement."""
import json
import uuid
from dataclasses import replace
from types import SimpleNamespace
import pytest

pytestmark = pytest.mark.usefixtures("fake_agent_root")
from test_runtime_sql_integration import db, Client, literal
from test_openrouter_research import POLICY, research_response
from test_generation_runtime import _payload


def research_audit(db):
    owner, subject, brief, channel = [str(uuid.uuid4()) for _ in range(4)]
    db.sql(f"insert into auth.users(id,email,email_confirmed_at) values('{owner}','{owner}@example.invalid',now()); insert into subjects(id,user_id,name) values('{subject}','{owner}','Example'); insert into living_brief_versions(id,subject_id,version,confirmed,identity) values('{brief}','{subject}',1,true,'{{\"name\":\"Pinned marker\"}}'); insert into subject_channels(id,subject_id,channel_type,locator,managed) values('{channel}','{subject}','instagram','example',true)")
    db.rpc('commercial_free_grant', {'owner_id': owner})
    db.sql("delete from commercial_runtime_catalog; insert into commercial_runtime_catalog(id,model,rate_version,input_microusd_per_mtok,output_microusd_per_mtok,max_input_tokens,max_output_tokens,max_calls,research_microusd,research_policy,qualification_ref,qualified_until) values('auto','deepseek/deepseek-v4-flash-0731','exa-test-only',140000,280000,32000,12000,2,0,"+literal(POLICY)+"::jsonb,'offline-test-only',now()+interval '1 hour')")
    quote = db.rpc('commercial_quote', dict(owner_id=owner, subject_id=subject, brief_id=brief,
                                          channel_id=channel, goal='growth', report_type='standard'))
    assert quote['runtime']['research_policy'] == POLICY
    assert quote['upstream_microusd'] == 206253
    assert quote['retail_microusd'] == 618759
    aid = db.rpc('commercial_submit', dict(owner_id=owner, quote_id=quote['id'], consent=True))
    return aid, quote


@pytest.mark.parametrize('mode', ['success','correction','timeout','report_timeout','operator_cap','empty'])
def test_research_ordinary_path(db, tmp_path, monkeypatch, mode):
    from auditlayer_worker.config import WorkerSettings
    from auditlayer_worker.supabase_client import SupabaseGateway
    from auditlayer_worker.hermes_runtime import HermesRuntime
    from auditlayer_worker.observability import WorkerHealth
    from auditlayer_worker.worker import _drain_once
    from auditlayer_worker.openrouter import MODEL
    aid, quote = research_audit(db)
    monkeypatch.setattr('auditlayer_worker.config.load_env_files', lambda: None)
    monkeypatch.setenv('ALM_OPENROUTER_API_KEY', 'offline-only')
    settings = replace(WorkerSettings.from_env(), generator='hermes', hermes_provider='openrouter',
                       hermes_model=MODEL, hermes_mode='inprocess', worker_id='test-worker',
                       token_cap=120000 if mode=='operator_cap' else 1398976, cost_cap_usd=1,
                       alm_accounts_root=str(tmp_path/'accounts'), output_dir=tmp_path)
    # Operator app budget is explicit and local to the disposable SQL fixture.
    db.sql("update app_settings set token_cap=1398976,cost_cap_usd=1")
    gateway = SupabaseGateway.__new__(SupabaseGateway)
    gateway.settings=settings; gateway.client=Client(db)
    def upload(audit_id, html, version=None):
        (tmp_path/'report.html').write_text(html)
        return audit_id+'/fixture.html',''
    gateway.upload_report=upload
    monkeypatch.setattr('auditlayer_worker.hermes_inprocess._public_search_index', lambda *a,**kw: pytest.fail('fallback'))
    monkeypatch.setattr('auditlayer_worker.hermes_inprocess._managed_search_results', lambda *a,**kw: pytest.fail('managed tools'))
    def sdk_complete(self, request, model):
        rows=json.loads(db.sql(f"select jsonb_agg(stage_timings) from report_generation_runs where audit_id='{aid}'"))
        calls=rows[0]['_inference']
        assert calls[-1]['status']=='reserved'
        with (tmp_path/'dispatches').open('a') as f: f.write(calls[-1]['stage']+'\n')
        if request.research:
            assert calls[-1]['input_bound']==1310720
            if mode=='timeout': raise TimeoutError('unknown research liability')
            raw=research_response()
            if mode=='empty': raw['choices'][0]['message']['annotations']=[]
            return raw
        assert 'Pinned marker' in str(request.messages)
        assert 'GENERATED NOT EVIDENCE' not in str(request.messages)
        if mode=='report_timeout': raise TimeoutError('unknown report liability')
        assert 'weekly cooking tutorials' in str(request.messages)
        content='{}' if mode=='correction' and len(calls)==2 else _payload()
        return dict(model=MODEL,id='offline-report',choices=[dict(finish_reason='stop',message=dict(content=content))],usage=dict(prompt_tokens=100,completion_tokens=50,cost=.00002))
    monkeypatch.setattr('auditlayer_worker.openrouter._SDKCall.complete',sdk_complete)
    runtime=HermesRuntime(settings)
    try: assert _drain_once(settings,gateway,runtime,health=WorkerHealth())
    finally: runtime.shutdown()
    receipt=json.loads(db.sql(f"select terminal_payload from workspace_credit_reservations where id='{quote['id']}'"))
    successful=mode in ('success','correction')
    assert receipt['outcome']==('success' if successful else 'failure')
    # Reference tariff: (1241*.14+256*.28)/M + .007 search, all x3,
    # plus only the successful report's 100/50 tokens. Rejected format is ALM COGS.
    assert receipt['customer_debit_microusd']==(21821 if successful else 0)
    assert receipt['actual_upstream_microusd']==(None if mode in ('timeout','report_timeout') else 0 if mode=='operator_cap' else 7131 if mode=='correction' else 7111 if successful else 7091)
    rows=json.loads(db.sql(f"select coalesce(jsonb_agg(stage_timings),'[]') from report_generation_runs where audit_id='{aid}'"))
    calls=rows[0].get('_inference',[]) if rows else []
    assert len(calls)==(0 if mode=='operator_cap' else 3 if mode=='correction' else 2 if mode in ('success','report_timeout') else 1)
    if calls: assert calls[0]['stage']=='research'
    if successful:
        assert 'OpenRouter Exa extracted source' in (tmp_path/'report.html').read_text()
    db.sql('select reap_stale_running(-1);select sweep_retryable_audits(3,0,0)')
    assert not _drain_once(settings,gateway,runtime,health=WorkerHealth())


def test_sql_research_pins_history_and_owner_isolation(db):
    import subprocess
    from pathlib import Path
    from test_runtime_sql_integration import report_run
    aid,quote=research_audit(db)
    # Feed an unmodified SQL quote through the actual bundled server action.
    root=Path(__file__).resolve().parents[2]
    probe=subprocess.run(['node',str(root/'web/scripts/commercial-review-probe.cjs')],
                         input=json.dumps({'owner':quote['owner_id'],'quote':quote,'input':quote['request']}),
                         text=True,capture_output=True)
    assert probe.returncode==0,probe.stdout+probe.stderr
    foreign=str(uuid.uuid4())
    assert db.sql(f"set role authenticated;set request.jwt.claim.sub='{foreign}';select count(*) from commercial_quotes where id='{quote['id']}'")=='0'
    for role in ('anon','authenticated'):
        assert 'permission denied' in db.sql(f"set role {role};select commercial_quote('{{}}')",True)
    db.sql(f"update audits set status='running',claimed_by='test-worker' where id='{aid}'")
    db.rpc('commercial_execution_claim',dict(audit_id=aid,worker_id='test-worker',model=quote['runtime']['model']))
    rid=report_run(db,aid)
    receipt=dict(attempt_id='r',stage='research',status='reserved',research_version=POLICY['version'],
                 search_engine='exa',search_mode='fast',max_results=3,search_fee_bound_usd=.007,
                 input_bound=1310720,output_bound=256,reserved_usd=.19057248)
    def write(calls,fail=False):
        return db.sql(f"update report_generation_runs set stage_timings={literal({'_inference':calls})} where id='{rid}'",fail)
    for mutation in ({'input_bound':32000},{'output_bound':257},{'search_engine':'native'},
                     {'reserved_usd':.007},{'research_version':'v0'}):
        assert 'commercial_' in write([{**receipt,**mutation}],True)
    write([receipt])
    assert 'commercial_research_bound' in write([receipt,{**receipt,'attempt_id':'r2'}],True)
    assert 'inference_receipt_history_required' in write([{**receipt,'stage':'analysis'}],True)
    assert 'inference_receipt_history_required' in write([],True)
    db.sql(f"update audits set updated_at=now()-interval '2 hours' where id='{aid}';select reap_stale_running(-1)")
    assert db.sql(f"select status from audits where id='{aid}'")=='blocked'
    # The research reservation alone is sufficient to prevent another paid run.
    other=report_run(db,aid)
    assert 'inference_reconciliation_required' in db.sql(f"update report_generation_runs set stage_timings={literal({'_inference':[receipt]})} where id='{other}'",True)
    assert db.sql(f"select state from workspace_credit_reservations where id='{quote['id']}'")=='held'
