"""Full-chain disposable onboarding test. No hosted DB, payment or model calls."""
import concurrent.futures
import json
import pathlib
import subprocess
import time
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
NAME = 'alm-brand-setup-' + uuid.uuid4().hex[:12]

def run(*args, input=None):
    return subprocess.run(args, input=input, text=True, capture_output=True)

def sql(q, fail=False):
    p = run('docker', 'exec', '-i', NAME, 'psql', '-U', 'postgres', '-XAtq', '-v', 'ON_ERROR_STOP=1', input=q)
    if fail:
        assert p.returncode, 'unexpected success'
        return p.stderr
    assert not p.returncode, p.stderr
    return p.stdout.strip()

def rpc(fn, p, owner=None, fail=False):
    role = 'authenticated' if owner else 'service_role'
    prefix = f"set role {role};"
    if owner:
        prefix += f"set request.jwt.claim.sub='{owner}';"
    v = sql(prefix + 'select public.' + fn + "('" + json.dumps(p).replace("'", "''") + "'::jsonb)", fail)
    if fail:
        return v
    try:
        return json.loads(v)
    except ValueError:
        return v

def owner():
    o = str(uuid.uuid4())
    sql(f"insert into auth.users(id,email,email_confirmed_at) values('{o}','{o}@example.invalid',now())")
    return o

