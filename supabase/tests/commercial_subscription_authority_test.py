#!/usr/bin/env python3
"""Actual reconciliation RPC; only a dedicated disposable loopback DB is allowed."""
import json
import subprocess
import sys
import uuid
from urllib.parse import urlparse
from pathlib import Path

# Stage one is unshipped; its authority must stay byte-identical to the
# additive repair used by already-applied local databases.
migrations = Path(__file__).parents[1] / 'migrations'
stage_one = (migrations / '20260919204027_commercial_intake_allowance.sql').read_text()
repair = (migrations / '20260919214119_commercial_subscription_authority_guard.sql').read_text()
start_marker = 'create or replace function public.reconcile_stripe_subscription('
assert stage_one[stage_one.index(start_marker):stage_one.index('-- Narrow rollout repair:')].strip() == repair[repair.index(start_marker):].strip()

URL = sys.argv[1] if len(sys.argv) == 2 else ''
p = urlparse(URL)
if p.hostname != '127.0.0.1' or p.port != 55439 or p.path != '/commercial_closure':
    raise SystemExit('Use own disposable 127.0.0.1:55439/commercial_closure DB')


def sql(query):
    r = subprocess.run(['psql', URL, '-XAtq', '-v', 'ON_ERROR_STOP=1', '-c', "set request.jwt.claim.role='service_role';" + query], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    return r.stdout.strip()


def fixture():
    u = str(uuid.uuid4())
    sql(f"insert into auth.users(id,email) values('{u}','closure@example.invalid'); update profiles set stripe_customer_id='cus_{u}' where id='{u}'")
    return u


def event(u, name, sub, time, status='active', plan='pro', kind='customer.subscription.updated', start=100, end=400, hint=True, customer=None):
    owner = "'" + u + "'" if hint else 'null'
    return json.loads(sql(f"select reconcile_stripe_subscription('{name}_{u}','{kind}',{time},'{sub}_{u}','{customer or 'cus_'+u}',{owner},'{status}','{plan}',{start},{end},repeat('a',64))"))


def snapshot(u):
    return json.loads(sql(f"select jsonb_build_object('profile', (select to_jsonb(p) from profiles p where id='{u}'), 'receipts', (select coalesce(jsonb_agg(to_jsonb(r) order by provider_event_id),'[]') from provider_event_receipts r where profile_id='{u}'))"))


def reject_unchanged(u, **kwargs):
    before = snapshot(u)
    result = event(u, **kwargs)
    assert not result['applied'], result
    assert snapshot(u) == before, (result, before, snapshot(u))
    return result


u = fixture()
assert event(u, 'current', 'current', 2000)['applied']
# Both older and newer cancellation of a DIFFERENT subscription are powerless.
reject_unchanged(u, name='late_cancel', sub='old', time=1000, status='canceled', plan='free')
reject_unchanged(u, name='newer_cancel', sub='old', time=3000, status='canceled', plan='free')
print('PASS noncurrent cancellations preserve exact profile and all receipts')

# Arbitrary updates/created are not explicit new-checkout adoption authority.
for kind in ('customer.subscription.updated', 'customer.subscription.created'):
    reject_unchanged(u, name=kind, sub='other', time=3000, kind=kind, start=200, end=500)
# Checkout ownership, customer, ordering, and non-regressing period evidence.
for index, args in enumerate(({'time':1999}, {'time':2000}, {'time':3000,'hint':False}, {'time':3000,'customer':'foreign'}, {'time':3000,'start':99})):
    reject_unchanged(u, **{'name':'bad_checkout'+str(index), 'sub':'new', 'kind':'checkout.session.completed', **args})
print('PASS unauthorized, stale and equal-time adoption rejected without writes')

assert event(u, 'new_checkout', 'new', 3000, kind='checkout.session.completed', start=200, end=500)['applied']
s = snapshot(u)
assert s['profile']['stripe_subscription_id'] == 'new_'+u
assert s['profile']['plan'] == 'pro'
assert len(s['receipts']) == 2
reject_unchanged(u, name='new_checkout', sub='new', time=3000, kind='checkout.session.completed', start=200, end=500)
reject_unchanged(u, name='old_checkout_replay', sub='current', time=2500, kind='checkout.session.completed', start=200, end=500)
reject_unchanged(u, name='old_late_cancel', sub='current', time=4000, status='canceled', plan='free')
assert event(u, 'current_cancel', 'new', 4000, status='canceled', plan='free', start=200, end=500)['applied']
s = snapshot(u)
assert (s['profile']['stripe_subscription_id'],s['profile']['plan'],s['profile']['subscription_status']) == ('new_'+u,'free','canceled')
reject_unchanged(u, name='stale_current', sub='new', time=3999)
# Legitimate checkout after cancel is not locked out forever.
assert event(u, 'resubscribe', 'third', 5000, kind='checkout.session.completed', start=300, end=600)['applied']
print('PASS new checkout adoption, duplicate, profile-wide ordering, current cancel, resubscribe')

for status in ('manual_enterprise','complimentary'):
    m = fixture()
    sql(f"update profiles set plan='enterprise',subscription_status='{status}',stripe_subscription_id='manual_{m}' where id='{m}'")
    before = snapshot(m)['profile']
    result = event(m, 'manual_checkout', 'other', 6000, kind='checkout.session.completed')
    assert result['code'] == 'manual_precedence', result
    assert snapshot(m)['profile'] == before
    assert len(snapshot(m)['receipts']) == 1
print('PASS exact manual/complimentary projection preservation')

# A retired subscription cannot return even with a later checkout timestamp.
reject_unchanged(u, name='retired_checkout', sub='current', time=9000, kind='checkout.session.completed', start=400, end=700)
# Legacy stored subscriptions without receipts still reject unrelated revocation;
# after exact start backfill they can deliberately adopt a genuine new checkout.
l = fixture()
sql(f"update profiles set plan='pro',subscription_status='active',stripe_subscription_id='legacy_{l}',current_period_end=to_timestamp(400) where id='{l}'")
reject_unchanged(l, name='legacy_cancel', sub='other', time=1000, status='canceled', plan='free')
reject_unchanged(l, name='needs_backfill', sub='new', time=1000, kind='checkout.session.completed', start=200, end=500)
assert sql(f"select backfill_stripe_period_start('{l}','legacy_{l}','cus_{l}',100,400)") == 't'
assert event(l, 'legacy_checkout', 'new', 1000, kind='checkout.session.completed', start=200, end=500)['applied']
print('PASS retired authority and legacy-no-receipt safety with post-backfill adoption')

# A legacy cancellation can have no period start and cannot use active-only
# backfill. It must still allow a deliberate new paid checkout, not lock forever.
z = fixture()
sql(f"update profiles set plan='free',subscription_status='canceled',stripe_subscription_id='canceled_{z}' where id='{z}'")
assert event(z, 'after_legacy_cancel', 'fresh', 2000, kind='checkout.session.completed', start=1000, end=3000)['applied']
assert snapshot(z)['profile']['stripe_subscription_id'] == 'fresh_'+z
print('PASS legacy canceled/no-window new checkout adoption')

# Real concurrent transactions use the profile lock, not isolated sub receipts.
import concurrent.futures
c = fixture()
assert event(c, 'initial', 'initial', 1000)['applied']
def checkout(n):
    return event(c, 'race'+str(n), 'race'+str(n), 2000+n, kind='checkout.session.completed', start=200+n, end=500+n)
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    outcomes = list(pool.map(checkout, (1,2)))
assert outcomes[1]['applied'], outcomes
assert snapshot(c)['profile']['stripe_subscription_id'] == 'race2_'+c
assert sql("select has_function_privilege('authenticated','public.reconcile_stripe_subscription(text,text,bigint,text,text,uuid,text,text,bigint,bigint,text)','execute')") == 'f'
assert sql("select has_function_privilege('anon','public.reconcile_stripe_subscription(text,text,bigint,text,text,uuid,text,text,bigint,bigint,text)','execute')") == 'f'
print('PASS concurrent cross-subscription order and service-only authority')
