"""Disposable full-chain PostgreSQL regression; never connects to production."""
import json
import os
from pathlib import Path
import subprocess
import time
from types import SimpleNamespace
import uuid
import pytest

ROOT = Path(__file__).resolve().parents[2]

class Database:
    def __init__(self): self.name='alm-runtime-test-'+uuid.uuid4().hex[:12]
    def sql(self, text, fail=False):
        p=subprocess.run(['docker','exec','-i',self.name,'psql','-U','postgres','-XAtq','-v','ON_ERROR_STOP=1'],input=text,text=True,capture_output=True)
        if fail:
            assert p.returncode, 'unexpected SQL success'
            return p.stderr
        assert p.returncode == 0, p.stderr
        return p.stdout.strip()
    def rpc(self,name,p):
        raw=self.sql('set role service_role; select '+name+'('+literal(p)+'::jsonb)')
        try: return json.loads(raw or 'null')
        except ValueError: return raw

def literal(value):
    if value is None: return 'null'
    if isinstance(value,(dict,list)): value=json.dumps(value)
    return "'"+str(value).replace("'","''")+"'"

@pytest.fixture(scope='module')
def db():
    database=Database()
    subprocess.run(['docker','run','--rm','-d','--name',database.name,'-e','POSTGRES_HOST_AUTH_METHOD=trust','pgvector/pgvector@sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b'],check=True,capture_output=True)
    try:
        for _ in range(100):
            if subprocess.run(['docker','exec',database.name,'pg_isready','-h','127.0.0.1','-U','postgres'],capture_output=True).returncode==0: break
            time.sleep(.1)
        database.sql((ROOT/'supabase/tests/commercial-local-bootstrap.sql').read_text())
        database.sql('alter default privileges in schema public grant all on tables to service_role; alter default privileges in schema public grant all on sequences to service_role;')
        for file in sorted((ROOT/'supabase/migrations').glob('*.sql')): database.sql(file.read_text())
        yield database
    finally: subprocess.run(['docker','rm','-f',database.name],capture_output=True)

def audit(db):
    owner=str(uuid.uuid4()); aid=str(uuid.uuid4())
    db.sql(f"insert into auth.users(id,email,email_confirmed_at) values('{owner}','{owner}@example.invalid',now()); insert into audits(id,user_id,handle,platform,goal,status,claimed_by) values('{aid}','{owner}','example','youtube','growth','running','test-worker')")
    return aid

def report_run(db, aid):
    rid=str(uuid.uuid4())
    db.sql(f"insert into report_generation_runs(id,audit_id,worker_id,report_type,model,prompt_version,status,run_kind,cache_mode,account_mode) values('{rid}','{aid}','test-worker','standard','deepseek/deepseek-v4-flash-0731','test','running','production','fresh','unknown')")
    return rid

def reserve(db,rid,attempt='attempt'):
    receipt=dict(attempt_id=attempt,status='reserved',reserved_usd=.0001,cost_source='unknown',cost_usd=None)
    return db.sql(f"update report_generation_runs set stage_timings={literal({'_inference':[receipt]})}::jsonb where id='{rid}'")

class Query:
    """PostgREST-shaped transport to actual SQL; no lifecycle gates mocked."""
    def __init__(self,db,table):
        self.db,self.table=db,table
        self.filters=[];self.action='select';self.payload=None;self.count=None
    def select(self,*a,**kw): self.action='select';return self
    def eq(self,k,v): self.filters.append(k+'='+literal(v));return self
    def ilike(self,k,v): self.filters.append(k+' ilike '+literal(v));return self
    def limit(self,n): self.count=n;return self
    def order(self,*a,**kw): return self
    def insert(self,p): self.action='insert';self.payload=p;return self
    def update(self,p): self.action='update';self.payload=p;return self
    def execute(self):
        where=' where '+' and '.join(self.filters) if self.filters else ''
        if self.action=='select':
            q='select * from '+self.table+where+(' limit '+str(self.count) if self.count else '')
        elif self.action=='insert':
            q='insert into '+self.table+'('+','.join(self.payload)+') values('+','.join(literal(v) for v in self.payload.values())+') returning *'
        else:
            q='update '+self.table+' set '+','.join(k+'='+literal(v) for k,v in self.payload.items())+where+' returning *'
        data=json.loads(self.db.sql("set role service_role; with rows as ("+q+") select coalesce(jsonb_agg(to_jsonb(rows)),'[]') from rows"))
        if self.table=='batch_audits' and self.action=='select':
            for row in data:
                row['audit_batches']=json.loads(self.db.sql("select to_jsonb(b) from audit_batches b where id="+literal(row['batch_id'])))
        return SimpleNamespace(data=data)

