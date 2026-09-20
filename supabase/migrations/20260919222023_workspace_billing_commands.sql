-- Owner-session projection. Reads cannot grant, reserve, dispatch or settle.
begin;
create function public.workspace_credit_wallet() returns jsonb
language sql stable security invoker set search_path=pg_catalog,public as $$
with cycle as (
 select c.* from public.workspace_credit_cycles c
 where c.owner_id=auth.uid() order by c.period_end desc,c.period_start desc,c.id limit 1
), lots as (
 select l.*,coalesce((select sum(d.amount_microusd) from public.workspace_credit_ledger d where d.lot_id=l.id and d.kind='debit'),0)::bigint consumed,
 coalesce((select sum(d.amount_microusd) from public.workspace_credit_ledger d where d.lot_id=l.id and d.kind='refund_reserved'),0)::bigint refunded,
 coalesce((select sum(a.amount_microusd) from public.workspace_credit_allocations a join public.workspace_credit_reservations r on r.id=a.reservation_id where a.lot_id=l.id and r.state='held'),0)::bigint held
 from public.workspace_credit_lots l where l.owner_id=auth.uid() and l.expires_at>now()
), projection as (
 select *,amount_microusd-consumed-refunded balance from lots
)
select jsonb_build_object(
 'owner_id',c.owner_id,'policy_version',c.policy_version,'currency','USD',
 'stripe_subscription_id',c.subscription_id,
 'stripe_period_start',to_char(c.period_start at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'stripe_period_end',to_char(c.period_end at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
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
 'expires_at',to_char(expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'stripe_source_id',payment_id
 ) order by (kind='included') desc,expires_at,id) from projection),'[]'::jsonb)
) from cycle c
$$;
revoke all on function public.workspace_credit_wallet() from public,anon,service_role;
grant execute on function public.workspace_credit_wallet() to authenticated;
-- A server-recorded, explicit purchase contract, bound to a provider object.
-- Only trusted checkout/reconciliation composition can create one. No public opt-in
-- RPC is exposed until published terms and separate Stripe authority are ready.
create table public.workspace_credit_payment_commands (
 id uuid primary key, owner_id uuid not null references public.profiles(id),
 payment_id text not null unique, payload jsonb not null,
 confirmation jsonb, lot_id uuid references public.workspace_credit_lots(id),
 created_at timestamptz not null default now()
);
alter table public.workspace_credit_payment_commands enable row level security;
revoke all on public.workspace_credit_payment_commands from public,anon,authenticated,service_role;
grant select on public.workspace_credit_payment_commands to service_role;
create function public.workspace_credit_payment_command(p jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o uuid:=(p->>'owner_id')::uuid; cid uuid:=(p->>'command_id')::uuid; existing public.workspace_credit_payment_commands;
begin
 perform 1 from public.profiles where id=o for update;
 if not found then raise exception 'owner_missing'; end if;
 select * into existing from public.workspace_credit_payment_commands where id=cid;
 if found then
  if existing.payload is distinct from p then raise exception 'payment_command_mismatch'; end if;
  return cid;
 end if;
 if not(p ?& array['owner_id','command_id','payment_id','customer_id','subscription_id','period_start','period_end','kind','amount_microusd','paid_microusd','policy_version','price_id','terms_version'])
 or p->>'policy_version' is distinct from 'P-01.v1'
 or coalesce(p->>'terms_version','')='' or coalesce(p->>'price_id','')=''
 or coalesce(p->>'payment_id','')='' or coalesce(p->>'customer_id','')=''
 or coalesce(p->>'subscription_id','')=''
 or (p->>'period_start')::bigint >= (p->>'period_end')::bigint
 or (p->>'paid_microusd')::public.workspace_microusd <= 0
 or not ((p->>'kind'='included' and (p->>'amount_microusd')::bigint=30000000 and (p->>'paid_microusd')::bigint=129000000)
 or (p->>'kind'='purchased' and (p->>'amount_microusd')::bigint between 10000000 and 70000000
 and (p->>'amount_microusd')::bigint%10000000=0 and p->>'amount_microusd'=p->>'paid_microusd'))
 then raise exception 'invalid_payment_command'; end if;
 insert into public.workspace_credit_payment_commands(id,owner_id,payment_id,payload) values(cid,o,p->>'payment_id',p);
 return cid;
end $$;
create function public.workspace_credit_payment_confirm(p jsonb) returns uuid
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
 'paid_microusd',c.payload->'paid_microusd','policy_version',c.payload->>'policy_version'));
 update public.workspace_credit_payment_commands set confirmation=p,lot_id=lot where id=c.id;
 return lot;
