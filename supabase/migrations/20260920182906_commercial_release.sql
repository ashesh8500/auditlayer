-- New opt-in commercial terms; never rewrite purchased legacy entitlements.
begin;
-- Projection of web/src/lib/commercial-policy.json. SQL acceptance verifies exact equality.
create function public.commercial_policy() returns jsonb language sql immutable
set search_path=pg_catalog as $$ select '{
  "version": "ALM-2026-09.v1",
  "currency": "USD",
  "credits_per_usd": 100,
  "reference_tariff_multiplier": 3,
  "welcome_credits": 500,
  "run_ceiling_microusd": 15000000,
  "topup_usd": 10,
  "topup_credits": 1000,
  "purchased_expiry": null,
  "refund_terms": null,
  "annual": false,
  "plans": {
    "free": {
      "name": "Free",
      "monthly_usd": 0,
      "brands": 1,
      "monthly_credits": 500,
      "owners": 1,
      "topup_cap_microusd": 0,
      "consumption_cap_microusd": 10000000,
      "upstream_cap_microusd": 6000000
    },
    "brand": {
      "name": "Brand",
      "monthly_usd": 199,
      "brands": 1,
      "monthly_credits": 5000,
      "owners": 1,
      "topup_cap_microusd": 50000000,
      "consumption_cap_microusd": 100000000,
      "upstream_cap_microusd": 60000000
    },
    "studio": {
      "name": "Studio",
      "monthly_usd": 499,
      "brands": 5,
      "monthly_credits": 15000,
      "owners": 1,
      "topup_cap_microusd": 150000000,
      "consumption_cap_microusd": 300000000,
      "upstream_cap_microusd": 180000000
    },
    "enterprise": {
      "name": "Enterprise",
      "monthly_usd": null,
      "brands": null,
      "monthly_credits": null,
      "owners": null,
      "topup_cap_microusd": null,
      "consumption_cap_microusd": null,
      "upstream_cap_microusd": null
    }
  }
}
'::jsonb $$;
revoke all on function public.commercial_policy() from public,anon;
grant execute on function public.commercial_policy() to authenticated,service_role;
alter table public.workspace_credit_cycles alter column subscription_id drop not null;
alter table public.workspace_credit_cycles drop constraint workspace_credit_cycles_access_microusd_check;
alter table public.workspace_credit_cycles add column commercial_plan text check(commercial_plan in ('free','brand','studio'));
alter table public.workspace_credit_cycles add column pricing_version text check(pricing_version='ALM-2026-09.v1');
alter table public.workspace_credit_cycles add column period_source text not null default 'stripe' check(period_source in ('stripe','calendar_month_utc'));
alter table public.workspace_credit_cycles add constraint commercial_cycle_shape check(
 (commercial_plan is null and pricing_version is null and period_source='stripe' and subscription_id is not null and access_microusd=129000000)
 or (commercial_plan is not null and pricing_version is not null and ((commercial_plan='free' and period_source='calendar_month_utc' and subscription_id is null and access_microusd=0)
 or (commercial_plan in ('brand','studio') and period_source='stripe' and subscription_id is not null))));
create unique index commercial_free_cycle_once on public.workspace_credit_cycles(owner_id,period_start) where commercial_plan='free';
create function public.commercial_free_grant(p jsonb) returns uuid language plpgsql security definer
set search_path=pg_catalog,public as $$
declare o uuid:=(p->>'owner_id')::uuid; pr public.profiles; c uuid; lot uuid; event text; kind text;
 pol jsonb:=public.commercial_policy(); amount bigint;
 s timestamptz:=date_trunc('month',clock_timestamp() at time zone 'UTC') at time zone 'UTC';
 e timestamptz;
