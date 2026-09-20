-- Additive, opt-in P01 accounting. Does not change legacy entitlements or profiles.
-- Service RPC arguments are a database adapter, not a second public wire catalog.
begin;
create domain public.workspace_microusd as bigint check(value between 0 and 9007199254740991);
create table public.workspace_credit_cycles (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id),
 subscription_id text not null, period_start timestamptz not null, period_end timestamptz not null,
 policy_version text not null check(policy_version='P-01.v1'), cancelled boolean not null default false,
 access_microusd public.workspace_microusd not null default 129000000 check(access_microusd=129000000),
 unique(owner_id,subscription_id,period_start,period_end), check(period_start<period_end)
);
create table public.workspace_credit_lots (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id),
 cycle_id uuid not null references public.workspace_credit_cycles(id), kind text not null check(kind in ('included','purchased')),
 amount_microusd public.workspace_microusd not null check(amount_microusd>0),
 expires_at timestamptz not null, event_id text not null unique, payment_id text not null unique,
 payload jsonb not null, created_at timestamptz not null default now()
);
create table public.workspace_credit_ledger (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id),
 lot_id uuid not null references public.workspace_credit_lots(id), operation_id text not null,
 kind text not null check(kind in ('grant','debit','refund_reserved')),
 amount_microusd public.workspace_microusd not null, created_at timestamptz not null default now(),
 unique(lot_id,operation_id,kind)
);
create function public.workspace_credit_immutable() returns trigger language plpgsql set search_path=pg_catalog as $$
begin raise exception 'append_only'; end $$;
create trigger immutable before update or delete on public.workspace_credit_lots for each row execute function public.workspace_credit_immutable();
create trigger immutable before update or delete on public.workspace_credit_ledger for each row execute function public.workspace_credit_immutable();
create function public.workspace_credit_grant(p jsonb) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare o uuid := (p->>'owner_id')::uuid; pr public.profiles; l public.workspace_credit_lots; c uuid;
 a public.workspace_microusd := (p->>'amount_microusd')::bigint; s timestamptz:=to_timestamp((p->>'period_start')::bigint); e timestamptz:=to_timestamp((p->>'period_end')::bigint);
begin
 select * into pr from public.profiles where id=o for update;
 if not found then raise exception 'owner_missing'; end if;
 select * into l from public.workspace_credit_lots where event_id=p->>'event_id' or payment_id=p->>'payment_id';
 if found then if l.payload is distinct from p then raise exception 'idempotency_mismatch'; end if; return l.id; end if;
 if not (p ?& array['owner_id','event_id','payment_id','subscription_id','customer_id','period_start','period_end','kind','amount_microusd','paid_microusd','policy_version']) or p->>'policy_version' is distinct from 'P-01.v1'
 or pr.stripe_subscription_id is distinct from p->>'subscription_id' or pr.stripe_customer_id is distinct from p->>'customer_id'
 or pr.subscription_status is distinct from 'active' or pr.current_period_start is distinct from s or pr.current_period_end is distinct from e
 or not (s<=clock_timestamp() and clock_timestamp()<e) or length(p->>'event_id')<5 or length(p->>'payment_id')<4 then raise exception 'payment_authority_denied'; end if;
 if exists(select 1 from public.workspace_credit_cycles where owner_id=o and subscription_id=p->>'subscription_id' and cancelled) then raise exception 'cancelled_subscription'; end if;
 if p->>'kind'='included' then
  if a is distinct from 30000000 or (p->>'paid_microusd')::bigint is distinct from 129000000 then raise exception 'invalid_paid_allowance'; end if;
  insert into public.workspace_credit_cycles(owner_id,subscription_id,period_start,period_end,policy_version) values(o,p->>'subscription_id',s,e,'P-01.v1') on conflict do nothing;
 end if;
 select id into c from public.workspace_credit_cycles where owner_id=o and subscription_id=p->>'subscription_id' and period_start=s and period_end=e and not cancelled;
 if c is null then raise exception 'cycle_missing_or_cancelled'; end if;
 if p->>'kind'='included' then
  if exists(select 1 from public.workspace_credit_lots where cycle_id=c and kind='included') then raise exception 'cycle_already_granted'; end if;
 elsif p->>'kind'='purchased' then
  if a is null or a<=0 or a%10000000<>0 or a>70000000 or (p->>'paid_microusd')::bigint is distinct from a
  or a+(select coalesce(sum(amount_microusd),0) from public.workspace_credit_lots where cycle_id=c and kind='purchased')>70000000 then raise exception 'topup_cap'; end if;
 else raise exception 'invalid_kind'; end if;
 insert into public.workspace_credit_lots(owner_id,cycle_id,kind,amount_microusd,expires_at,event_id,payment_id,payload)
 values(o,c,p->>'kind',a,case when p->>'kind'='included' then e else clock_timestamp()+interval '12 months' end,p->>'event_id',p->>'payment_id',p) returning * into l;
 insert into public.workspace_credit_ledger(owner_id,lot_id,operation_id,kind,amount_microusd) values(o,l.id,p->>'event_id','grant',a);
 return l.id;