class Client:
    def __init__(self,db): self.db=db
    def table(self,name): return Query(self.db,name)
    def rpc(self,name,args):
        def execute():
            q='select '+name+'('+','.join(k+'=>'+literal(v) for k,v in args.items())+')'
            raw=self.db.sql('set role service_role; '+q)
            try: data=json.loads(raw)
            except ValueError: data=raw
            return SimpleNamespace(data=data)
        return SimpleNamespace(execute=execute)


def commercial_audit(db, *, max_calls=2, max_input=32000):
    owner=str(uuid.uuid4());subject=str(uuid.uuid4());brief=str(uuid.uuid4());channel=str(uuid.uuid4())
    db.sql(f"insert into auth.users(id,email,email_confirmed_at) values('{owner}','{owner}@example.invalid',now()); insert into subjects(id,user_id,name) values('{subject}','{owner}','Example'); insert into living_brief_versions(id,subject_id,version,confirmed,identity) values('{brief}','{subject}',1,true,'{{\"name\":\"Pinned marker\"}}'); insert into subject_channels(id,subject_id,channel_type,locator,managed) values('{channel}','{subject}','youtube','example',true)")
    db.rpc('commercial_free_grant',{'owner_id':owner})
    db.sql("insert into commercial_runtime_catalog(id,model,rate_version,input_microusd_per_mtok,output_microusd_per_mtok,max_input_tokens,max_output_tokens,max_calls,research_microusd,qualification_ref,qualified_until) values('auto','deepseek/deepseek-v4-flash-0731','test-only',1000000,2000000,32000,12000,2,100000,'test-only',now()+interval '1 hour') on conflict(id) do nothing")
    db.sql(f"update commercial_runtime_catalog set max_calls={max_calls},max_input_tokens={max_input}")
    quote=db.rpc('commercial_quote',dict(owner_id=owner,subject_id=subject,brief_id=brief,channel_id=channel,goal='growth',report_type='standard'))
    aid=db.rpc('commercial_submit',dict(owner_id=owner,quote_id=quote['id'],consent=True))
    return aid,quote


