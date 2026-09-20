"""Real disposable PostgreSQL integration; never accepts a connection URL."""
import concurrent.futures
import json
import pathlib
import subprocess
import time
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
IMAGE = 'pgvector/pgvector@sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b'

class Database:
    def __enter__(self):
        self.name = 'alm-execution-' + uuid.uuid4().hex[:12]
        subprocess.run(['docker','run','--rm','-d','--name',self.name,'-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=execution','-p','127.0.0.1::5432',IMAGE], check=True, capture_output=True)
        try:
            for _ in range(100):
                if subprocess.run(['docker','exec',self.name,'pg_isready','-h','127.0.0.1','-U','postgres'],capture_output=True).returncode == 0: break
                time.sleep(.1)
            self.sql((ROOT/'supabase/tests/commercial-local-bootstrap.sql').read_text())
            for path in sorted((ROOT/'supabase/migrations').glob('*.sql')):
                if path.name > '20260919221938_workspace_execution_lifecycle.sql': continue
                self.sql(path.read_text())
            print('Disposable port:',subprocess.check_output(['docker','port',self.name,'5432'],text=True).strip())
            return self
        except BaseException:
            self.__exit__()
            raise
    def __exit__(self,*_):
        subprocess.run(['docker','rm','-f',self.name],capture_output=True)
    def sql(self,q):
        p=subprocess.run(['docker','exec','-i',self.name,'psql','-U','postgres','-d','execution','-XAtq','-v','ON_ERROR_STOP=1'],input=q,text=True,capture_output=True)
        if p.returncode: raise RuntimeError(p.stderr)
        return p.stdout.strip()
    def rpc(self,name,p):
        value=self.sql("set role service_role; select public."+name+"('"+json.dumps(p).replace("'","''")+"'::jsonb)")
        try: return json.loads(value)
        except ValueError: return value

def uid(): return str(uuid.uuid4())

def setup(db):
    owner,subject,brief,run,audit,snapshot=[uid() for _ in range(6)]
    db.sql(f"insert into auth.users(id,email) values('{owner}','{owner}@example.invalid'); update profiles set stripe_customer_id='cus_{owner}',stripe_subscription_id='sub_{owner}',subscription_status='active',current_period_start=to_timestamp(1700000000),current_period_end=to_timestamp(2000000000) where id='{owner}'; insert into subjects(id,user_id,name) values('{subject}','{owner}','Execution'); insert into living_brief_versions(id,subject_id,version,confirmed) values('{brief}','{subject}',1,true); insert into evidence_snapshots(id,subject_id) values('{snapshot}','{subject}'); insert into intelligence_runs(id,subject_id,brief_version,evidence_snapshot_id,methodology_version,expertise_pack_version,prompt_version,model_config_hash) values('{run}','{subject}',1,'{snapshot}','test','test','test','test'); insert into audits(id,user_id,handle,status,claimed_by,claimed_at) values('{audit}','{owner}','test','running','worker-test',now());")
    batch=uid()
    db.sql(f"insert into audit_batches(id,user_id,subject_id,idempotency_key) values('{batch}','{owner}','{subject}','{batch}'); insert into batch_audits(batch_id,audit_id) values('{batch}','{audit}')")
    # Billing lane owns the policy migration; inspect its exact active constant.
    policy=db.sql("select pg_get_functiondef('workspace_credit_grant(jsonb)'::regprocedure)")
    policy='P-01.v1' if "'P-01.v1'" in policy else 'p01.v1'
    db.rpc('workspace_credit_grant',dict(owner_id=owner,event_id='evt_'+owner,payment_id='in_'+owner,subscription_id='sub_'+owner,customer_id='cus_'+owner,period_start=1700000000,period_end=2000000000,kind='included',amount_microusd=30000000,paid_microusd=129000000,policy_version=policy))
    refs=dict(owner_id=owner,subject_id=subject,context_version_id=brief,workflow_id=uid(),workflow_version_id=uid(),policy_version='P-01.v1',contract_version='workspace.v1')
    model=dict(provider='test',model='test',model_version='test-v1',data_route='https://example.invalid')
    quote=dict(id=uid(),refs=refs,model=model,rate_card_version='synthetic-test',input_fingerprint='sha256:'+'a'*64,customer_max=dict(currency='USD',microusd=300),upstream_max=dict(currency='USD',microusd=100),created_at='2026-09-19T00:00:00Z',expires_at='2033-05-18T03:33:20Z')
    intent=dict(id=uid(),quote=quote,idempotency_key=uid(),requested_at=quote['created_at'],consent=dict(model_data_route=True,customer_max=True),trigger='manual',schedule_id=None)
    expected=dict(owner_id=owner,subject_id=subject,intent_id=intent['id'],request_fingerprint='a'*64,**model,rate_card_version=quote['rate_card_version'],upstream_max_microusd=100,customer_max_microusd=300)
    return dict(intent=intent,reservation_id=uid(),audit_id=audit,intelligence_run_id=run,attempt_id=uid(),worker_id='worker-test',lease_seconds=300,expected=expected)

