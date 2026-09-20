#!/usr/bin/env python3
"""Real SQL commercial contract probes. Requires explicit isolated loopback DB URL.
Never uses environment credentials or a linked Supabase project. Fixtures are
unique UUIDs; no database resets or production DDL. Use commercial-local-bootstrap
and the migration chain in a disposable PostgreSQL 16 container first.
"""
import concurrent.futures
import json
import subprocess
import sys
import uuid
from urllib.parse import urlparse

url = sys.argv[1] if len(sys.argv) == 2 else ""
parsed = urlparse(url)
if parsed.hostname not in ("127.0.0.1", "localhost") or parsed.port != 55439:
    raise SystemExit("Pass the dedicated commercial test DB URL on loopback:55439")


def sql(query, fail=None):
    result = subprocess.run(["psql", url, "-XAtq", "-v", "ON_ERROR_STOP=1", "-c", "set request.jwt.claim.role='service_role'; " + query], text=True, capture_output=True)
    if fail:
        assert result.returncode and fail in result.stderr, result.stderr or result.stdout
        return ""
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def lit(value):
    return "'" + str(value).replace("'", "''") + "'"


def user(plan="starter", extra=""):
    uid = str(uuid.uuid4())
    sql(f"insert into auth.users(id,email) values('{uid}','commercial-test@example.invalid'); update profiles set plan='{plan}' {extra} where id='{uid}';")
    return uid


def allowance(uid):
    return json.loads(sql(f"select audit_allowance('{uid}')"))


def submit(uid):
    return f"select submit_entitled_audit('{uid}','test','instagram','growth','standard','','queued','[]',null)"


def seed(uid, count, timestamp="now()"):
    sql(f"insert into audits(user_id,handle,status,created_at) select '{uid}','test','ready',{timestamp} from generate_series(1,{count})")


def item(brief=None):
    return {"handle": "test", "platform": "instagram", "channel_type": "instagram", "channel_locator": "test", "goal": "growth", "report_type": "standard", "context": "launch", "status": "queued", "brief_version_id": brief}


def batch(uid, sid, items, key):
    return f"select submit_entitled_audit_batch_v2('{uid}',{lit(sid) if sid else 'null'}, {'null' if sid else lit(json.dumps({'name':'Draft','subject_type':'creator'}))},'{key}',{lit(json.dumps(items))}::jsonb)"


# Exact Stripe interval, including first/start/end boundary and non-calendar anchor.
u = user(extra=", stripe_subscription_id='sub_test',subscription_status='active',current_period_start=now()-interval '9 days 7 hours',current_period_end=now()+interval '19 days 3 hours'")
seed(u, 10, "(select current_period_start-interval '1 second' from profiles where id='"+u+"')")
seed(u, 1, "(select current_period_start from profiles where id='"+u+"')")
seed(u, 1, "(select current_period_end from profiles where id='"+u+"')")
assert allowance(u)["usage"] == 1
sql(submit(u)); assert allowance(u)["usage"] == 2
sql(f"update profiles set current_period_start=now()+interval '1 day',current_period_end=now()+interval '32 days' where id='{u}'")
assert not allowance(u)["window_valid"]
sql(submit(u), "billing_period_unreconciled")
print("PASS exact non-calendar window and boundaries")

# Free lifetime, active/expired trial, gifts, admin/manual semantics.
f = user("free"); seed(f, 1, "now()-interval '400 days'"); assert not allowance(f)["can_submit"]
t = user("free", ",account_type='trial',trial_plan='pro',trial_report_types=array['enterprise'],trial_expires_at=now()+interval '1 day'")
assert allowance(t)["limit"] == 15 and "enterprise" in allowance(t)["allowed_report_types"]
seed(t, 2); sql(f"update profiles set gifted_audits=3,trial_expires_at=now()-interval '1 second' where id='{t}'")
assert allowance(t)["gifts"] == 0 and not allowance(t)["can_submit"]
sql(f"update profiles set trial_expires_at=now()+interval '1 day' where id='{t}'")
assert allowance(t)["gifts"] == 3 and allowance(t)["can_submit"]
g = user(extra=",gifted_audits=2"); seed(g, 5); assert allowance(g)["remaining"] == 2
sql(submit(g)); assert allowance(g)["remaining"] == 1
admin = user("free", ",role='admin'"); seed(admin, 3); assert allowance(admin)["remaining"] is None
manual = user("enterprise", ",subscription_status='manual_enterprise'"); assert allowance(manual)["window_kind"] == "lifetime"
print("PASS free/trial/gift/manual/admin semantics")

# Concurrent final slot and batch rollback/idempotent retry before allowance.
c = user(); seed(c, 4)
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    def race(_):
        r = subprocess.run(["psql", url, "-XAtq", "-v", "ON_ERROR_STOP=1", "-c", "set request.jwt.claim.role='service_role';"+submit(c)],capture_output=True,text=True)
        return r.returncode, r.stderr
    raced = list(pool.map(race, range(2)))