end $$;
do $$ declare t text; begin
 foreach t in array array['workspace_credit_cycles','workspace_credit_lots','workspace_credit_ledger'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 execute format('grant select on public.%I to authenticated,service_role',t);
 execute format('create policy owner_read on public.%I for select to authenticated using(owner_id=(select auth.uid()))',t);
 end loop;
end $$;
revoke all on function public.workspace_credit_immutable() from public,anon,authenticated,service_role;
revoke all on function public.workspace_credit_grant(jsonb) from public,anon,authenticated;
grant execute on function public.workspace_credit_grant(jsonb) to service_role;
create table public.workspace_credit_reservations (
 id uuid primary key, owner_id uuid not null references public.profiles(id), subject_id uuid not null references public.subjects(id),
 cycle_id uuid not null references public.workspace_credit_cycles(id), intent jsonb not null,
 retail_microusd public.workspace_microusd not null check(retail_microusd between 1 and 15000000),
 upstream_microusd public.workspace_microusd not null check(upstream_microusd between 1 and 60000000),
 customer_debit_microusd public.workspace_microusd not null default 0,
 actual_upstream_microusd public.workspace_microusd,
 state text not null default 'held' check(state in ('held','settled','released')),
 terminal_payload jsonb, reconciliation_payload jsonb, created_at timestamptz not null default now(),
 check(customer_debit_microusd<=retail_microusd), check(actual_upstream_microusd<=upstream_microusd)
);
create unique index workspace_credit_run_intent_once on public.workspace_credit_reservations(owner_id,((intent->>'run_intent_id')));
create index workspace_credit_reservations_owner on public.workspace_credit_reservations(owner_id,cycle_id);
create index workspace_credit_ledger_lot on public.workspace_credit_ledger(lot_id);
create index workspace_credit_lots_owner on public.workspace_credit_lots(owner_id,expires_at);
create table public.workspace_credit_allocations (
 reservation_id uuid not null references public.workspace_credit_reservations(id),
 owner_id uuid not null references public.profiles(id), lot_id uuid not null references public.workspace_credit_lots(id),
 amount_microusd public.workspace_microusd not null, ordinal integer not null,
 primary key(reservation_id,lot_id), unique(reservation_id,ordinal)
);
create trigger immutable before update or delete on public.workspace_credit_allocations for each row execute function public.workspace_credit_immutable();
create function public.workspace_credit_reserve(p jsonb) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare o uuid:=(p->>'owner_id')::uuid; rid uuid:=(p->>'reservation_id')::uuid; pr public.profiles; c public.workspace_credit_cycles;
 r public.workspace_credit_reservations; l record; a public.workspace_microusd:=(p->>'retail_microusd')::bigint;
 up public.workspace_microusd:=(p->>'upstream_microusd')::bigint; remaining bigint:=a; take bigint; n integer:=0;
begin
 select * into pr from public.profiles where id=o for update;
 if not found then raise exception 'owner_missing'; end if;
 select * into r from public.workspace_credit_reservations where id=rid;
 if found then
  if r.intent is distinct from p then raise exception 'idempotency_mismatch'; end if;
  if r.state<>'held' then raise exception 'reservation_terminal'; end if;
  if coalesce((p->>'quote_expires_at')::timestamptz,'-infinity'::timestamptz)<=clock_timestamp() then raise exception 'quote_expired'; end if;
  if pr.subscription_status is distinct from 'active' or not exists(select 1 from public.workspace_credit_cycles cy where cy.id=r.cycle_id and not cy.cancelled
   and cy.subscription_id=pr.stripe_subscription_id and cy.period_start=pr.current_period_start and cy.period_end=pr.current_period_end
   and cy.period_start<=clock_timestamp() and clock_timestamp()<cy.period_end)
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
 select * into c from public.workspace_credit_cycles where owner_id=o and subscription_id=pr.stripe_subscription_id
 and period_start=pr.current_period_start and period_end=pr.current_period_end and period_start<=clock_timestamp() and clock_timestamp()<period_end and not cancelled;
 if not found or pr.subscription_status is distinct from 'active' then raise exception 'inactive_cycle'; end if;
 if exists(select 1 from public.workspace_credit_reservations where owner_id=o and state='held') then raise exception 'owner_concurrency'; end if;
 if a+(select coalesce(sum(case when state='held' then retail_microusd else customer_debit_microusd end),0) from public.workspace_credit_reservations where cycle_id=c.id)>100000000 then raise exception 'consumption_cap'; end if;
 -- Unresolved exposure from OLD cycles also blocks capacity; no rollover escape.
 if up+(select coalesce(sum(coalesce(actual_upstream_microusd,upstream_microusd)),0) from public.workspace_credit_reservations where owner_id=o and (cycle_id=c.id or actual_upstream_microusd is null))>60000000 then raise exception 'upstream_cap'; end if;
 insert into public.workspace_credit_reservations(id,owner_id,subject_id,cycle_id,intent,retail_microusd,upstream_microusd) values(rid,o,(p->>'subject_id')::uuid,c.id,p,a,up);
 for l in select lot.*,lot.amount_microusd-coalesce((select sum(d.amount_microusd) from public.workspace_credit_ledger d where d.lot_id=lot.id and d.kind in ('debit','refund_reserved')),0) as available
 from public.workspace_credit_lots lot where lot.owner_id=o and lot.expires_at>clock_timestamp() order by (lot.kind='included') desc,lot.expires_at,lot.id loop
  take:=least(remaining,l.available);
  if take>0 then
   n:=n+1; insert into public.workspace_credit_allocations values(rid,o,l.id,take,n); remaining:=remaining-take;
  end if;
  exit when remaining=0;
 end loop;
 if remaining<>0 then raise exception 'insufficient_credit'; end if;
 return rid;
end $$;
do $$ declare t text; begin
 foreach t in array array['workspace_credit_reservations','workspace_credit_allocations'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 execute format('grant select on public.%I to authenticated,service_role',t);
 execute format('create policy owner_read on public.%I for select to authenticated using(owner_id=(select auth.uid()))',t);
 end loop;
end $$;
revoke all on function public.workspace_credit_reserve(jsonb) from public,anon,authenticated;
grant execute on function public.workspace_credit_reserve(jsonb) to service_role;
-- One immutable terminal customer outcome. NULL actual cost retains full upstream hold.
create function public.workspace_credit_finish(p jsonb) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare o uuid:=(p->>'owner_id')::uuid; rid uuid:=(p->>'reservation_id')::uuid; r public.workspace_credit_reservations;
 d public.workspace_microusd:=(p->>'customer_debit_microusd')::bigint; up public.workspace_microusd:=(p->>'actual_upstream_microusd')::bigint;
 remaining bigint:=d; a record; take bigint;
begin
 perform 1 from public.profiles where id=o for update;
 select * into r from public.workspace_credit_reservations where id=rid and owner_id=o for update;
 if not found then raise exception 'reservation_missing'; end if;
 if r.state<>'held' then
  if r.terminal_payload is distinct from p then raise exception 'terminal_mismatch'; end if;
  return rid;
 end if;
 if not(p ?& array['owner_id','reservation_id','outcome','customer_debit_microusd','actual_upstream_microusd','receipt_id'])
 or d is null or d>r.retail_microusd or up>r.upstream_microusd or coalesce(p->>'receipt_id','')=''
 or coalesce(p->>'outcome','') not in ('success','failure','released')
 or (p->>'outcome'<>'success' and d<>0)
 or (p->>'outcome'='success' and coalesce(p->>'successful_path_id','')='') then raise exception 'invalid_receipt_or_overspend'; end if;
 for a in select * from public.workspace_credit_allocations where reservation_id=rid order by ordinal loop
  take:=least(remaining,a.amount_microusd);
  if take>0 then insert into public.workspace_credit_ledger(owner_id,lot_id,operation_id,kind,amount_microusd) values(o,a.lot_id,rid::text,'debit',take); remaining:=remaining-take; end if;
 end loop;
 if remaining<>0 then raise exception 'allocation_shortfall'; end if;
 update public.workspace_credit_reservations set state=case when p->>'outcome'='success' then 'settled' else 'released' end,
 customer_debit_microusd=d,actual_upstream_microusd=up,terminal_payload=p where id=rid;
 return rid;
end $$;
revoke all on function public.workspace_credit_finish(jsonb) from public,anon,authenticated;
grant execute on function public.workspace_credit_finish(jsonb) to service_role;
create function public.workspace_credit_reconcile(p jsonb) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare o uuid:=(p->>'owner_id')::uuid; rid uuid:=(p->>'reservation_id')::uuid; r public.workspace_credit_reservations;
 up public.workspace_microusd:=(p->>'actual_upstream_microusd')::bigint;
begin
 perform 1 from public.profiles where id=o for update;
 select * into r from public.workspace_credit_reservations where id=rid and owner_id=o for update;
 if not found then raise exception 'reservation_missing'; end if;
 if r.reconciliation_payload is not null then
  if r.reconciliation_payload is distinct from p then raise exception 'reconciliation_mismatch'; end if; return rid;
 end if;
 if r.state='held' or r.actual_upstream_microusd is not null or up is null or up>r.upstream_microusd or coalesce(p->>'receipt_id','')='' then raise exception 'invalid_reconciliation'; end if;
 update public.workspace_credit_reservations set actual_upstream_microusd=up,reconciliation_payload=p where id=rid;
 return rid;
end $$;
revoke all on function public.workspace_credit_reconcile(jsonb) from public,anon,authenticated;
grant execute on function public.workspace_credit_reconcile(jsonb) to service_role;
-- Frozen refund liability. Provider cash movement is a separate reconciliation job.
create table public.workspace_credit_refunds (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id),
 request_id text not null unique, payload jsonb not null, amount_microusd public.workspace_microusd not null,
 created_at timestamptz not null default now()
);
create trigger immutable before update or delete on public.workspace_credit_refunds for each row execute function public.workspace_credit_immutable();
alter table public.workspace_credit_refunds enable row level security;
revoke all on public.workspace_credit_refunds from public,anon,authenticated,service_role;
grant select on public.workspace_credit_refunds to authenticated,service_role;
create policy owner_read on public.workspace_credit_refunds for select to authenticated using(owner_id=(select auth.uid()));
create function public.workspace_credit_refund_reserve(p jsonb) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare o uuid:=(p->>'owner_id')::uuid; r public.workspace_credit_refunds; l record; total bigint:=0; rid uuid:=gen_random_uuid();
begin
 perform 1 from public.profiles where id=o for update;
 if not found then raise exception 'owner_missing'; end if;
 select * into r from public.workspace_credit_refunds where request_id=p->>'request_id';
 if found then if r.payload is distinct from p then raise exception 'refund_mismatch'; end if; return r.id; end if;
 if coalesce(p->>'request_id','')='' or not exists(select 1 from public.workspace_credit_cycles where owner_id=o and subscription_id=p->>'subscription_id') then raise exception 'refund_authority'; end if;
 -- Do not refund lots currently pledged to a running job. Their remainder can be
 -- frozen in a subsequent uniquely keyed request after that job terminates.
 for l in select lot.id,lot.amount_microusd
 -coalesce((select sum(d.amount_microusd) from public.workspace_credit_ledger d where d.lot_id=lot.id and d.kind in ('debit','refund_reserved')),0)
 -coalesce((select sum(a.amount_microusd) from public.workspace_credit_allocations a join public.workspace_credit_reservations held_run on held_run.id=a.reservation_id where a.lot_id=lot.id and held_run.state='held'),0) as available
 from public.workspace_credit_lots lot join public.workspace_credit_cycles c on c.id=lot.cycle_id where lot.owner_id=o and lot.kind='purchased' and c.subscription_id=p->>'subscription_id' loop
  if l.available>0 then
   insert into public.workspace_credit_ledger(owner_id,lot_id,operation_id,kind,amount_microusd) values(o,l.id,rid::text,'refund_reserved',l.available);
   total:=total+l.available;
  end if;
 end loop;
 insert into public.workspace_credit_refunds(id,owner_id,request_id,payload,amount_microusd) values(rid,o,p->>'request_id',p,total);
 return rid;
end $$;
create function public.workspace_credit_cancel(p jsonb) returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare o uuid:=(p->>'owner_id')::uuid;
begin
 perform 1 from public.profiles where id=o for update;
 if not found or not exists(select 1 from public.workspace_credit_cycles where owner_id=o and subscription_id=p->>'subscription_id') then raise exception 'cancel_authority'; end if;
 update public.workspace_credit_cycles set cancelled=true where owner_id=o and subscription_id=p->>'subscription_id';
 return p->>'subscription_id';
end $$;
revoke all on function public.workspace_credit_refund_reserve(jsonb),public.workspace_credit_cancel(jsonb) from public,anon,authenticated;
grant execute on function public.workspace_credit_refund_reserve(jsonb),public.workspace_credit_cancel(jsonb) to service_role;
commit;