begin
 e:=((s at time zone 'UTC')+interval '1 month') at time zone 'UTC';
 select * into pr from public.profiles where id=o for update;
 if not found then raise exception 'owner_missing'; end if;
 if not exists(select 1 from auth.users where id=o and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then raise exception 'verified_identity_required'; end if;
 if pr.stripe_subscription_id is not null or exists(select 1 from public.workspace_credit_cycles where owner_id=o and commercial_plan is distinct from 'free') then raise exception 'existing_contract_preserved'; end if;
 insert into public.workspace_credit_cycles(owner_id,subscription_id,period_start,period_end,policy_version,access_microusd,commercial_plan,pricing_version,period_source)
 values(o,null,s,e,'P-01.v1',0,'free',pol->>'version','calendar_month_utc') on conflict do nothing;
 select id into c from public.workspace_credit_cycles where owner_id=o and period_start=s and commercial_plan='free';
 foreach kind in array array['monthly','welcome'] loop
  event:='commercial-free:'||o::text||':'||kind||case when kind='monthly' then ':'||to_char(s at time zone 'UTC','YYYY-MM') else '' end;
  if not exists(select 1 from public.workspace_credit_lots where event_id=event) then
   amount:=case when kind='monthly' then (pol->'plans'->'free'->>'monthly_credits')::bigint else (pol->>'welcome_credits')::bigint end * (1000000/(pol->>'credits_per_usd')::bigint);
   insert into public.workspace_credit_lots(owner_id,cycle_id,kind,amount_microusd,expires_at,event_id,payment_id,payload)
   values(o,c,'included',amount,e,event,event,jsonb_build_object('grant_source',kind,'pricing_version',pol->>'version')) returning id into lot;
   insert into public.workspace_credit_ledger(owner_id,lot_id,operation_id,kind,amount_microusd) values(o,lot,event,'grant',amount);
  end if;
 end loop;
 return c;
end $$;
revoke all on function public.commercial_free_grant(jsonb) from public,anon,authenticated;
grant execute on function public.commercial_free_grant(jsonb) to service_role;
create table public.commercial_managed_brands (
 owner_id uuid not null references public.profiles(id), subject_id uuid not null references public.subjects(id),
 created_at timestamptz not null default now(), primary key(owner_id,subject_id)
);
alter table public.commercial_managed_brands enable row level security;
revoke all on public.commercial_managed_brands from public,anon,authenticated,service_role;
grant select on public.commercial_managed_brands to authenticated,service_role;
create policy owner_read on public.commercial_managed_brands for select to authenticated using(owner_id=(select auth.uid()));
create function public.commercial_cycle_active(cid uuid) returns boolean language sql volatile
security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.workspace_credit_cycles c join public.profiles p on p.id=c.owner_id
 where c.id=cid and not c.cancelled and c.period_start<=clock_timestamp() and clock_timestamp()<c.period_end and (
 (c.period_source='stripe' and p.subscription_status='active' and c.subscription_id=p.stripe_subscription_id and c.period_start=p.current_period_start and c.period_end=p.current_period_end)
 or (c.commercial_plan='free' and p.stripe_subscription_id is null and exists(select 1 from auth.users u where u.id=p.id and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)))
 ))
$$;
revoke all on function public.commercial_cycle_active(uuid) from public,anon,authenticated;
grant execute on function public.commercial_cycle_active(uuid) to service_role;
create or replace function public.workspace_credit_reserve(p jsonb) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare o uuid:=(p->>'owner_id')::uuid; rid uuid:=(p->>'reservation_id')::uuid; pr public.profiles; c public.workspace_credit_cycles;
 r public.workspace_credit_reservations; l record; a public.workspace_microusd:=(p->>'retail_microusd')::bigint;
 up public.workspace_microusd:=(p->>'upstream_microusd')::bigint; remaining bigint:=a; take bigint; n integer:=0; pol jsonb;
