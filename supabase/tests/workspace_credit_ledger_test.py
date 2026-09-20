#!/usr/bin/env python3
"""Owned disposable PostgreSQL, no existing database connection accepted."""
import subprocess, uuid, pathlib, concurrent.futures, json
ROOT = pathlib.Path(__file__).resolve().parents[2]
NAME = 'alm-workspace-ledger-' + uuid.uuid4().hex[:12]

def run(*args, input=None):
    return subprocess.run(args, input=input, text=True, capture_output=True)

def sql(q, fail=False):
    p=run('docker','exec','-i',NAME,'psql','-U','postgres','-d','workspace_ledger','-XAtq','-v','ON_ERROR_STOP=1',input=q)
    if fail:
        assert p.returncode, 'unexpected success: '+q
        return p.stderr
    assert not p.returncode, p.stderr
    return p.stdout.strip()

def rpc(fn, payload, fail=False):
    return sql("set role service_role; select public.workspace_credit_"+fn+"('"+json.dumps(payload).replace("'","''")+"'::jsonb);",fail)

try:
    p=run('docker','run','--rm','-d','--name',NAME,'-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=workspace_ledger','-p','127.0.0.1::5432','pgvector/pgvector@sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b')
    assert not p.returncode,p.stderr
    import time
    for _ in range(100):
        if run('docker','exec',NAME,'pg_isready','-h','127.0.0.1','-U','postgres').returncode==0: break
        time.sleep(.1)
    sql((ROOT/'supabase/tests/commercial-local-bootstrap.sql').read_text())
    # Full canonical migration chain, not hand-made copies of production tables.
    for path in sorted((ROOT/'supabase/migrations').glob('*.sql')):
        if path.name >= '20260919220000': break
        sql(path.read_text())
    migration=ROOT/'supabase/migrations/20260919220000_workspace_credit_ledger.sql'
    if migration.exists(): sql(migration.read_text())
    u=str(uuid.uuid4()); subject=str(uuid.uuid4())
    sql(f"insert into auth.users(id,email) values('{u}','ledger@example.invalid'); update profiles set stripe_customer_id='cus_ledger',stripe_subscription_id='sub_ledger',subscription_status='active',current_period_start=to_timestamp(1700000000),current_period_end=to_timestamp(2000000000) where id='{u}'; insert into subjects(id,user_id,name) values('{subject}','{u}','Ledger');")
    before=sql(f"select to_jsonb(p) from profiles p where id='{u}'")
    grant=dict(owner_id=u,event_id='evt_paid',payment_id='in_paid',subscription_id='sub_ledger',customer_id='cus_ledger',period_start=1700000000,period_end=2000000000,kind='included',amount_microusd=30000000,paid_microusd=129000000,policy_version='P-01.v1')
    assert 'payment_authority_denied' in rpc('grant',{**grant,'policy_version':'p01.v1'},True)
    a=rpc('grant',grant); assert a==rpc('grant',grant)
    assert sql('select count(*) from workspace_credit_lots')=='1'
    assert before==sql(f"select to_jsonb(p) from profiles p where id='{u}'")
    print('PASS paid grant duplicate/lost-response preserves legacy profile')
    intent=dict(owner_id=u,reservation_id=str(uuid.uuid4()),run_intent_id=str(uuid.uuid4()),quote_expires_at='2033-05-18T03:33:20Z',subject_id=subject,quote_id='quote-1',model_id='test-model',rate_version='test-rate',context_version='test-context',intent_fingerprint='a'*64,retail_microusd=15000000,upstream_microusd=10000000,recurring=False)
    assert rpc('reserve',intent)==rpc('reserve',intent)
    assert 'idempotency_mismatch' in rpc('reserve',{**intent,'model_id':'other'},True)
    print('PASS atomic reserve and exact intent retry')
    commands=ROOT/'supabase/migrations/20260919222023_workspace_billing_commands.sql'
    sql(commands.read_text())
    def wallet(owner):
        return json.loads(sql(f"set role authenticated; set request.jwt.claim.sub='{owner}'; select workspace_credit_wallet()"))
    w=wallet(u)
    assert w['policy_version']=='P-01.v1' and w['owner_id']==u
    assert w['balance']['microusd']==30000000 and w['reserved']['microusd']==15000000
    assert w['lots'][0]['reserved']['microusd']==15000000
    assert w['upstream_exposure_this_cycle']['microusd']==10000000
    sql('set role anon; select workspace_credit_wallet()',True)
    payment_owner=str(uuid.uuid4())
    sql(f"insert into auth.users(id,email) values('{payment_owner}','payment@example.invalid'); update profiles set stripe_customer_id='cus_command',stripe_subscription_id='sub_command',subscription_status='active',current_period_start=to_timestamp(1700000000),current_period_end=to_timestamp(2000000000) where id='{payment_owner}'")
    command_id=str(uuid.uuid4())
    command={**grant,'owner_id':payment_owner,'customer_id':'cus_command','subscription_id':'sub_command','payment_id':'in_command','command_id':command_id,'price_id':'price_access','terms_version':'test-only-approved-terms'}
    command.pop('event_id')
    rpc('payment_command',command)
    facts=dict(command_id=command_id,payment_id='in_command',customer_id='cus_command',currency='usd',paid_microusd=129000000,status='succeeded',price_id='price_access')
    assert 'payment_mismatch' in rpc('payment_confirm',{**facts,'paid_microusd':1},True)
    assert rpc('payment_confirm',facts)==rpc('payment_confirm',facts)
    assert sql("select count(*) from workspace_credit_lots where payment_id='in_command'")=='1'
    print('PASS durable paid command validates bound provider facts and exactly-once grant')
    terminal=dict(owner_id=u,reservation_id=intent['reservation_id'],outcome='success',customer_debit_microusd=15000000,actual_upstream_microusd=2000000,receipt_id='receipt-1',successful_path_id='path-1')
    assert rpc('finish',terminal)==rpc('finish',terminal)
    assert 'terminal_mismatch' in rpc('finish',{**terminal,'customer_debit_microusd':1},True)
    assert sql("select sum(amount_microusd) from workspace_credit_ledger where kind='debit'")=='15000000'
    print('PASS successful settlement exactly once')
    def new_intent(**kw): return {**intent,'reservation_id':str(uuid.uuid4()),'run_intent_id':str(uuid.uuid4()),'quote_id':str(uuid.uuid4()),**kw}
    assert 'run_intent_reused' in rpc('reserve',new_intent(run_intent_id=intent['run_intent_id']),True)
    assert 'quote_expired' in rpc('reserve',new_intent(quote_expires_at='2020-01-01T00:00:00Z'),True)
    # Two processes race the last $15: profile lock admits exactly one.
    contenders=[new_intent(),new_intent()]
    def attempt(p):
        try: return rpc('reserve',p)
        except AssertionError: return None
    with concurrent.futures.ThreadPoolExecutor(2) as pool: results=list(pool.map(attempt,contenders))
    assert sum(x is not None for x in results)==1
    winner=contenders[next(i for i,x in enumerate(results) if x is not None)]
    rid=winner['reservation_id']
    snap=sql(f"select to_jsonb(r) from workspace_credit_reservations r where id='{rid}'")
    rpc('finish',{**terminal,'reservation_id':rid,'customer_debit_microusd':15000001},True)
    rpc('finish',{**terminal,'reservation_id':rid,'actual_upstream_microusd':10000001},True)
    rpc('finish',{**terminal,'reservation_id':rid,'outcome':'failure','customer_debit_microusd':1},True)
    rpc('finish',{**terminal,'reservation_id':rid,'receipt_id':None},True)
    assert snap==sql(f"select to_jsonb(r) from workspace_credit_reservations r where id='{rid}'")
    pending={**terminal,'reservation_id':rid,'outcome':'failure','customer_debit_microusd':0,'actual_upstream_microusd':None}
    rpc('finish',pending); rpc('finish',pending)
    assert 'terminal_mismatch' in rpc('finish',{**terminal,'reservation_id':rid},True)
    assert 'reservation_terminal' in rpc('reserve',winner,True)
    assert 'upstream_cap' in rpc('reserve',new_intent(upstream_microusd=49000000),True)
    print('PASS last-balance race, overspend rollback, released no resurrection, pending exposure')
    reconciliation=dict(owner_id=u,reservation_id=rid,receipt_id='final-failed-cost',actual_upstream_microusd=3000000)
    assert rpc('reconcile',reconciliation)==rpc('reconcile',reconciliation)
    assert 'reconciliation_mismatch' in rpc('reconcile',{**reconciliation,'actual_upstream_microusd':0},True)
    print('PASS failed actual cost reconciliation remains customer free')
    # Negative assertions are complete row snapshots, not merely error responses.
    def ledger_snapshot():
        tables=['workspace_credit_'+name for name in ('cycles','lots','ledger','reservations','allocations','refunds')]+['profiles']
        fields=','.join("'"+t+"',(select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from "+t+" t)" for t in tables)
        return sql('select jsonb_build_object('+fields+')')
    snap=ledger_snapshot()
    for patch in ({'subscription_id':'sub_stale'},{'period_start':1700000001},{'customer_id':'cus_foreign'},{'amount_microusd':9007199254740992}):
        rpc('grant',{**grant,'event_id':'evt_bad','payment_id':'in_bad',**patch},True)
        assert snap==ledger_snapshot()
    other=str(uuid.uuid4()); foreign=str(uuid.uuid4())
    sql(f"insert into auth.users(id,email) values('{other}','other@example.invalid'); update profiles set role='admin' where id='{other}'; insert into subjects(id,user_id,name) values('{foreign}','{other}','Foreign');")
    assert 'subject_not_owned' in rpc('reserve',new_intent(subject_id=foreign),True)
    assert sql(f"set role authenticated; set request.jwt.claim.sub='{other}'; select count(*) from workspace_credit_lots")=='0'
    for role in ('anon','authenticated'):
        sql(f"set role {role}; select workspace_credit_grant('{{}}'::jsonb)",True)
        sql(f"set role {role}; update workspace_credit_reservations set state='held'",True)
    sql("set role service_role; delete from workspace_credit_ledger",True)
    sql("update workspace_credit_lots set amount_microusd=1",True)
    print('PASS stale Stripe, tenant/admin boundary, immutable ledger and JSON-safe money')
    topup={**grant,'event_id':'evt_topup','payment_id':'pi_topup','kind':'purchased','amount_microusd':70000000,'paid_microusd':70000000}
    rpc('grant',topup); rpc('grant',topup)
    assert 'topup_cap' in rpc('grant',{**topup,'event_id':'evt_excess','payment_id':'pi_excess','amount_microusd':10000000,'paid_microusd':10000000},True)
    next_run=new_intent(); rpc('reserve',next_run)
    assert sql(f"select l.kind from workspace_credit_allocations a join workspace_credit_lots l on l.id=a.lot_id where a.reservation_id='{next_run['reservation_id']}'")=='included'
    rpc('finish',{**terminal,'reservation_id':next_run['reservation_id'],'actual_upstream_microusd':0})
    refund=dict(owner_id=u,request_id='refund-1',subscription_id='sub_ledger')
    refund_id=rpc('refund_reserve',refund)
    assert refund_id==rpc('refund_reserve',refund)
    assert sql("select sum(amount_microusd) from workspace_credit_ledger where kind='refund_reserved'")=='70000000'
    snap=ledger_snapshot()
    assert 'insufficient_credit' in rpc('reserve',new_intent(),True)
    assert snap==ledger_snapshot()  # includes attempted reservation insertion rollback
    assert rpc('cancel',dict(owner_id=u,subscription_id='sub_ledger'))=='sub_ledger'
    assert 'inactive_cycle' in rpc('reserve',new_intent(recurring=True),True)
    assert before==sql(f"select to_jsonb(p) from profiles p where id='{u}'")
    print('PASS topup cap, included first, refund holds and cancellation preserve paid entitlements')
    # Provider refund/cancellation execution records: bound to the frozen liability,
    # idempotent, and unable to unfreeze spending on a failed provider refund.
    action=dict(owner_id=u,action_id=str(uuid.uuid4()),kind='refund',subject_id=refund_id,idempotency_key='workspace-refund:'+refund_id,status='pending',provider_object_id=None,amount_microusd=None)
    rpc('provider_action',action)
    assert 'partial_provider_refund' in rpc('provider_action',{**action,'status':'succeeded','provider_object_id':'re_partial','amount_microusd':1},True)
    assert 'provider_action_mismatch' in rpc('provider_action',{**action,'amount_microusd':70000000},True)
    resolved=rpc('provider_action',{**action,'status':'succeeded','provider_object_id':'re_1','amount_microusd':70000000})
    assert resolved==rpc('provider_action',{**action,'status':'succeeded','provider_object_id':'re_1','amount_microusd':70000000})
    assert 'provider_action_mismatch' in rpc('provider_action',{**action,'status':'failed','provider_object_id':None,'amount_microusd':None},True)
    foreign_action={**action,'action_id':str(uuid.uuid4()),'idempotency_key':'workspace-refund:foreign','subject_id':str(uuid.uuid4()),'status':'pending'}
    assert 'provider_action_authority' in rpc('provider_action',foreign_action,True)
    assert 'provider_action_authority' in rpc('provider_action',{**foreign_action,'owner_id':other,'idempotency_key':'workspace-refund:other'},True)
    failed=dict(owner_id=u,action_id=str(uuid.uuid4()),kind='refund',subject_id=refund_id,idempotency_key='workspace-refund:retry-'+refund_id,status='failed',provider_object_id=None,amount_microusd=None)
    rpc('provider_action',failed)
    assert sql("select sum(amount_microusd) from workspace_credit_ledger where kind='refund_reserved'")=='70000000'
    assert 'inactive_cycle' in rpc('reserve',new_intent(),True)
    assert sql('select count(*) from workspace_credit_provider_actions where status=\'succeeded\'')=='1'
    cancel_action=dict(owner_id=u,action_id=str(uuid.uuid4()),kind='cancellation',subject_id='sub_ledger',idempotency_key='workspace-cancel:sub_ledger',status='pending',provider_object_id=None,amount_microusd=None)
    rpc('provider_action',cancel_action)
    resolved_cancel={**cancel_action,'status':'succeeded','provider_object_id':'sub_ledger'}
    assert rpc('provider_action',resolved_cancel)==rpc('provider_action',resolved_cancel)
    assert 'provider_action_mismatch' in rpc('provider_action',cancel_action,True)
    assert 'provider_action_authority' in rpc('provider_action',{**cancel_action,'action_id':str(uuid.uuid4()),'idempotency_key':'workspace-cancel:other','subject_id':'sub_missing'},True)
    assert sql('select count(*) from workspace_credit_provider_actions')=='3'
    for role in ('anon','authenticated'):
        sql(f"set role {role}; select workspace_credit_provider_action('{{}}'::jsonb)",True)
    print('PASS provider refund/cancellation execution stays bound, idempotent and frozen on failure')
    # Expiry is real wall time, not fabricated clock parameters to the RPC.
    exp=str(uuid.uuid4()); exp_subject=str(uuid.uuid4())
    sql(f"insert into auth.users(id,email) values('{exp}','expiry@example.invalid'); update profiles set stripe_customer_id='cus_exp',stripe_subscription_id='sub_exp',subscription_status='active',current_period_start=to_timestamp(1700000000),current_period_end=to_timestamp(floor(extract(epoch from clock_timestamp()))+3) where id='{exp}'; insert into subjects(id,user_id,name) values('{exp_subject}','{exp}','Expiry')")
    exp_end=int(sql(f"select extract(epoch from current_period_end)::bigint from profiles where id='{exp}'"))
    eg={**grant,'owner_id':exp,'event_id':'evt_exp','payment_id':'in_exp','subscription_id':'sub_exp','customer_id':'cus_exp','period_end':exp_end}
    rpc('grant',eg)
    ei=new_intent(owner_id=exp,subject_id=exp_subject)
    rpc('reserve',ei)
    time.sleep(max(0,exp_end-time.time())+.1)
    assert 'inactive_cycle' in rpc('reserve',ei,True)
    assert 'inactive_cycle' in rpc('reserve',{**ei,'reservation_id':str(uuid.uuid4()),'run_intent_id':str(uuid.uuid4())},True)
    # Cancellation cannot be bypassed by a later invoice on the same subscription.
    sql(f"update profiles set current_period_start=to_timestamp(1750000000),current_period_end=to_timestamp(2100000000) where id='{u}'")
    assert 'cancelled_subscription' in rpc('grant',{**grant,'event_id':'evt_future','payment_id':'in_future','period_start':1750000000,'period_end':2100000000},True)
    print('PASS strict expiry including lost-response retry and cancelled renewal')
    # Independent owner exercises purchased ordering, caps and concurrent finish.
    cap_owner=str(uuid.uuid4()); cap_subject=str(uuid.uuid4())
    sql(f"insert into auth.users(id,email) values('{cap_owner}','cap@example.invalid'); update profiles set stripe_customer_id='cus_cap',stripe_subscription_id='sub_cap',subscription_status='active',current_period_start=to_timestamp(1700000000),current_period_end=to_timestamp(2000000000) where id='{cap_owner}'; insert into subjects(id,user_id,name) values('{cap_subject}','{cap_owner}','Cap')")
    cg={**grant,'owner_id':cap_owner,'customer_id':'cus_cap','subscription_id':'sub_cap','event_id':'evt_cap','payment_id':'in_cap'}
    rpc('grant',cg)
    purchase1=rpc('grant',{**cg,'event_id':'evt_p1','payment_id':'pi_p1','kind':'purchased','amount_microusd':10000000,'paid_microusd':10000000})
    purchase2=rpc('grant',{**cg,'event_id':'evt_p2','payment_id':'pi_p2','kind':'purchased','amount_microusd':60000000,'paid_microusd':60000000})
    def caprun(amount=15000000, upstream=1):
        return new_intent(owner_id=cap_owner,subject_id=cap_subject,retail_microusd=amount,upstream_microusd=upstream)
    for _ in range(2):
        cr=caprun(); rpc('reserve',cr)
        cp={**terminal,'owner_id':cap_owner,'reservation_id':cr['reservation_id'],'actual_upstream_microusd':0}
        with concurrent.futures.ThreadPoolExecutor(2) as pool: assert len(set(pool.map(lambda _:rpc('finish',cp),range(2))))==1
    cr=caprun(); rpc('reserve',cr)
    assert sql(f"select lot_id from workspace_credit_allocations where reservation_id='{cr['reservation_id']}' order by ordinal").splitlines()==[purchase1,purchase2]
    rpc('finish',{**terminal,'owner_id':cap_owner,'reservation_id':cr['reservation_id'],'actual_upstream_microusd':0})
    for amount in [15000000,15000000,15000000,10000000]:
        cr=caprun(amount); rpc('reserve',cr)
        rpc('finish',{**terminal,'owner_id':cap_owner,'reservation_id':cr['reservation_id'],'customer_debit_microusd':amount,'actual_upstream_microusd':0})
    snap=ledger_snapshot()
    assert 'consumption_cap' in rpc('reserve',caprun(1),True)
    assert snap==ledger_snapshot()
    assert sql(f"select sum(customer_debit_microusd) from workspace_credit_reservations where owner_id='{cap_owner}'")=='100000000'
    print('PASS purchased expiry order, concurrent duplicate settlement and 100-dollar consumption cap')
    # Admission rejection is side-effect free after cancellation.
    snap=ledger_snapshot()
    assert 'inactive_cycle' in rpc('reserve',new_intent(),True)
    assert snap==ledger_snapshot()
    for table in ('cycles','lots','ledger','reservations','allocations','refunds'):
        assert sql(f"set role authenticated; set request.jwt.claim.sub='{other}'; select count(*) from workspace_credit_{table}")=='0'
    print('PASS all owner projections exclude an admin customer from other tenants')
finally:
    run('docker','rm','-f',NAME)