def dispatch(p): return {k:p[k] for k in ('reservation_id','attempt_id','worker_id','expected')}

def scheduled(p, occurrence_id, workflow=None, version=None):
    from copy import deepcopy
    payload=deepcopy(p)
    payload['intent']['trigger']='schedule'
    payload['intent']['schedule_id']=occurrence_id
    payload['intent']['quote']['refs']['workflow_id']=workflow or uid()
    payload['intent']['quote']['refs']['workflow_version_id']=version or uid()
    return payload

def workflow_fixture(db, p):
    owner=p['expected']['owner_id']
    workflow,version,occurrence=uid(),uid(),uid()
    db.rpc('brand_workflow_save',dict(owner_id=owner,workflow_id=workflow,version_id=version,
        subject_id=p['expected']['subject_id'],objective='Weekly brand review',timezone='UTC',
        local_time='09:00',weekday=1,model=p['intent']['quote']['model'],
        rate_card_version=p['intent']['quote']['rate_card_version'],method_version='test',
        allowed_tools=[],customer_max_microusd=1,upstream_max_microusd=1,recipients=[owner],input={'test':1}))
    db.sql(f"insert into brand_workflow_occurrences(id,workflow_id,version_id,owner_id,subject_id,context_version_id,scheduled_at) values('{occurrence}','{workflow}','{version}','{owner}','{p['expected']['subject_id']}','{p['intent']['quote']['refs']['context_version_id']}',now())")
    return workflow,version,occurrence

def grant_and_activate(db, p, workflow, version, kind, granted):
    owner=p['expected']['owner_id']
    db.rpc('brand_workflow_grant',dict(owner_id=owner,workflow_id=workflow,version_id=version,recipient_id=owner,kind=kind,granted=granted))
    if granted:
        db.rpc('brand_workflow_control',dict(owner_id=owner,workflow_id=workflow,version_id=version,command='activate'))

def test_admission_dispatch():
    with Database() as db:
        p=setup(db)
        assert db.rpc('workspace_execution_admit',p)==p['reservation_id']
        assert db.rpc('workspace_execution_admit',p)==p['reservation_id']
        def call(_):
            try: return db.rpc('workspace_execution_dispatch',dispatch(p))
            except RuntimeError as exc: return str(exc)
        with concurrent.futures.ThreadPoolExecutor(2) as pool: outcomes=list(pool.map(call,range(2)))
        assert sum(isinstance(x,dict) for x in outcomes)==1
        assert any('dispatch_consumed' in x for x in outcomes if isinstance(x,str))
        assert 'dispatch_consumed' in call(None)
        assert db.sql('select count(*) from workspace_credit_reservations')=='1'
        print('PASS real SQL atomic admission and cross-process one-dispatch')

def receipt(p, *, actual=False):
    q=p['intent']['quote']
    money=lambda n: dict(currency='USD',microusd=n)
    return dict(id=uid(),run_intent_id=p['intent']['id'],reservation_id=p['reservation_id'],refs=q['refs'],model=q['model'],rate_card_version=q['rate_card_version'],measurement='actual' if actual else 'unknown',status='succeeded' if actual else 'pending_reconciliation',input_tokens=1 if actual else None,cache_read_tokens=0 if actual else None,cache_write_tokens=0 if actual else None,output_tokens=1 if actual else None,tool_calls=0 if actual else None,customer_charge=money(3 if actual else 0),successful_path_upstream_cost=money(1) if actual else None,absorbed_retry_upstream_cost=money(0) if actual else None,total_upstream_cost=money(1) if actual else None,settled_at='2026-09-19T00:00:00Z' if actual else None)

def denied(db,name,p,code):
    try: db.rpc(name,p)
    except RuntimeError as exc: assert code in str(exc), str(exc)
    else: raise AssertionError('unexpected success')

