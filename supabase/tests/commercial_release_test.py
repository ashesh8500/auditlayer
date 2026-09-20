"""Real SQL acceptance; owns and destroys only its uniquely named container."""
import concurrent.futures
import json
import pathlib
import subprocess
import time
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
NAME = 'alm-commercial-' + uuid.uuid4().hex[:12]

def run(*args, input=None):
    return subprocess.run(args, input=input, text=True, capture_output=True)

def sql(q, fail=False):
    p = run('docker', 'exec', '-i', NAME, 'psql', '-U', 'postgres', '-XAtq', '-v', 'ON_ERROR_STOP=1', input=q)
    if fail:
        assert p.returncode, 'unexpected success: ' + q
        return p.stderr
    assert not p.returncode, p.stderr
    return p.stdout.strip()

def call(fn, p, fail=False):
    return sql("set role service_role; select public."+fn+"('"+json.dumps(p).replace("'", "''")+"'::jsonb)", fail)

try:
    p = run('docker','run','--rm','-d','--name',NAME,'-e','POSTGRES_HOST_AUTH_METHOD=trust','-p','127.0.0.1::5432','pgvector/pgvector@sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b')
    assert not p.returncode, p.stderr
    for _ in range(100):
        if run('docker','exec',NAME,'pg_isready','-h','127.0.0.1','-U','postgres').returncode == 0: break
        time.sleep(.1)
    sql((ROOT/'supabase/tests/commercial-local-bootstrap.sql').read_text())
    for path in sorted((ROOT/'supabase/migrations').glob('*.sql')):
        sql(path.read_text())
    # Projection equality is a hard drift assertion, not a duplicate pricing table.
    assert json.loads(sql('select commercial_policy()')) == json.loads((ROOT/'web/src/lib/commercial-policy.json').read_text())
    owner=str(uuid.uuid4())
    sql(f"insert into auth.users(id,email) values('{owner}','commercial@example.invalid')")
    snapshot=sql(f"select to_jsonb(p) from profiles p where id='{owner}'")
    assert 'verified_identity_required' in call('commercial_free_grant', {'owner_id':owner}, True)
    sql(f"update auth.users set email_confirmed_at=now() where id='{owner}'")
    with concurrent.futures.ThreadPoolExecutor(4) as pool:
        results=list(pool.map(lambda _:call('commercial_free_grant', {'owner_id':owner}),range(4)))
    assert len(set(results)) == 1
    assert sql(f"select sum(amount_microusd) from workspace_credit_lots where owner_id='{owner}'")=='10000000'
    assert sql(f"select count(*) from workspace_credit_lots where owner_id='{owner}'")=='2'
    assert sql(f"select subscription_id is null and period_source='calendar_month_utc' from workspace_credit_cycles where owner_id='{owner}'")=='t'
    assert snapshot==sql(f"select to_jsonb(p) from profiles p where id='{owner}'")
    for role in ['anon','authenticated']:
        sql(f"set role {role}; select commercial_free_grant('{{}}')",True)
    print('PASS canonical projection, verified Free identity, concurrent exactly-once grants, honest period, legacy preservation, RPC ACL')
    subject=str(uuid.uuid4()); other_subject=str(uuid.uuid4())
    sql(f"insert into subjects(id,user_id,name) values('{subject}','{owner}','First'),('{other_subject}','{owner}','Second')")
    def intent(subject_id=subject, **patch):
        return dict(owner_id=owner,reservation_id=str(uuid.uuid4()),run_intent_id=str(uuid.uuid4()),quote_expires_at='2033-05-18T03:33:20Z',subject_id=subject_id,quote_id=str(uuid.uuid4()),model_id='test',rate_version='test',context_version='test',intent_fingerprint='a'*64,retail_microusd=1000000,upstream_microusd=100000,recurring=False,**patch)
    first=intent()
    call('workspace_credit_reserve',first)
    assert call('workspace_credit_reserve',first)==first['reservation_id']
    assert 'owner_concurrency' in call('workspace_credit_reserve',intent(),True)
    terminal=dict(owner_id=owner,reservation_id=first['reservation_id'],outcome='failure',customer_debit_microusd=0,actual_upstream_microusd=100000,receipt_id='receipt-test')
    call('workspace_credit_finish',terminal)
    assert sql(f"select sum(customer_debit_microusd) from workspace_credit_reservations where owner_id='{owner}'")=='0'
    assert 'brand_limit' in call('workspace_credit_reserve',intent(other_subject),True)
    second=intent(); call('workspace_credit_reserve',second)
    call('workspace_credit_finish',{**terminal,'reservation_id':second['reservation_id']})
    assert sql(f"select count(*) from commercial_managed_brands where owner_id='{owner}'")=='1'
    print('PASS Free kernel reservation, one active run, failed run no debit, actual provider liability and atomic brand cap')
    for plan,price,credits,cap,brands in [('brand',199000000,50000000,50000000,1),('studio',499000000,150000000,150000000,5)]:
        paid_owner=str(uuid.uuid4())
        sql(f"insert into auth.users(id,email) values('{paid_owner}','{plan}@example.invalid'); update profiles set stripe_customer_id='cus_{plan}',stripe_subscription_id='sub_{plan}',subscription_status='active',current_period_start=to_timestamp(1700000000),current_period_end=to_timestamp(2000000000) where id='{paid_owner}'")
        grant=dict(owner_id=paid_owner,event_id='evt_'+plan,payment_id='in_'+plan,subscription_id='sub_'+plan,customer_id='cus_'+plan,period_start=1700000000,period_end=2000000000,kind='included',amount_microusd=credits,paid_microusd=price,policy_version='P-01.v1',pricing_version='ALM-2026-09.v1',commercial_plan=plan)
        before=sql(f"select to_jsonb(p) from profiles p where id='{paid_owner}'")
        assert call('workspace_credit_grant',grant)==call('workspace_credit_grant',grant)
        assert 'verified_identity_required' in call('commercial_free_grant',{'owner_id':paid_owner},True)
        for idx in range(brands+1):
            sub=str(uuid.uuid4()); sql(f"insert into subjects(id,user_id,name) values('{sub}','{paid_owner}','Paid brand {idx}')")
            pi={**intent(sub),'owner_id':paid_owner}
            if idx==brands:
                assert 'brand_limit' in call('workspace_credit_reserve',pi,True)
            else:
                call('workspace_credit_reserve',pi)
                call('workspace_credit_finish',{**terminal,'owner_id':paid_owner,'reservation_id':pi['reservation_id']})
        topup={**grant,'kind':'purchased','event_id':'evt_top_'+plan,'payment_id':'pi_top_'+plan,'amount_microusd':cap,'paid_microusd':cap}
        call('workspace_credit_grant',topup)
        assert 'topup_cap' in call('workspace_credit_grant',{**topup,'event_id':'evt_over_'+plan,'payment_id':'pi_over_'+plan,'amount_microusd':10000000,'paid_microusd':10000000},True)
        assert sql(f"select expires_at is null from workspace_credit_lots where payment_id='pi_top_{plan}'")=='t'
        bypass={**topup,'event_id':'evt_bypass_'+plan,'payment_id':'pi_bypass_'+plan,'amount_microusd':10000000,'paid_microusd':10000000}
        bypass.pop('pricing_version'); bypass.pop('commercial_plan')
        assert 'commercial_policy_required' in call('workspace_credit_grant',bypass,True)
        managed=sql(f"select subject_id from commercial_managed_brands where owner_id='{paid_owner}' limit 1")
        total=credits+cap
        while total:
            retail=min(total,15000000)
            spend={**intent(managed),'owner_id':paid_owner,'retail_microusd':retail}
            call('workspace_credit_reserve',spend)
            call('workspace_credit_finish',{**terminal,'owner_id':paid_owner,'reservation_id':spend['reservation_id'],'outcome':'success','customer_debit_microusd':retail,'successful_path_id':'test-path'})
            total-=retail
        assert 'consumption_cap' in call('workspace_credit_reserve',{**intent(managed),'owner_id':paid_owner},True)
        assert before==sql(f"select to_jsonb(p) from profiles p where id='{paid_owner}'")
    print('PASS Brand/Studio paid grants, exact duplicates, brand admission, independent topup caps and no invented purchased expiry')
    wallet=json.loads(sql(f"set role authenticated; set request.jwt.claim.sub='{owner}'; select commercial_credit_wallet()"))
    assert wallet['period_source']=='calendar_month_utc' and wallet['subscription_id'] is None
    assert wallet['pricing_version']=='ALM-2026-09.v1' and wallet['commercial_plan']=='free'
    assert 'stripe_period_start' not in wallet and 'stripe_subscription_id' not in wallet
    assert wallet['balance']['microusd']==10000000
    stranger=str(uuid.uuid4()); sql(f"insert into auth.users(id,email) values('{stranger}','stranger@example.invalid')")
    assert sql(f"set role authenticated; set request.jwt.claim.sub='{stranger}'; select commercial_credit_wallet()") == ''
    print('PASS session-scoped commercial wallet exposes honest non-Stripe period without cross-tenant data')
    # Same existing payment-command/confirm adapter, with the new commercial pin retained.
    cmd_owner=str(uuid.uuid4())
    sql(f"insert into auth.users(id,email) values('{cmd_owner}','command@example.invalid'); update profiles set stripe_customer_id='cus_cmd',stripe_subscription_id='sub_cmd',subscription_status='active',current_period_start=to_timestamp(1700000000),current_period_end=to_timestamp(2000000000) where id='{cmd_owner}'")
    command={**grant,'owner_id':cmd_owner,'customer_id':'cus_cmd','subscription_id':'sub_cmd','payment_id':'in_cmd','command_id':str(uuid.uuid4()),'price_id':'price_studio','terms_version':'test-only-approved-terms'}
    command.pop('event_id')
    call('workspace_credit_payment_command',command)
    facts=dict(command_id=command['command_id'],payment_id='in_cmd',customer_id='cus_cmd',currency='usd',paid_microusd=499000000,status='succeeded',price_id='price_studio')
    assert 'payment_mismatch' in call('workspace_credit_payment_confirm',{**facts,'paid_microusd':1},True)
    assert call('workspace_credit_payment_confirm',facts)==call('workspace_credit_payment_confirm',facts)
    assert sql("select payload->>'pricing_version' from workspace_credit_lots where payment_id='in_cmd'")=='ALM-2026-09.v1'
    print('PASS bound commercial payment command, mismatched provider facts rejected, exactly-once confirmation')
    from workspace_execution_test import setup, dispatch
    class Adapter:
        sql=staticmethod(sql)
        @staticmethod
        def rpc(name,p):
            value=call(name,p)
            try: return json.loads(value)
            except ValueError: return value
    legacy=setup(Adapter())
    assert call('workspace_execution_admit',legacy)==legacy['reservation_id']
    assert json.loads(call('workspace_execution_dispatch',dispatch(legacy)))['receipt_id']==legacy['attempt_id']
    # Wire-compatible execution uses the same durable admission/dispatch on Free.
    from copy import deepcopy
    free_execution=deepcopy(legacy)
    brief,run_id,audit,snapshot_id=[str(uuid.uuid4()) for _ in range(4)]
    sql(f"insert into living_brief_versions(id,subject_id,version,confirmed) values('{brief}','{subject}',1,true); insert into evidence_snapshots(id,subject_id) values('{snapshot_id}','{subject}'); insert into intelligence_runs(id,subject_id,brief_version,evidence_snapshot_id,methodology_version,expertise_pack_version,prompt_version,model_config_hash) values('{run_id}','{subject}',1,'{snapshot_id}','test','test','test','test'); insert into audits(id,user_id,handle,status,claimed_by,claimed_at) values('{audit}','{owner}','test','running','worker-test',now())")
    free_execution.update(reservation_id=str(uuid.uuid4()),attempt_id=str(uuid.uuid4()),audit_id=audit,intelligence_run_id=run_id)
    free_execution['intent']['quote']['refs'].update(owner_id=owner,subject_id=subject,context_version_id=brief)
    free_execution['expected'].update(owner_id=owner,subject_id=subject)
    assert call('workspace_execution_admit',free_execution)==free_execution['reservation_id']
    assert json.loads(call('workspace_execution_dispatch',dispatch(free_execution)))['receipt_id']==free_execution['attempt_id']
    print('PASS full migrated chain legacy and Free durable execution admission/dispatch with existing wire contract')
    legacy_owner=legacy['expected']['owner_id']; legacy_rid=legacy['reservation_id']
    sql(f"update profiles set current_period_end=clock_timestamp()+interval '2 seconds' where id='{legacy_owner}'; update workspace_credit_cycles set period_end=(select current_period_end from profiles where id='{legacy_owner}') where owner_id='{legacy_owner}'")
    assert 'inactive_cycle' in sql(f"begin; select pg_sleep(3); set role service_role; select workspace_credit_reserve((select intent from workspace_credit_reservations where id='{legacy_rid}')); commit;",True)
    print('PASS long transaction cannot reuse a cycle after wall-clock expiry')
finally:
    run('docker','rm','-f',NAME)