@pytest.mark.parametrize('mode',['success','timeout','review','correction','call_cap','input_cap','lost_settlement','unknown_finalization','kill'])
def test_actual_ordinary_worker_claim_to_settlement(db,tmp_path,monkeypatch,mode):
    from dataclasses import replace
    from auditlayer_worker.config import WorkerSettings
    from auditlayer_worker.supabase_client import SupabaseGateway
    from auditlayer_worker.hermes_runtime import HermesRuntime
    from auditlayer_worker.observability import WorkerHealth
    from auditlayer_worker.worker import _drain_once
    from test_generation_runtime import _payload
    from auditlayer_worker.openrouter import MODEL
    aid,quote=commercial_audit(db,max_calls=1 if mode=="call_cap" else 2,max_input=1 if mode=="input_cap" else 32000)
    monkeypatch.setattr('auditlayer_worker.config.load_env_files',lambda:None)
    monkeypatch.setenv('ALM_OPENROUTER_API_KEY','offline-only')
    settings=replace(WorkerSettings.from_env(),generator='hermes',hermes_provider='openrouter',hermes_model=MODEL,hermes_mode='inprocess',worker_id='test-worker',alm_accounts_root=str(tmp_path/'accounts'),output_dir=tmp_path)
    gateway=SupabaseGateway.__new__(SupabaseGateway);gateway.settings=settings;gateway.client=Client(db)
    def upload(audit_id,html,version=None):
        path=tmp_path/(audit_id+'.html');path.write_text(html)
        return audit_id+'/fixture.html',''
    gateway.upload_report=upload
    if mode=='unknown_finalization':
        from auditlayer_worker.supabase_client import ReportFinalizationOutcomeUnknown
        def unknown(**kw): raise ReportFinalizationOutcomeUnknown('offline ambiguous fixture')
        gateway.finalize_initial_report=unknown
    if mode=='lost_settlement':
        real_rpc=gateway.client.rpc
        def lost_rpc(name,args):
            call=real_rpc(name,args)
            if name=='commercial_execution_finish':
                def execute():
                    import httpx
                    call.execute()
                    raise httpx.ReadTimeout('response lost after commit')
                return SimpleNamespace(execute=execute)
            return call
        gateway.client.rpc=lost_rpc
    monkeypatch.setattr('auditlayer_worker.hermes_inprocess._public_search_index',lambda *a,**kw:[] if mode=='review' else [dict(url='https://youtube.com/@example',title='example YouTube',description='Example publishes weekly tutorials with 1000 subscribers.')])
    def sdk_complete(self,request,model):
        assert 'Pinned marker' in str(request.messages)
        # Executed inside the REAL bounded child after durable parent reserve.
        rows=json.loads(db.sql(f"select jsonb_agg(stage_timings) from report_generation_runs where audit_id='{aid}'"))
        assert rows[0]['_inference'][-1]['status']=='reserved'
        with (tmp_path/'dispatches').open('a') as f: f.write('dispatch\n')
        if mode=='kill':
            import signal
            os.kill(os.getppid(),signal.SIGKILL)
            time.sleep(10)
        if mode=='timeout': raise TimeoutError('offline unknown upstream')
        content='{}' if mode in ('correction','call_cap') and len(rows[0]['_inference'])==1 else _payload()
        return dict(model=MODEL,id='offline-test',choices=[dict(finish_reason='stop',message=dict(content=content))],usage=dict(prompt_tokens=100,completion_tokens=50,cost=.0002))
    monkeypatch.setattr('auditlayer_worker.openrouter._SDKCall.complete',sdk_complete)
    monkeypatch.setattr('auditlayer_worker.hermes_inprocess._managed_search_results',lambda *a,**kw: [])
    runtime=HermesRuntime(settings)
    try:
        if mode=='kill':
            import multiprocessing
            process=multiprocessing.get_context('fork').Process(target=lambda:_drain_once(settings,gateway,runtime,health=WorkerHealth()))
            process.start();process.join(20)
            if process.is_alive(): process.kill();process.join();pytest.fail('worker did not hit kill boundary')
            assert process.exitcode==-9
        else:
            assert _drain_once(settings,gateway,runtime,health=WorkerHealth())
    finally: runtime.shutdown()
    row=json.loads(db.sql(f"select to_jsonb(a) from audits a where id='{aid}'"))
    expected='blocked' if mode in ('timeout','call_cap','input_cap') else 'needs_review' if mode=='review' else 'running' if mode in ('kill','unknown_finalization') else 'ready'
    assert row['status']==expected,row
    receipt=json.loads(db.sql(f"select coalesce(terminal_payload,'null'::jsonb) from workspace_credit_reservations where id='{quote['id']}'"))
    if mode in ('kill','unknown_finalization'):
        assert receipt is None
        assert db.sql(f"select state from workspace_credit_reservations where id='{quote['id']}'")=='held'
    else:
        assert receipt['outcome']==('success' if expected=='ready' else 'failure')
        assert receipt['customer_debit_microusd']==(600 if expected=='ready' else 0)
        assert receipt['actual_upstream_microusd']==(None if mode=='timeout' else 0 if mode=='input_cap' else 400 if mode=='correction' else 200)
    assert db.sql(f"select count(*) from audit_report_versions where audit_id='{aid}'")==('1' if expected in ('ready','needs_review') else '0')
    dispatched=(tmp_path/'dispatches').read_text().count('dispatch') if (tmp_path/'dispatches').exists() else 0
    assert dispatched==(0 if mode=='input_cap' else 2 if mode=='correction' else 1)
    db.sql('select reap_stale_running(-1); select sweep_retryable_audits(3,0,0)')
    # A restart through the exact production drain must not start a fresh run.
    assert not _drain_once(settings,gateway,runtime,health=WorkerHealth())
    assert ((tmp_path/'dispatches').read_text().count('dispatch') if dispatched else 0)==dispatched