assert sum(code == 0 for code, _ in raced) == 1 and any("audit_limit_reached" in err for _, err in raced)
b = user(); seed(b, 4); key = str(uuid.uuid4())
sql(batch(b,None,[item(),item()],key),"audit_limit_reached")
assert sql(f"select count(*) from subjects where user_id='{b}'") == "0"
assert allowance(b)["usage"] == 4
accepted = json.loads(sql(batch(b,None,[item()],key)))
assert allowance(b)["remaining"] == 0
retry = json.loads(sql(batch(b,None,[item()],key))); assert accepted == retry
assert sql(f"select count(*) from audits where user_id='{b}'") == "5"
print("PASS locked final-slot race, atomic rollback and recovered retry")

# Exact brief pin/context, later edit cannot change accepted context or provenance.
aid=accepted['audit_ids'][0]; sid=accepted['subject_id']
pinned=sql(f"select brief_version_id from audits where id='{aid}'"); assert pinned
assert pinned in sql(f"select context from audits where id='{aid}'")
v2=sql(f"select record_living_brief_version('{sid}',2,'1.0','{{\"name\":\"later edit\"}}','{{}}','{{}}','[]','[]','[]','[]','[]','{b}',true)")
assert v2 != pinned and sql(f"select brief_version_id from audits where id='{aid}'") == pinned
other=user(); other_sid=sql(f"select create_subject('{other}','Other','creator')")
sql(batch(other,other_sid,[item(pinned)],str(uuid.uuid4())),"brief_not_owned")
assert allowance(other)["usage"] == 0
print("PASS initial brief pin, later edit immutability, foreign brief rollback")

# Reconciliation start-sensitive equality/digest projection, malformed/stale/duplicate events.
r=user(extra=",stripe_customer_id='cus_reconcile'")
def reconcile(event, created, start: int | None =100, end=200):
    start_sql='null' if start is None else str(start)
    return json.loads(sql(f"select reconcile_stripe_subscription('{event}','customer.subscription.updated',{created},'sub_{r}','cus_reconcile','{r}','active','starter',{start_sql},{end},repeat('a',64))"))
assert reconcile('evt_a_'+r,1000)['applied']
assert reconcile('evt_a_'+r,1000)['code']=='duplicate'
assert reconcile('evt_b_'+r,999)['code']=='stale'
assert reconcile('evt_c_'+r,1000)['code']=='replay'
assert reconcile('evt_d_'+r,1000,101)['code']=='equal_time_conflict'
assert reconcile('evt_e_'+r,1001,200,400)['applied']
assert reconcile('evt_f_'+r,1002,None)['code']=='malformed_period'
assert sql(f"select extract(epoch from current_period_start)::int from profiles where id='{r}'")=='200'
manual_result=json.loads(sql(f"select reconcile_stripe_subscription('evt_manual_{manual}','customer.subscription.updated',1000,'sub_{manual}','cus_manual','{manual}','active','starter',100,200,repeat('a',64))"))
assert manual_result['code']=='manual_precedence'
assert allowance(manual)['effective_plan']=='enterprise'
print("PASS Stripe duplicate/stale/replay/start conflict/renewal/malformed/manual precedence")

# Backfill is scoped to actual existing subscription identity and exact old end.
x=user(extra=",stripe_customer_id='cus_backfill',stripe_subscription_id='sub_backfill',subscription_status='active',current_period_end=to_timestamp(400)")
assert sql(f"select backfill_stripe_period_start('{x}','wrong','cus_backfill',200,400)")=='f'
assert sql(f"select backfill_stripe_period_start('{x}','sub_backfill','cus_backfill',200,401)")=='f'
assert sql(f"select backfill_stripe_period_start('{x}','sub_backfill','cus_backfill',200,400)")=='t'
assert sql(f"select backfill_stripe_period_start('{x}','sub_backfill','cus_backfill',100,400)")=='f'
print("PASS scoped existing-subscriber backfill/readback")

# Authenticated foreign owner (including admin) denied at read authority.
sql(f"set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='{admin}';select audit_allowance('{f}')",'not_authorized')
print("PASS owner-scoped allowance; all commercial SQL probes passed")

# Stage-two deployment must refuse an existing subscriber missing actual start.
from pathlib import Path
missing = user(extra=",stripe_subscription_id='sub_missing',subscription_status='active',current_period_end=now()+interval '3 days'")
migration = (Path(__file__).parents[1] / 'migrations/20260919204116_commercial_allowance_brief_gate.sql').read_text()
guard = migration[migration.index('do $$'):migration.index('end $$;')+len('end $$;')]
sql(guard,'reconcile_existing_stripe_windows_before_allowance_gate')
sql(f"update profiles set stripe_subscription_id=null where id='{missing}'")
assert sql("select has_function_privilege('authenticated','public.submit_entitled_audit(uuid,text,text,text,text,text,text,jsonb,text)','execute')") == 'f'
assert sql("select has_function_privilege('authenticated','public.audit_allowance(uuid)','execute')") == 't'
print("PASS rollout backfill prerequisite and RPC grants")