begin
 select * into pr from public.profiles where id=o for update;
 if not found then raise exception 'owner_missing'; end if;
 select * into r from public.workspace_credit_reservations where id=rid;
 if found then
  if r.intent is distinct from p then raise exception 'idempotency_mismatch'; end if;
  if r.state<>'held' then raise exception 'reservation_terminal'; end if;
  if coalesce((p->>'quote_expires_at')::timestamptz,'-infinity'::timestamptz)<=clock_timestamp() then raise exception 'quote_expired'; end if;
  if not public.commercial_cycle_active(r.cycle_id)
   or exists(select 1 from public.workspace_credit_allocations al join public.workspace_credit_lots lo on lo.id=al.lot_id where al.reservation_id=rid and lo.expires_at<=clock_timestamp()) then raise exception 'inactive_cycle'; end if;
  return rid;
 end if;
 if exists(select 1 from public.workspace_credit_reservations rr where rr.owner_id=o and rr.intent->>'run_intent_id'=p->>'run_intent_id') then raise exception 'run_intent_reused'; end if;
 if coalesce((p->>'quote_expires_at')::timestamptz,'-infinity'::timestamptz)<=clock_timestamp() then raise exception 'quote_expired'; end if;
 if not (p ?& array['owner_id','reservation_id','run_intent_id','quote_expires_at','subject_id','quote_id','model_id','rate_version','context_version','intent_fingerprint','retail_microusd','upstream_microusd','recurring'])
 or coalesce(p->>'run_intent_id','')=''
 or coalesce(p->>'intent_fingerprint','') !~ '^[0-9a-f]{64}$' or coalesce(p->>'quote_id','')='' or coalesce(p->>'model_id','')='' or coalesce(p->>'rate_version','')='' or coalesce(p->>'context_version','')=''
 or a is null or up is null or a not between 1 and 15000000 or up not between 1 and 60000000 then raise exception 'invalid_intent'; end if;
 if not exists(select 1 from public.subjects where id=(p->>'subject_id')::uuid and user_id=o) then raise exception 'subject_not_owned'; end if;
 select * into c from public.workspace_credit_cycles where owner_id=o and public.commercial_cycle_active(id)
 order by period_start desc limit 1;
 if not found then raise exception 'inactive_cycle'; end if;
 pol:=public.commercial_policy()->'plans'->c.commercial_plan;
 if exists(select 1 from public.workspace_credit_reservations where owner_id=o and state='held') then raise exception 'owner_concurrency'; end if;
 if a+(select coalesce(sum(case when state='held' then retail_microusd else customer_debit_microusd end),0) from public.workspace_credit_reservations where cycle_id=c.id)>coalesce((pol->>'consumption_cap_microusd')::bigint,100000000) then raise exception 'consumption_cap'; end if;
 -- Unresolved exposure from OLD cycles also blocks capacity; no rollover escape.
 if up+(select coalesce(sum(coalesce(actual_upstream_microusd,upstream_microusd)),0) from public.workspace_credit_reservations where owner_id=o and (cycle_id=c.id or actual_upstream_microusd is null))>coalesce((pol->>'upstream_cap_microusd')::bigint,60000000) then raise exception 'upstream_cap'; end if;
 if c.commercial_plan is not null then
  if not exists(select 1 from public.commercial_managed_brands where owner_id=o and subject_id=(p->>'subject_id')::uuid) then
   if (select count(*) from public.commercial_managed_brands where owner_id=o)>=(pol->>'brands')::integer then raise exception 'brand_limit'; end if;
   insert into public.commercial_managed_brands(owner_id,subject_id) values(o,(p->>'subject_id')::uuid);
  end if;
 end if;
 insert into public.workspace_credit_reservations(id,owner_id,subject_id,cycle_id,intent,retail_microusd,upstream_microusd) values(rid,o,(p->>'subject_id')::uuid,c.id,p,a,up);
 for l in select lot.*,lot.amount_microusd-coalesce((select sum(d.amount_microusd) from public.workspace_credit_ledger d where d.lot_id=lot.id and d.kind in ('debit','refund_reserved')),0) as available
 from public.workspace_credit_lots lot where lot.owner_id=o and (lot.expires_at is null or lot.expires_at>clock_timestamp()) order by (lot.kind='included') desc,lot.expires_at,lot.id loop
  take:=least(remaining,l.available);
  if take>0 then
   n:=n+1; insert into public.workspace_credit_allocations values(rid,o,l.id,take,n); remaining:=remaining-take;
  end if;
  exit when remaining=0;
 end loop;
 if remaining<>0 then raise exception 'insufficient_credit'; end if;
 return rid;