def test_kill_after_reservation_stale_reaper_cannot_replay(db):
    aid=audit(db); rid=report_run(db,aid); reserve(db,rid)
    db.sql(f"update audits set updated_at=now()-interval '2 hours' where id='{aid}'; select reap_stale_running(-1)")
    assert db.sql(f"select status from audits where id='{aid}'")=='blocked'
    other=report_run(db,aid)
    with pytest.raises(AssertionError,match='inference_reconciliation_required'): reserve(db,other,'fresh-attempt')
    assert db.sql(f"select stage_timings->'_inference'->0->>'cost_source' from report_generation_runs where id='{rid}'")=='unknown'

def test_concurrent_audit_reservations_have_one_winner(db):
    from concurrent.futures import ThreadPoolExecutor
    aid=audit(db)
    runs=[report_run(db,aid),report_run(db,aid)]
    def attempt(rid):
        try: reserve(db,rid,rid);return True
        except AssertionError as exc:
            assert 'inference_reconciliation_required' in str(exc)
            return False
    with ThreadPoolExecutor(2) as pool:
        winners=list(pool.map(attempt,runs))
    assert winners.count(True)==1
    assert db.sql(f"select count(*) from audit_inference_fences where audit_id='{aid}'")=='1'
    db.sql(f"update audits set status='failed' where id='{aid}'")


def test_sql_owns_commercial_call_bounds_and_acl(db):
    aid,quote=commercial_audit(db,max_calls=1)
    db.sql(f"update audits set status='running',claimed_by='test-worker' where id='{aid}'")
    db.rpc('commercial_execution_claim',dict(audit_id=aid,worker_id='test-worker',model=quote['runtime']['model']))
    rid=report_run(db,aid)
    valid=dict(attempt_id='one',status='reserved',reserved_usd=.003,input_bound=1000,output_bound=1000)
    def write(calls,fail=False):
        return db.sql(f"update report_generation_runs set stage_timings={literal({'_inference':calls})}::jsonb where id='{rid}'",fail)
    for bad in ({**valid,'input_bound':None},{**valid,'input_bound':32001},{**valid,'output_bound':12001},{**valid,'reserved_usd':.000001}):
        assert 'commercial_inference_bound' in write([bad],True)
    write([valid])
    assert 'commercial_inference_bound' in write([valid,{**valid,'attempt_id':'two'}],True)
    assert 'inference_receipt_history_required' in write([],True)
    for role in ('anon','authenticated','service_role'):
        assert 'permission denied' in db.sql(f"set role {role};delete from audit_inference_fences where audit_id='{aid}'",True)
    db.sql(f"update audits set status='failed' where id='{aid}';select sweep_retryable_audits(3,0,0)")
    assert db.sql(f"select status from audits where id='{aid}'")=='blocked'