try:
    p = run('docker', 'run', '--rm', '-d', '--name', NAME, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-p', '127.0.0.1::5432', 'pgvector/pgvector@sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b')
    assert not p.returncode, p.stderr
    for _ in range(100):
        if not run('docker', 'exec', NAME, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres').returncode:
            break
        time.sleep(.1)
    sql((ROOT / 'supabase/tests/commercial-local-bootstrap.sql').read_text())
    for f in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
        sql(f.read_text())
    free = owner()
    rpc('commercial_free_grant', {'owner_id': free})
    request = dict(request_id=str(uuid.uuid4()), name='Fresh Brand', subject_type='brand', platform='instagram', locator='fresh.brand', identity='An independent education brand', audience='New creators', goal='Grow an engaged audience', confirmed=True, managed=True)
    setup = rpc('commercial_brand_setup', request, free)
    assert set(setup) == {'subject_id', 'channel_id', 'brief_id'}
    assert sql(f"select count(*) from audits where user_id='{free}'") == '0'
    assert sql(f"select gifted_audits from profiles where id='{free}'") == '0'
    assert sql(f"select sum(amount_microusd) from workspace_credit_lots where owner_id='{free}'") == '10000000'
    assert sql(f"select count(*) from workspace_credit_reservations where owner_id='{free}'") == '0'
    assert sql(f"select confirmed and created_by='{free}' from living_brief_versions where id='{setup['brief_id']}'") == 't'
    assert rpc('commercial_brand_setup', request, free) == setup
    with concurrent.futures.ThreadPoolExecutor(4) as pool:
        assert all(x == setup for x in pool.map(lambda _: rpc('commercial_brand_setup', request, free), range(4)))
    assert 'setup_request_conflict' in rpc('commercial_brand_setup', {**request, 'name': 'Changed'}, free, True)
    assert 'channel_already_configured' in rpc('commercial_brand_setup', {**request, 'request_id': str(uuid.uuid4())}, free, True)
    for change in [{'confirmed': False}, {'confirmed': 'true'}, {'managed': False}, {'identity': ''}, {'owner_id': owner()}, {'subject_id': setup['subject_id']}, {'platform': 'invalid'}, {'locator': 'https://evil.invalid/profile'}]:
        assert 'invalid_setup' in rpc('commercial_brand_setup', {**request, **change, 'request_id': str(uuid.uuid4())}, free, True)
    assert sql(f"select count(*) from subjects where user_id='{free}'") == '1'
    # Equal request IDs are tenant-local, never an authorization shortcut (even admins).
    other = owner()
    sql(f"update profiles set role='admin' where id='{other}'")
    theirs = rpc('commercial_brand_setup', request, other)
    assert theirs['subject_id'] != setup['subject_id']
    assert sql(f"set role authenticated;set request.jwt.claim.sub='{other}';select count(*) from commercial_brand_setups where owner_id='{free}'") == '0'
    for role in ['anon', 'service_role']:
        sql(f"set role {role};select commercial_brand_setup('{{}}')", True)
    assert 'authentication_required' in sql("set role authenticated;select commercial_brand_setup('{}')", True)
    sql(f"set role authenticated;set request.jwt.claim.sub='{free}';delete from commercial_brand_setups", True)
    # Race initial creation, not just replay of a pre-existing receipt.
    racing = owner()
    with concurrent.futures.ThreadPoolExecutor(4) as pool:
        created = list(pool.map(lambda _: rpc('commercial_brand_setup', request, racing), range(4)))
    assert len({x['subject_id'] for x in created}) == 1
    assert sql(f"select count(*) from subjects where user_id='{racing}'") == '1'
    # A failure after subject+channel insertion rolls back the complete command.
    atomic = owner()
    sql("create function public.setup_test_fail() returns trigger language plpgsql as $$ begin raise exception 'test_brief_failure'; end $$;create trigger setup_test_fail before insert on living_brief_versions for each row execute function public.setup_test_fail()")
    assert 'test_brief_failure' in rpc('commercial_brand_setup', request, atomic, True)
    assert sql(f"select count(*) from subjects where user_id='{atomic}'") == '0'
    assert sql(f"select count(*) from commercial_brand_setups where owner_id='{atomic}'") == '0'
    sql("drop trigger setup_test_fail on living_brief_versions;drop function public.setup_test_fail()")
    removed = rpc('commercial_brand_setup', request, atomic)
    sql(f"delete from subject_channels where id='{removed['channel_id']}'")
    assert 'setup_no_longer_available' in rpc('commercial_brand_setup', request, atomic, True)
    assert sql(f"select count(*) from subjects where user_id='{atomic}'") == '1'
    # No legacy Standard entitlement is required, including a fully exhausted owner.
    allowance = json.loads(sql(f"set role service_role;set request.jwt.claim.role='service_role';select audit_allowance('{free}')"))
    assert 'standard' not in allowance['allowed_report_types']
    exhausted = owner()
    sql(f"insert into audits(user_id,handle,report_type,status) values('{exhausted}','old','pulse','ready')")
    assert json.loads(sql(f"set role service_role;set request.jwt.claim.role='service_role';select audit_allowance('{exhausted}')"))['remaining'] == 0
    rpc('commercial_brand_setup', request, exhausted)
    assert sql(f"select count(*) from audits where user_id='{exhausted}'") == '1'
    # Existing trial gifts are not converted, consumed or extended by setup.
    trial = owner()
    sql(f"update profiles set account_type='trial',gifted_audits=3,trial_plan='starter',trial_expires_at=now()+interval '7 days' where id='{trial}'")
    before = sql(f"select to_jsonb(p) from profiles p where id='{trial}'")
    rpc('commercial_brand_setup', request, trial)
    assert sql(f"select to_jsonb(p) from profiles p where id='{trial}'") == before
    assert sql(f"select count(*) from workspace_credit_lots where owner_id='{trial}'") == '0'
    # Actual ordinary commercial quote / acceptance; qualification is a local-only fixture.
    sql("insert into commercial_runtime_catalog(id,model,rate_version,input_microusd_per_mtok,output_microusd_per_mtok,max_input_tokens,max_output_tokens,max_calls,research_microusd,qualification_ref,qualified_until) values('auto','deepseek/deepseek-v4-flash-0731','test-only',1000000,2000000,10000,20000,2,100000,'test-only:not-production',now()+interval '1 hour')")
    quote = rpc('commercial_quote', {**setup, 'owner_id': free, 'goal': request['goal'], 'report_type': 'standard'})
    assert sql(f"select count(*) from audits where user_id='{free}'") == '0'
    submit = dict(owner_id=free, quote_id=quote['id'], consent=False)
    assert 'explicit_consent_required' in rpc('commercial_submit', submit, fail=True)
    assert sql(f"select count(*) from audits where user_id='{free}'") == '0'
    submit['consent'] = True
    audit = rpc('commercial_submit', submit)
    assert rpc('commercial_submit', submit) == audit
    assert sql(f"select status from audits where id='{audit}'") == 'queued'
    assert sql(f"select brief_version_id from audits where id='{audit}'") == setup['brief_id']
    assert sql(f"select gifted_audits from profiles where id='{free}'") == '0'
    # Exercise production Next actions against these same real DB functions.
    # Hosted Supabase grants API SELECT on the original audits table by default;
    # vanilla bootstrap has no default privileges. Keep RLS active in this adapter.
    sql("grant select on public.audits to authenticated")
    action_owner = owner()
    for tracer_owner, baseline in [(action_owner, 0), (exhausted, 1)]:
        probe = run('node', str(ROOT / 'web/scripts/commercial-onboarding-probe.cjs'), input=json.dumps({'container': NAME, 'owner': tracer_owner, 'request': request, 'expectedAudits': baseline}))
        assert not probe.returncode, probe.stdout + probe.stderr
        print(probe.stdout.strip())
    print('PASS full migrations: Free enrollment -> atomic setup -> quote -> explicit consent -> one queued audit; retry/concurrency/conflict/tenant/ACL/zero-legacy/gift invariants')
finally:
    run('docker', 'rm', '-f', NAME)