end $$;
revoke all on function public.workspace_credit_payment_command(jsonb),public.workspace_credit_payment_confirm(jsonb) from public,anon,authenticated;
grant execute on function public.workspace_credit_payment_command(jsonb),public.workspace_credit_payment_confirm(jsonb) to service_role;
-- Provider cash execution for a frozen refund or a confirmed cancellation.
-- Recording a provider fact does not unfreeze liability and never mints credit:
-- a failed provider refund leaves the customer's frozen amount unavailable, and a
-- partial provider refund is refused for manual reconciliation rather than
-- silently writing off the remainder.
create table public.workspace_credit_provider_actions (
 id uuid primary key, owner_id uuid not null references public.profiles(id),
 kind text not null check(kind in ('refund','cancellation')), subject_id text not null,
 idempotency_key text not null unique, provider_object_id text,
 amount_microusd public.workspace_microusd,
 status text not null check(status in ('pending','succeeded','failed')),
 payload jsonb not null, created_at timestamptz not null default now(),
 unique(owner_id,kind,subject_id,idempotency_key)
);
alter table public.workspace_credit_provider_actions enable row level security;
revoke all on public.workspace_credit_provider_actions from public,anon,authenticated,service_role;
grant select on public.workspace_credit_provider_actions to service_role;
create function public.workspace_credit_provider_action(p jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o uuid:=(p->>'owner_id')::uuid; aid uuid:=(p->>'action_id')::uuid; k text:=p->>'kind'; sid text:=p->>'subject_id';
 idem text:=p->>'idempotency_key'; st text:=p->>'status'; po text:=p->>'provider_object_id'; amt bigint:=(p->>'amount_microusd')::bigint;
 expected bigint; e public.workspace_credit_provider_actions;
begin
 perform 1 from public.profiles where id=o for update;
 if not found then raise exception 'owner_missing'; end if;
 if not(p ?& array['owner_id','action_id','kind','subject_id','idempotency_key','status','provider_object_id','amount_microusd'])
 or coalesce(idem,'')='' or coalesce(sid,'')='' or k not in ('refund','cancellation') or st not in ('pending','succeeded','failed') then raise exception 'invalid_provider_action'; end if;
 if k='refund' then
  select amount_microusd into expected from public.workspace_credit_refunds where id=sid::uuid and owner_id=o;
  if expected is null then raise exception 'provider_action_authority'; end if;
  if amt is not null and amt<>expected then raise exception 'partial_provider_refund'; end if;
 elsif not exists(select 1 from public.workspace_credit_cycles where owner_id=o and subscription_id=sid) then raise exception 'provider_action_authority'; end if;
 if k='cancellation' and amt is not null then raise exception 'provider_action_mismatch'; end if;
 if st='succeeded' and coalesce(po,'')='' then raise exception 'provider_action_receipt_required'; end if;
 if st='failed' and amt is not null then raise exception 'provider_action_mismatch'; end if;
 select * into e from public.workspace_credit_provider_actions where id=aid for update;
 if found then
  if e.payload is not distinct from p then return e.id; end if;
  -- One reconciliation step may resolve a previously ambiguous provider call.
  if e.status='pending' and st in ('succeeded','failed') and e.kind=k and e.subject_id=sid
  and e.idempotency_key=idem and (e.amount_microusd is null or e.amount_microusd is not distinct from amt) then
   update public.workspace_credit_provider_actions set status=st,provider_object_id=po,payload=p where id=aid;
   return aid;
  end if;
  raise exception 'provider_action_mismatch';
 end if;
 insert into public.workspace_credit_provider_actions(id,owner_id,kind,subject_id,idempotency_key,provider_object_id,amount_microusd,status,payload)
 values(aid,o,k,sid,idem,po,amt,st,p);
 return aid;
end $$;
revoke all on function public.workspace_credit_provider_action(jsonb) from public,anon,authenticated;
grant execute on function public.workspace_credit_provider_action(jsonb) to service_role;
commit;
