"""Commercial command tracer, isolated actual PostgreSQL; no external payment/model calls."""
import json,pathlib,subprocess,time,uuid,concurrent.futures
ROOT=pathlib.Path(__file__).resolve().parents[2]
NAME='alm-composition-'+uuid.uuid4().hex[:12]
def run(*args,input=None): return subprocess.run(args,input=input,text=True,capture_output=True)
def sql(q,fail=False):
 p=run('docker','exec','-i',NAME,'psql','-U','postgres','-XAtq','-v','ON_ERROR_STOP=1',input=q)
 if fail:
  assert p.returncode,'unexpected success';return p.stderr
 assert not p.returncode,p.stderr
 return p.stdout.strip()
def rpc(fn,p,fail=False):
 v=sql("set role service_role;select "+fn+"('"+json.dumps(p).replace("'","''")+"'::jsonb)",fail)
 if fail:return v
 try:return json.loads(v)
 except ValueError:return v
def owner():
 o=str(uuid.uuid4());sql(f"insert into auth.users(id,email,email_confirmed_at) values('{o}','{o}@example.invalid',now())");return o
try:
 p=run('docker','run','--rm','-d','--name',NAME,'-e','POSTGRES_HOST_AUTH_METHOD=trust','-p','127.0.0.1::5432','pgvector/pgvector@sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b');assert not p.returncode,p.stderr
 for _ in range(100):
  if not run('docker','exec',NAME,'pg_isready','-h','127.0.0.1','-U','postgres').returncode:break
  time.sleep(.1)
 sql((ROOT/'supabase/tests/commercial-local-bootstrap.sql').read_text())
 for f in sorted((ROOT/'supabase/migrations').glob('*.sql')):sql(f.read_text())
 o=owner();p={'owner_id':o,'plan':'brand'}
 with concurrent.futures.ThreadPoolExecutor(4) as pool: intents=list(pool.map(lambda _:rpc('commercial_checkout_reserve',p),range(4)))
 assert len({i['id'] for i in intents})==1
 intent=intents[0]['id']
 assert 'pending_plan_conflict' in rpc('commercial_checkout_reserve',{**p,'plan':'studio'},True)
 rpc('commercial_checkout_bind',{'owner_id':o,'id':intent,'session_id':'cs_local'})
 assert rpc('commercial_checkout_reserve',p)['session_id']=='cs_local'
 ambiguous=owner(); ai=rpc('commercial_checkout_reserve',{'owner_id':ambiguous,'plan':'brand'})
 sql(f"update commercial_checkouts set created_at=now()-interval '24 hours' where id='{ai['id']}'")
 assert 'checkout_requires_reconciliation' in rpc('commercial_checkout_reserve',{'owner_id':ambiguous,'plan':'brand'},True)
 rpc('commercial_checkout_expire',{'owner_id':ambiguous,'id':ai['id'],'session_id':'cs_ambiguous'})
 assert rpc('commercial_checkout_reserve',{'owner_id':ambiguous,'plan':'brand'})['id']!=ai['id']
 now=int(sql("select extract(epoch from now())::bigint"));s=now-60;e=now+86400
 event={'owner_id':o,'checkout_id':intent,'session_id':'cs_local','event_id':'evt_checkout','event_type':'checkout.session.completed','event_created':now,'customer_id':'cus_local','subscription_id':'sub_local','status':'active','plan':'brand','period_start':s,'period_end':e,'digest':'a'*64}
 assert rpc('commercial_subscription_apply',event)['applied']
 assert sql(f"select plan from profiles where id='{o}'")=='free'
 assert sql(f"select commercial_plan from profiles where id='{o}'")=='brand'
 assert rpc('commercial_subscription_apply',event)['code']=='duplicate'
 invoice={'owner_id':o,'event_id':'evt_invoice','payment_id':'in_local','customer_id':'cus_local','subscription_id':'sub_local','period_start':s,'period_end':e,'kind':'included','amount_microusd':50000000,'paid_microusd':199000000,'policy_version':'P-01.v1','pricing_version':'ALM-2026-09.v1','commercial_plan':'brand'}
 assert rpc('workspace_credit_grant',invoice)==rpc('workspace_credit_grant',invoice)
 assert sql(f"select sum(amount_microusd) from workspace_credit_lots where owner_id='{o}'")=='50000000'
 before=sql(f"select to_jsonb(p) from profiles p where id='{o}'")
 assert not rpc('commercial_subscription_apply',{**event,'event_id':'evt_old','event_created':now-1,'status':'canceled'})['applied']
 assert before==sql(f"select to_jsonb(p) from profiles p where id='{o}'")
 assert 'existing_contract_preserved' in rpc('commercial_checkout_reserve',p,True)
 for role in ['anon','authenticated']:sql(f"set role {role};select commercial_checkout_reserve('{{}}')",True)
 print('PASS concurrent checkout capacity, exact provider adoption, distinct plan, ordered replay, included payment, RPC ACL')
 studio=owner();si=rpc('commercial_checkout_reserve',{'owner_id':studio,'plan':'studio'})
 se={**event,'owner_id':studio,'checkout_id':si['id'],'session_id':'cs_studio','event_id':'evt_studio','customer_id':'cus_studio','subscription_id':'sub_studio','plan':'studio'}
 assert rpc('commercial_subscription_apply',se)['applied']
 sg={**invoice,'owner_id':studio,'event_id':'evt_studio_paid','payment_id':'in_studio','customer_id':'cus_studio','subscription_id':'sub_studio','commercial_plan':'studio','amount_microusd':150000000,'paid_microusd':499000000}
 rpc('workspace_credit_grant',sg)
 assert sql(f"select commercial_plan from profiles where id='{studio}'")=='studio'
 assert sql(f"select sum(amount_microusd) from workspace_credit_lots where owner_id='{studio}'")=='150000000'
 renewal={**se,'event_type':'invoice.paid','event_id':'evt_studio_renew','event_created':now+2,'period_start':s+1,'period_end':e+1}
 assert rpc('commercial_subscription_apply',renewal)['applied']
 rpc('workspace_credit_grant',{**sg,'event_id':'evt_studio_paid2','payment_id':'in_studio2','period_start':s+1,'period_end':e+1})
 assert not rpc('commercial_subscription_apply',{**se,'event_id':'evt_conflict','event_created':now+2,'status':'canceled'})['applied']
 assert rpc('commercial_subscription_apply',{**renewal,'event_id':'evt_cancel','event_type':'customer.subscription.deleted','event_created':now+3,'status':'canceled'})['applied']
 assert sql(f"select subscription_status from profiles where id='{studio}'")=='canceled'
 # Cancelled subscription authority cannot be revived by a stale paid invoice.
 assert not rpc('commercial_subscription_apply',{**renewal,'event_id':'evt_late_invoice'})['applied']
 print('PASS distinct Studio checkout/included allowance, ordered invoice renewal, equal-time conflict and cancellation')
 free=owner();rpc('commercial_free_grant',{'owner_id':free})
 subject,brief=str(uuid.uuid4()),str(uuid.uuid4())
 sql(f"insert into subjects(id,user_id,name) values('{subject}','{free}','Tracer');insert into living_brief_versions(id,subject_id,version,confirmed) values('{brief}','{subject}',1,true)")
 channel=str(uuid.uuid4())
 sql(f"insert into subject_channels(id,subject_id,channel_type,locator,managed) values('{channel}','{subject}','instagram','tracer',true)")
 qp={'owner_id':free,'subject_id':subject,'brief_id':brief,'channel_id':channel,'handle':'tracer','platform':'instagram','goal':'growth','report_type':'standard'}
 assert 'model_unqualified' in rpc('commercial_quote',qp,True)
 # Test-only qualification fixture. NEVER seeded in a deployment migration.
 sql("insert into commercial_runtime_catalog(id,model,rate_version,input_microusd_per_mtok,output_microusd_per_mtok,max_input_tokens,max_output_tokens,max_calls,research_microusd,qualification_ref,qualified_until) values('auto','deepseek/deepseek-v4-flash-0731','test-only',1000000,2000000,10000,20000,2,100000,'test-only:not-production',now()+interval '1 hour')")
 assert 'channel_not_owned' in rpc('commercial_quote',{**qp,'channel_id':str(uuid.uuid4())},True)
 quote=rpc('commercial_quote',qp)
 assert quote['retail_microusd']==600000
 submit={'owner_id':free,'quote_id':quote['id'],'consent':True}
 sql(f"update subject_channels set locator='changed' where id='{channel}'")
 assert 'channel_requote_required' in rpc('commercial_submit',submit,True)
 sql(f"update subject_channels set locator='tracer' where id='{channel}'")
 assert 'explicit_consent_required' in rpc('commercial_submit',{**submit,'consent':False},True)
 audit=rpc('commercial_submit',submit)
 assert rpc('commercial_submit',submit)==audit
 assert sql(f"select status from audits where id='{audit}'")=='queued'
 assert sql(f"select brief_version_id from audits where id='{audit}'")==brief
 second=rpc('commercial_quote',qp)
 assert 'owner_concurrency' in rpc('commercial_submit',{**submit,'quote_id':second['id']},True)
 assert 'quote_not_owned' in rpc('commercial_submit',{**submit,'owner_id':o},True)
 # Worker bridge is an explicit service-only claim/finish protocol, not the
 # experimental model_execution executor. The execution test below uses it.
 sql(f"update audits set status='running',claimed_by='test-worker',claimed_at=now() where id='{audit}'")
 bound=rpc('commercial_execution_claim',{'audit_id':audit,'worker_id':'test-worker','model':'deepseek/deepseek-v4-flash-0731'})
 assert bound['reservation_id']==quote['id']
 assert bound['max_calls']==2
 sql(f"update audits set status='ready',report_path='not-an-immutable-version' where id='{audit}'")
 assert 'immutable_artifact_required' in rpc('commercial_execution_finish',{'audit_id':audit,'worker_id':'test-worker','outcome':'success','actual_upstream_microusd':None,'customer_debit_microusd':0,'receipt_id':'invalid-artifact'},True)
 sql(f"update audits set status='running',report_path=null where id='{audit}'")
 finish={'audit_id':audit,'worker_id':'test-worker','outcome':'failure','actual_upstream_microusd':None,'customer_debit_microusd':0,'receipt_id':'local-receipt'}
 rpc('commercial_execution_finish',finish);rpc('commercial_execution_finish',finish)
 assert sql(f"select customer_debit_microusd from workspace_credit_reservations where id='{quote['id']}'")=='0'
 assert sql(f"select actual_upstream_microusd is null from workspace_credit_reservations where id='{quote['id']}'")=='t'
 assert rpc('commercial_submit',submit)==audit
 print('PASS explicit Free enrollment -> qualified quote -> atomic ordinary queue -> bound worker claim -> no-charge immutable receipt')
 import os
 if os.environ.get('ALM_TEST_WORKER_TRACER')=='1':
  from commercial_worker_tracer import smoke
  smoke(sql,rpc,ROOT,free,qp)
finally:run('docker','rm','-f',NAME)