end $$;
alter table public.workspace_credit_lots alter column expires_at drop not null;
alter function public.workspace_credit_grant(jsonb) rename to workspace_credit_grant_legacy;
revoke all on function public.workspace_credit_grant_legacy(jsonb) from public,anon,authenticated,service_role;
create function public.workspace_credit_grant(p jsonb) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare o uuid:=(p->>'owner_id')::uuid; pr public.profiles; l public.workspace_credit_lots; c uuid;
 a bigint:=(p->>'amount_microusd')::bigint; s timestamptz:=to_timestamp((p->>'period_start')::bigint); e timestamptz:=to_timestamp((p->>'period_end')::bigint);
 pol jsonb:=public.commercial_policy(); plan jsonb; key text:=p->>'commercial_plan';
begin
 select * into pr from public.profiles where id=o for update;
 if not found then raise exception 'owner_missing'; end if;
 if not(p ? 'pricing_version') and not(p ? 'commercial_plan') then
  if exists(select 1 from public.workspace_credit_cycles where owner_id=o and subscription_id=p->>'subscription_id' and commercial_plan is not null) then raise exception 'commercial_policy_required'; end if;
  return public.workspace_credit_grant_legacy(p);
 end if;
 select * into l from public.workspace_credit_lots where event_id=p->>'event_id' or payment_id=p->>'payment_id';
 if found then if l.payload is distinct from p then raise exception 'idempotency_mismatch'; end if; return l.id; end if;
 plan:=pol->'plans'->key;
 if p->>'pricing_version' is distinct from pol->>'version' or coalesce(key,'') not in ('brand','studio')
 or p->>'policy_version' is distinct from 'P-01.v1' then raise exception 'commercial_policy_denied'; end if;
 if not(p ?& array['owner_id','event_id','payment_id','subscription_id','customer_id','period_start','period_end','kind','amount_microusd','paid_microusd'])
 or coalesce(p->>'event_id','')='' or coalesce(p->>'payment_id','')=''
 or pr.stripe_subscription_id is distinct from p->>'subscription_id' or pr.stripe_customer_id is distinct from p->>'customer_id'
 or pr.subscription_status is distinct from 'active' or pr.current_period_start is distinct from s or pr.current_period_end is distinct from e
 or not(s<=clock_timestamp() and clock_timestamp()<e) then raise exception 'payment_authority_denied'; end if;
 -- Switching purchased contracts requires a separate explicit migration, not a price relabel.
 if exists(select 1 from public.workspace_credit_cycles where owner_id=o and commercial_plan is distinct from 'free' and commercial_plan is distinct from key)
 then raise exception 'existing_contract_preserved'; end if;
 if exists(select 1 from public.workspace_credit_cycles where owner_id=o and subscription_id=p->>'subscription_id' and cancelled) then raise exception 'cancelled_subscription'; end if;
 if p->>'kind'='included' then
  if a is distinct from (plan->>'monthly_credits')::bigint*(1000000/(pol->>'credits_per_usd')::bigint)
   or (p->>'paid_microusd')::bigint is distinct from (plan->>'monthly_usd')::bigint*1000000 then raise exception 'invalid_paid_allowance'; end if;
  insert into public.workspace_credit_cycles(owner_id,subscription_id,period_start,period_end,policy_version,access_microusd,commercial_plan,pricing_version)
  values(o,p->>'subscription_id',s,e,'P-01.v1',(plan->>'monthly_usd')::bigint*1000000,key,pol->>'version') on conflict do nothing;
 end if;
 select id into c from public.workspace_credit_cycles where owner_id=o and subscription_id=p->>'subscription_id' and period_start=s and period_end=e and commercial_plan=key and not cancelled;
 if c is null then raise exception 'cycle_missing_or_cancelled'; end if;
 if p->>'kind'='included' then
  if exists(select 1 from public.workspace_credit_lots where cycle_id=c and kind='included') then raise exception 'cycle_already_granted'; end if;
 elsif p->>'kind'='purchased' then
  if a is null or a<=0 or a%((pol->>'topup_usd')::bigint*1000000)<>0 or (p->>'paid_microusd')::bigint is distinct from a
   or a+(select coalesce(sum(amount_microusd),0) from public.workspace_credit_lots where cycle_id=c and kind='purchased')>(plan->>'topup_cap_microusd')::bigint then raise exception 'topup_cap'; end if;
 else raise exception 'invalid_kind'; end if;
 insert into public.workspace_credit_lots(owner_id,cycle_id,kind,amount_microusd,expires_at,event_id,payment_id,payload)
 values(o,c,p->>'kind',a,case when p->>'kind'='included' then e else null end,p->>'event_id',p->>'payment_id',p) returning * into l;
 insert into public.workspace_credit_ledger(owner_id,lot_id,operation_id,kind,amount_microusd) values(o,l.id,p->>'event_id','grant',a);
 return l.id;