@pytest.mark.parametrize('kill',[False,True])
def test_refinement_claim_has_durable_precall_receipt_and_no_replay(db,tmp_path,monkeypatch,kill):
    from dataclasses import replace
    from auditlayer_worker import worker
    from auditlayer_worker.config import WorkerSettings
    from auditlayer_worker.supabase_client import SupabaseGateway
    from auditlayer_worker.hermes_runtime import HermesRuntime
    from auditlayer_worker.observability import WorkerHealth
    from auditlayer_worker.generation import _mock_report_html
    from auditlayer_worker.core import AuditRecord
    from auditlayer_worker.openrouter import MODEL
    aid=audit(db)
    db.sql(f"update audits set status='ready',report_path='fixture/old.html',report_version=1 where id='{aid}'")
    owner=db.sql(f"select user_id from audits where id='{aid}'")
    ref=db.sql(f"set role service_role;select enqueue_report_refinement('{aid}','{owner}',1,'Strengths','Please clarify this section')")
    monkeypatch.setattr('auditlayer_worker.config.load_env_files',lambda:None)
    monkeypatch.setenv('ALM_OPENROUTER_API_KEY','offline-only')
    settings=replace(WorkerSettings.from_env(),generator='hermes',hermes_provider='openrouter',hermes_model=MODEL,hermes_mode='inprocess',worker_id='test-worker',alm_accounts_root=str(tmp_path/'accounts'),output_dir=tmp_path)
    def gateway_factory(config):
        gateway=SupabaseGateway.__new__(SupabaseGateway);gateway.settings=config;gateway.client=Client(db)
        return gateway
    monkeypatch.setattr(worker,'SupabaseGateway',gateway_factory)
    monkeypatch.setattr(worker,'_download_report',lambda *a:_mock_report_html(AuditRecord(id=aid,handle='example',platform='youtube',goal='growth')))
    def sdk_complete(self,request,model):
        row=json.loads(db.sql(f"select stage_timings from report_generation_runs where refinement_id='{ref}'"))
        assert row['_inference'][0]['status']=='reserved'
        (tmp_path/'ref-dispatched').write_text('yes')
        if kill:
            import signal
            os.kill(os.getppid(),signal.SIGKILL)
            time.sleep(10)
        raise TimeoutError('offline timeout')
    monkeypatch.setattr('auditlayer_worker.openrouter._SDKCall.complete',sdk_complete)
    gateway=gateway_factory(settings);runtime=HermesRuntime(settings)
    try:
        assert worker._drain_once(settings,gateway,runtime,health=WorkerHealth())
        assert (tmp_path/'ref-dispatched').read_text()=='yes'
        if kill:
            assert db.sql(f"select status from refinements where id='{ref}'")=='running'
            db.sql(f"update refinements set lease_expires_at=now()-interval '1 minute' where id='{ref}';select sweep_stale_refinements()")
        row=json.loads(db.sql(f"select to_jsonb(r) from refinements r where id='{ref}'"))
        assert row['status']=='failed' and row['cost_usd'] is None and row['usage_status']=='unknown'
        receipts=json.loads(db.sql(f"select stage_timings from report_generation_runs where refinement_id='{ref}'"))
        assert receipts['_inference'][0]['cost_usd'] is None
        assert not worker._drain_once(settings,gateway,runtime,health=WorkerHealth())
        with pytest.raises(AssertionError,match='unique'):
            gateway.start_report_generation_run(audit_id=None,refinement_id=ref,worker_id=settings.worker_id,report_type='refinement',model=MODEL,prompt_version='test',bundle_version=None,cache_mode='fresh')
    finally:runtime.shutdown()
    # Preserve the existing audit-deletion cascade; admission fences are not a
    # new customer-retention policy.
    db.sql(f"delete from audits where id='{aid}'")
    assert db.sql(f"select count(*) from report_generation_runs where refinement_id='{ref}'")=='0'


def test_legacy_no_dispatch_stale_recovery_unchanged(db):
    aid=audit(db)
    db.sql(f"update audits set updated_at=now()-interval '2 hours' where id='{aid}'; select reap_stale_running(-1)")
    assert db.sql(f"select status from audits where id='{aid}'")=='queued'
    db.sql(f"update audits set status='blocked' where id='{aid}'")
