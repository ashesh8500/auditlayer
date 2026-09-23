"""Commercial command tracer, isolated actual PostgreSQL; no external payment/model calls."""
import json,pathlib,subprocess,time,uuid,concurrent.futures
ROOT=pathlib.Path(__file__).resolve().parents[2]
NAME='alm-review-fixes-'+uuid.uuid4().hex[:12]
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
 o=owner();rpc('commercial_free_grant',{'owner_id':o})
 subject,brief,channel=[str(uuid.uuid4()) for _ in range(3)]
 sql(f"insert into subjects(id,user_id,name) values('{subject}','{o}','Review');insert into living_brief_versions(id,subject_id,version,confirmed) values('{brief}','{subject}',1,true);insert into subject_channels(id,subject_id,channel_type,locator,managed) values('{channel}','{subject}','instagram','review',true)")
 sql("insert into commercial_runtime_catalog(id,model,rate_version,input_microusd_per_mtok,output_microusd_per_mtok,max_input_tokens,max_output_tokens,max_calls,research_microusd,qualification_ref,qualified_until) values('auto','deepseek/deepseek-v4-flash-0731','test-only',1000000,2000000,10000,20000,2,100000,'test-only:not-production',now()+interval '1 hour')")
 qp={'subject_id':subject,'brief_id':brief,'channel_id':channel,'goal':'growth','report_type':'standard'}
 quote=rpc('commercial_quote',{**qp,'owner_id':o})
 probe=run('node',str(ROOT/'web/scripts/commercial-review-probe.cjs'),input=json.dumps({'owner':o,'quote':quote,'input':qp}))
 assert not probe.returncode,probe.stdout+probe.stderr
 print(probe.stdout)
 now=int(sql("select extract(epoch from now())::bigint"));s=now-60;e=now+86400
 def enrollment():
  o=owner();intent=rpc('commercial_checkout_reserve',{'owner_id':o,'plan':'brand'})['id']
  return {'owner_id':o,'checkout_id':intent,'session_id':'cs_'+o,'event_id':'evt_z_'+o,'event_type':'checkout.session.completed','event_created':now,'customer_id':'cus_'+o,'subscription_id':'sub_'+o,'status':'active','plan':'brand','period_start':s,'period_end':e,'digest':'a'*64}
 def paid(event,invoice_id,expected=200,mutation=None):
  result=run('node',str(ROOT/'web/scripts/commercial-review-probe.cjs'),input=json.dumps({'mode':'invoice','container':NAME,'event':event,'invoice_id':invoice_id,'expected':expected,'mutation':mutation}))
  assert not result.returncode,result.stdout+result.stderr
  print(result.stdout.strip())
 event=enrollment();assert rpc('commercial_subscription_apply',event)['applied']
 paid({**event,'event_id':'evt_a_'+event['owner_id']},'in_lexical')
 assert sql(f"select sum(amount_microusd) from workspace_credit_lots where owner_id='{event['owner_id']}'")=='50000000'
 # Exact same invoice replay is idempotent regardless of both ID orderings.
 paid({**event,'event_id':'evt_zz_'+event['owner_id']},'in_lexical')
 assert sql(f"select count(*) from workspace_credit_lots where owner_id='{event['owner_id']}'")=='1'
 assert sql(f"select count(*) from provider_event_receipts where profile_id='{event['owner_id']}' and applied")=='1'
 for label,created in [('earlier',now-1),('delayed',now-2)]:
  ev=enrollment();assert rpc('commercial_subscription_apply',ev)['applied']
  if label=='delayed':assert rpc('commercial_subscription_apply',{**ev,'event_id':'evt_update_'+ev['owner_id'],'event_type':'customer.subscription.updated','event_created':now+2})['applied']
  paid({**ev,'event_id':'evt_'+label+ev['owner_id'],'event_created':created},'in_'+label)
 # Before-checkout delivery is retryable, not credit authority.
 early=enrollment();early_invoice={**early,'event_id':'evt_before','event_created':now-1}
 paid(early_invoice,'in_before',503)
 assert rpc('commercial_subscription_apply',early)['applied'];paid(early_invoice,'in_before')
 # Provider facts/signature remain mandatory on the recovered path.
 for mutation in ['amount','customer','signature']:
  paid({**event,'event_id':'evt_bad_'+mutation,'event_created':now-1},'in_bad_'+mutation,400 if mutation=='signature' else 503,mutation)
 # New period renews normally; old-period delayed delivery cannot restore it.
 renewal={**event,'event_id':'evt_renew','event_type':'invoice.paid','event_created':now+5,'period_start':s+10,'period_end':e+10}
 paid(renewal,'in_renew')
 before=sql(f"select to_jsonb(p) from profiles p where id='{event['owner_id']}'")
 paid({**event,'event_id':'evt_oldperiod','event_created':now-1},'in_oldperiod',503)
 assert sql(f"select to_jsonb(p) from profiles p where id='{event['owner_id']}'")==before
 # Conflicting equal-time payload and canceled/retired subscriptions stay fenced.
 paid({**renewal,'event_id':'evt_zz_conflict','period_start':s+11},'in_conflict',503)
 assert rpc('commercial_subscription_apply',{**renewal,'event_id':'evt_cancel','event_type':'customer.subscription.deleted','event_created':now+6,'status':'canceled'})['applied']
 paid({**renewal,'event_id':'evt_late','event_created':now+4},'in_late',503)
 assert sql(f"select subscription_status from profiles where id='{event['owner_id']}'")=='canceled'
 print('PASS invoice order, delayed delivery, renewal, cancellation and immutable money fences')
 # CR-3 direct legacy webhook cannot replace live commercial authority.
 active=enrollment();assert rpc('commercial_subscription_apply',active)['applied']
 def legacy_apply(ev,plan='starter',status='active'):
  return json.loads(sql("set role service_role;select reconcile_stripe_subscription("+','.join(["'"+str(x).replace("'","''")+"'" for x in [ev['event_id'],ev['event_type'],ev['event_created'],ev['subscription_id'],ev['customer_id'],ev['owner_id'],status,plan,ev['period_start'],ev['period_end'],'b'*64]])+")"))
 snapshot=sql(f"select to_jsonb(p) from profiles p where id='{active['owner_id']}'")
 retired={**renewal,'event_type':'checkout.session.completed','event_id':'evt_replacement_after_cancel','event_created':now+20,'subscription_id':'sub_after_cancel'}
 assert legacy_apply(retired)['applied']
 paid({**renewal,'event_id':'evt_retired_invoice','event_created':now+21},'in_retired',503)
 for role in ['anon','authenticated']:
  for fn in ['commercial_checkout_reserve','legacy_checkout_apply','commercial_subscription_apply']:
   assert 'permission denied' in sql(f"set role {role};select {fn}('{{}}')",True)
 for key,value in [('customer_id','cus_foreign'),('subscription_id','sub_foreign'),('plan','studio'),('period_start',s-1)]:
  result=rpc('commercial_subscription_apply',{**active,'event_type':'invoice.paid','event_created':now-1,'event_id':'evt_wrong_'+key,key:value},key=='plan')
  if isinstance(result,dict):assert result.get('code')!='current_authority' and not result.get('applied')
 assert snapshot==sql(f"select to_jsonb(p) from profiles p where id='{active['owner_id']}'")
 assert not legacy_apply({**active,'event_id':'evt_legacy_bypass','event_created':now+10,'subscription_id':'sub_second'})['applied'],'legacy checkout replaced commercial authority'
 assert snapshot==sql(f"select to_jsonb(p) from profiles p where id='{active['owner_id']}'")
 # All new offers compete at the same locked owner admission.
 for first,second in [('starter','brand'),('brand','starter'),('pro','studio'),('studio','pro')]:
  buyer=owner();one=rpc('commercial_checkout_reserve',{'owner_id':buyer,'plan':first})
  assert 'pending_plan_conflict' in rpc('commercial_checkout_reserve',{'owner_id':buyer,'plan':second},True)
  assert rpc('commercial_checkout_reserve',{'owner_id':buyer,'plan':first})['id']==one['id']
 for _ in range(3):
  buyer=owner()
  def attempt(plan):
   try:return rpc('commercial_checkout_reserve',{'owner_id':buyer,'plan':plan})
   except AssertionError as error:return str(error)
  with concurrent.futures.ThreadPoolExecutor(4) as pool: results=list(pool.map(attempt,['brand','starter','studio','pro']))
  assert len([x for x in results if isinstance(x,dict)])==1,results
  assert sql(f"select count(*) from commercial_checkouts where owner_id='{buyer}' and state='pending'")=='1'
 assert 'existing_contract_preserved' in rpc('commercial_checkout_reserve',{'owner_id':active['owner_id'],'plan':'starter'},True)
 print('PASS cross-path owner-wide pending checkout races')
 # Signed legacy completion/expiry must close the shared reservation.
 def legacy_event(ev,event_type):
  result=run('node',str(ROOT/'web/scripts/commercial-review-probe.cjs'),input=json.dumps({'mode':'legacy-event','container':NAME,'event':ev,'type':event_type}))
  assert not result.returncode,result.stdout+result.stderr
  print(result.stdout.strip())
 buyer=owner();intent=rpc('commercial_checkout_reserve',{'owner_id':buyer,'plan':'starter'})['id']
 le={**active,'owner_id':buyer,'checkout_id':intent,'session_id':'cs_legacy','customer_id':'cus_legacy','subscription_id':'sub_legacy','event_id':'evt_legacy_complete'}
 legacy_event(le,'checkout.session.completed')
 assert sql(f"select state from commercial_checkouts where id='{intent}'")=='completed'
 assert sql(f"select plan from profiles where id='{buyer}'")=='starter'
 assert legacy_apply({**le,'event_id':'evt_legacy_renew','event_type':'customer.subscription.updated','event_created':now+1,'period_start':s+1,'period_end':e+1})['applied']
 assert legacy_apply({**le,'event_id':'evt_legacy_cancel','event_type':'customer.subscription.deleted','event_created':now+2},'free','canceled')['applied']
 next_intent=rpc('commercial_checkout_reserve',{'owner_id':buyer,'plan':'starter'})['id']
 legacy_event({**le,'checkout_id':next_intent,'session_id':'cs_expired','event_id':'evt_legacy_expired'},'checkout.session.expired')
 assert sql(f"select state from commercial_checkouts where id='{next_intent}'")=='expired'
 assert rpc('commercial_checkout_reserve',{'owner_id':buyer,'plan':'brand'})['id']!=next_intent
 # Concurrent actual commercial/legacy server actions, real reservation SQL,
 # recording-only Stripe adapters: one chargeable session, never two.
 def checkout(buyer,plan):
  result=run('node',str(ROOT/'web/scripts/commercial-review-probe.cjs'),input=json.dumps({'mode':'checkout','container':NAME,'owner':buyer,'plan':plan}))
  assert not result.returncode,result.stdout+result.stderr
  return json.loads(result.stdout)
 buyer=owner();sql(f"update profiles set stripe_customer_id='cus_race' where id='{buyer}'")
 with concurrent.futures.ThreadPoolExecutor(2) as pool: outputs=list(pool.map(lambda plan:checkout(buyer,plan),['brand','starter']))
 assert sum(x['created'] for x in outputs)==1,outputs
 assert sum('https://checkout.example.invalid/local' in x['redirect'] for x in outputs)==1,outputs
 assert checkout(active['owner_id'],'starter')['created']==0
 print('PASS concurrent production Brand/Starter actions with real SQL: one hosted session')
finally:run('docker','rm','-f',NAME)