end $$;
revoke all on function public.workspace_credit_grant(jsonb) from public,anon,authenticated;
grant execute on function public.workspace_credit_grant(jsonb) to service_role;
create function public.commercial_credit_wallet() returns jsonb
language sql stable security invoker set search_path=pg_catalog,public as $$
with cycle as (
 select c.* from public.workspace_credit_cycles c
 where c.owner_id=auth.uid() and c.commercial_plan is not null order by c.period_end desc,c.period_start desc,c.id limit 1
), lots as (
 select l.*,coalesce((select sum(d.amount_microusd) from public.workspace_credit_ledger d where d.lot_id=l.id and d.kind='debit'),0)::bigint consumed,
 coalesce((select sum(d.amount_microusd) from public.workspace_credit_ledger d where d.lot_id=l.id and d.kind='refund_reserved'),0)::bigint refunded,
 coalesce((select sum(a.amount_microusd) from public.workspace_credit_allocations a join public.workspace_credit_reservations r on r.id=a.reservation_id where a.lot_id=l.id and r.state='held'),0)::bigint held
 from public.workspace_credit_lots l where l.owner_id=auth.uid() and (l.expires_at is null or l.expires_at>now())
), projection as (
 select *,amount_microusd-consumed-refunded balance from lots
)
select jsonb_build_object(
 'owner_id',c.owner_id,'policy_version',c.policy_version,'currency','USD',
 'subscription_id',c.subscription_id,'period_source',c.period_source,'commercial_plan',c.commercial_plan,'pricing_version',c.pricing_version,
 'period_start',to_char(c.period_start at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'period_end',to_char(c.period_end at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'balance',jsonb_build_object('currency','USD','microusd',(select coalesce(sum(balance),0) from projection)),
 'reserved',jsonb_build_object('currency','USD','microusd',(select coalesce(sum(held),0) from projection)),
 'consumed_this_cycle',jsonb_build_object('currency','USD','microusd',(select coalesce(sum(customer_debit_microusd),0) from public.workspace_credit_reservations where cycle_id=c.id)),
 'purchased_this_cycle',jsonb_build_object('currency','USD','microusd',(select coalesce(sum(amount_microusd),0) from public.workspace_credit_lots where cycle_id=c.id and kind='purchased')),
 'upstream_exposure_this_cycle',jsonb_build_object('currency','USD','microusd',(select coalesce(sum(coalesce(actual_upstream_microusd,upstream_microusd)),0) from public.workspace_credit_reservations where owner_id=auth.uid() and (cycle_id=c.id or actual_upstream_microusd is null))),
 'lots',coalesce((select jsonb_agg(jsonb_build_object(
 'id',id,'kind',kind,'granted',jsonb_build_object('currency','USD','microusd',amount_microusd),
 'balance',jsonb_build_object('currency','USD','microusd',balance),'reserved',jsonb_build_object('currency','USD','microusd',held),
 'consumed',jsonb_build_object('currency','USD','microusd',consumed),
 'granted_at',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'expires_at',to_char(expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'stripe_source_id',case when payment_id like 'commercial-free:%' then null else payment_id end
 ) order by (kind='included') desc,expires_at,id) from projection),'[]'::jsonb)
) from cycle c
$$;
revoke all on function public.commercial_credit_wallet() from public,anon,service_role;
grant execute on function public.commercial_credit_wallet() to authenticated;
create or replace function public.workspace_credit_payment_command(p jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o uuid:=(p->>'owner_id')::uuid; cid uuid:=(p->>'command_id')::uuid; existing public.workspace_credit_payment_commands; pol jsonb:=public.commercial_policy(); plan jsonb;
begin
 perform 1 from public.profiles where id=o for update;
 if not found then raise exception 'owner_missing'; end if;
 select * into existing from public.workspace_credit_payment_commands where id=cid;
 if found then
  if existing.payload is distinct from p then raise exception 'payment_command_mismatch'; end if;
  return cid;
 end if;
 plan:=pol->'plans'->(p->>'commercial_plan');
 if (p ? 'pricing_version' or p ? 'commercial_plan') and (p->>'pricing_version' is distinct from pol->>'version' or coalesce(p->>'commercial_plan','') not in ('brand','studio')) then raise exception 'commercial_policy_denied'; end if;
 if not(p ?& array['owner_id','command_id','payment_id','customer_id','subscription_id','period_start','period_end','kind','amount_microusd','paid_microusd','policy_version','price_id','terms_version'])
 or p->>'policy_version' is distinct from 'P-01.v1'
 or coalesce(p->>'terms_version','')='' or coalesce(p->>'price_id','')=''
 or coalesce(p->>'payment_id','')='' or coalesce(p->>'customer_id','')=''
 or coalesce(p->>'subscription_id','')=''
 or (p->>'period_start')::bigint >= (p->>'period_end')::bigint
 or (p->>'paid_microusd')::public.workspace_microusd <= 0
 or not ((p->>'kind'='included' and (p->>'amount_microusd')::bigint=coalesce((plan->>'monthly_credits')::bigint*(1000000/(pol->>'credits_per_usd')::bigint),30000000) and (p->>'paid_microusd')::bigint=coalesce((plan->>'monthly_usd')::bigint*1000000,129000000))
 or (p->>'kind'='purchased' and (p->>'amount_microusd')::bigint between 10000000 and coalesce((plan->>'topup_cap_microusd')::bigint,70000000)
 and (p->>'amount_microusd')::bigint%10000000=0 and p->>'amount_microusd'=p->>'paid_microusd'))
 then raise exception 'invalid_payment_command'; end if;
 insert into public.workspace_credit_payment_commands(id,owner_id,payment_id,payload) values(cid,o,p->>'payment_id',p);
 return cid;
end $$;
create or replace function public.workspace_credit_payment_confirm(p jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.workspace_credit_payment_commands; lot uuid; o uuid;
begin
 select owner_id into o from public.workspace_credit_payment_commands where id=(p->>'command_id')::uuid;
 if o is null then raise exception 'payment_command_missing'; end if;
 perform 1 from public.profiles where id=o for update;
 select * into c from public.workspace_credit_payment_commands where id=(p->>'command_id')::uuid for update;
 if c.confirmation is not null then
  if c.confirmation is distinct from p then raise exception 'payment_mismatch'; end if;
  return c.lot_id;
 end if;
 if p->>'payment_id' is distinct from c.payment_id
 or p->>'customer_id' is distinct from c.payload->>'customer_id'
 or p->>'currency' is distinct from 'usd' or p->>'status' is distinct from 'succeeded'
 or p->>'price_id' is distinct from c.payload->>'price_id'
 or (p->>'paid_microusd')::bigint is distinct from (c.payload->>'paid_microusd')::bigint
 then raise exception 'payment_mismatch'; end if;
 lot:=public.workspace_credit_grant(jsonb_build_object(
 'owner_id',o,'event_id','workspace-payment:'||c.id::text,'payment_id',c.payment_id,
 'subscription_id',c.payload->>'subscription_id','customer_id',c.payload->>'customer_id',
 'period_start',c.payload->'period_start','period_end',c.payload->'period_end',
 'kind',c.payload->>'kind','amount_microusd',c.payload->'amount_microusd',
 'paid_microusd',c.payload->'paid_microusd','policy_version',c.payload->>'policy_version') || case when c.payload ? 'pricing_version' then jsonb_build_object('pricing_version',c.payload->>'pricing_version','commercial_plan',c.payload->>'commercial_plan') else '{}'::jsonb end);
 update public.workspace_credit_payment_commands set confirmation=p,lot_id=lot where id=c.id;
 return lot;
end $$;
revoke all on function public.workspace_credit_payment_command(jsonb),public.workspace_credit_payment_confirm(jsonb) from public,anon,authenticated;
grant execute on function public.workspace_credit_payment_command(jsonb),public.workspace_credit_payment_confirm(jsonb) to service_role;
commit;