def test_finish_revoke():
    with Database() as db:
        p=setup(db); db.rpc('workspace_execution_admit',p)
        db.rpc('workspace_execution_revoke',dict(owner_id=p['expected']['owner_id'],reservation_id=p['reservation_id']))
        denied(db,'workspace_execution_dispatch',dispatch(p),'dispatch_denied')
        p=setup(db); db.rpc('workspace_execution_admit',p); db.rpc('workspace_execution_dispatch',dispatch(p))
        unknown=dict(reservation_id=p['reservation_id'],receipt=receipt(p),artifact_version_id=None)
        assert db.rpc('workspace_execution_finish',unknown)==p['reservation_id']
        assert db.rpc('workspace_execution_finish',unknown)==p['reservation_id']
        assert db.sql(f"select (actual_upstream_microusd is null)::text||':'||customer_debit_microusd from workspace_credit_reservations where id='{p['reservation_id']}'")=='true:0'
        p=setup(db); db.rpc('workspace_execution_admit',p); db.rpc('workspace_execution_dispatch',dispatch(p))
        version=uid()
        fin=dict(reservation_id=p['reservation_id'],receipt=receipt(p,actual=True),artifact_version_id=version)
        denied(db,'workspace_execution_finish',fin,'artifact_link_denied')
        db.sql(f"insert into audit_report_versions(id,audit_id,version,report_path,intelligence_run_id) values('{version}','{p['audit_id']}',1,'private/test.html','{p['intelligence_run_id']}')")
        with concurrent.futures.ThreadPoolExecutor(2) as pool: results=list(pool.map(lambda _:db.rpc('workspace_execution_finish',fin),range(2)))
        assert results==[p['reservation_id']]*2
        assert db.sql("select sum(amount_microusd) from workspace_credit_ledger where kind='debit'")=='3'
        denied(db,'workspace_execution_finish',{**fin,'receipt':{**fin['receipt'],'id':uid()}},'receipt_mismatch')
        for role in ('anon','authenticated'):
            try: db.sql(f"set role {role}; select workspace_execution_dispatch('{{}}'::jsonb)")
            except RuntimeError as exc: assert 'permission denied' in str(exc)
            else: raise AssertionError('public execution allowed')
        print('PASS revocation, pending unknown liability, artifact linkage and concurrent exactly-once settlement')

def test_atomic_publication():
    with Database() as db:
        p=setup(db); db.rpc('workspace_execution_admit',p); db.rpc('workspace_execution_dispatch',dispatch(p))
        pub=dict(reservation_id=p['reservation_id'],receipt=receipt(p),report_path=p['audit_id']+'/revisions/'+p['attempt_id']+'.html',delivery_status='ready',prompt_version='test',agent_bundle_version='test')
        version=db.rpc('workspace_execution_publish',pub)
        assert version==db.rpc('workspace_execution_publish',pub)
        assert db.sql(f"select count(*) from audit_report_versions where audit_id='{p['audit_id']}'")=='1'
        assert db.sql(f"select artifact_version_id::text from workspace_executions where reservation_id='{p['reservation_id']}'")==version
        denied(db,'workspace_execution_publish',{**pub,'report_path':'changed'},'publication_mismatch')
        print('PASS actual report finalizer and receipt atomically linked; lost-response retry stable')

def test_scheduled_intent_requires_live_workflow_grant_authority():
    with Database() as db:
        p=setup(db)
        # Fabricated occurrence: the workflow lane's own authority refuses it.
        denied(db,'workspace_execution_admit',scheduled(p,uid()),'workflow_permission_denied')
        workflow,version,occurrence=workflow_fixture(db,p)
        scheduled_intent=scheduled(p,occurrence,workflow,version)
        denied(db,'workspace_execution_admit',scheduled_intent,'workflow_permission_denied')  # grants not yet given
        for kind in ('run','schedule'):
            db.rpc('brand_workflow_grant',dict(owner_id=p['expected']['owner_id'],workflow_id=workflow,version_id=version,recipient_id=p['expected']['owner_id'],kind=kind,granted=True))
        grant_and_activate(db,p,workflow,version,'run',True)
        # A granted occurrence of a DIFFERENT workflow cannot be substituted.
        other_workflow,other_version,other_occurrence=workflow_fixture(db,p)
        for kind in ('run','schedule'):
            db.rpc('brand_workflow_grant',dict(owner_id=p['expected']['owner_id'],workflow_id=other_workflow,version_id=other_version,recipient_id=p['expected']['owner_id'],kind=kind,granted=True))
        grant_and_activate(db,p,other_workflow,other_version,'run',True)
        denied(db,'workspace_execution_admit',scheduled(p,other_occurrence,workflow,version),'schedule_authority_denied')
        assert db.rpc('workspace_execution_admit',scheduled_intent)==scheduled_intent['reservation_id']
        grant_and_activate(db,p,workflow,version,'run',False)
        denied(db,'workspace_execution_dispatch',dispatch(scheduled_intent),'permission_denied')
        grant_and_activate(db,p,workflow,version,'run',True)
        assert db.rpc('workspace_execution_dispatch',dispatch(scheduled_intent))['receipt_id']==p['attempt_id']
        print('PASS scheduled admission bound to durable occurrence and live revocable grants')

if __name__ == '__main__':
    test_admission_dispatch()
    test_finish_revoke()
    test_atomic_publication()
    test_scheduled_intent_requires_live_workflow_grant_authority()
