-- CR-2: bounded monetary replay; retain ordered lifecycle and worker fences.
begin;
create or replace function public.commercial_subscription_apply(p jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare pr public.profiles; c public.commercial_checkouts; result jsonb;
begin
 select * into pr from public.profiles where id=(p->>'owner_id')::uuid for update;
 if not found then raise exception 'owner_missing'; end if;
 if coalesce(p->>'plan','') not in ('brand','studio') then raise exception 'invalid_plan'; end if;
 select * into c from public.commercial_checkouts where id=(p->>'checkout_id')::uuid and owner_id=pr.id and plan=p->>'plan';
 if not found or c.state='expired' then raise exception 'checkout_authority_required'; end if;
 if p->>'event_type'='checkout.session.completed' then
  perform public.commercial_checkout_bind(jsonb_build_object('owner_id',pr.id,'id',c.id,'session_id',p->>'session_id'));
 elsif c.state<>'completed' or pr.stripe_subscription_id is distinct from p->>'subscription_id' then
  return jsonb_build_object('applied',false,'code','awaiting_checkout');
 end if;
 if pr.subscription_status in ('manual_enterprise','complimentary') or pr.plan<>'free' then raise exception 'existing_contract_preserved'; end if;
 result:=public.reconcile_stripe_subscription(p->>'event_id',p->>'event_type',(p->>'event_created')::bigint,p->>'subscription_id',p->>'customer_id',pr.id,p->>'status',case when p->>'status'='canceled' then 'free' else p->>'plan' end,(p->>'period_start')::bigint,(p->>'period_end')::bigint,p->>'digest');
 if (result->>'applied')::boolean then
  update public.commercial_checkouts set state='completed' where id=c.id;
 end if;
 -- Money need not win the lifecycle reducer. Only a stale invoice whose
 -- entire authority still equals the locked current profile may reconcile.
 -- No projection/receipt is written here; payment confirmation independently
 -- checks immutable invoice facts and current authority before minting a lot.
 if p->>'event_type'='invoice.paid' and result->>'code'='stale'
    and c.state='completed' and p->>'status'='active'
    and pr.subscription_status='active' and pr.plan='free'
    and pr.commercial_plan=p->>'plan'
    and pr.stripe_customer_id=p->>'customer_id'
    and pr.stripe_subscription_id=p->>'subscription_id'
    and pr.current_period_start=to_timestamp((p->>'period_start')::bigint)
    and pr.current_period_end=to_timestamp((p->>'period_end')::bigint) then
  return jsonb_build_object('applied',false,'code','current_authority');
 end if;
 return result;
end $$;
create or replace function public.reconcile_stripe_subscription(
  p_event_id text,
  p_event_type text,
  p_event_created bigint,
  p_subscription_id text,
  p_customer_id text,
  p_profile_id uuid,
  p_status text,
  p_plan text,
  p_current_period_start_epoch bigint,
  p_current_period_end_epoch bigint,
  p_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_profile_id uuid;
  v_last_event_id text;
  v_last_created bigint;
  v_last_plan text;
  v_last_status text;
  v_last_period bigint;
  v_last_start bigint;
  v_updated int;
begin
  -- 1. Validate the typed command before any read or write. Bounded inputs
  --    only: the reducer has already resolved the plan from a supported price
  --    id and computed the digest; the RPC re-validates every allowlist and
  --    rejects nulls explicitly (SQL `not in` with null is not false).
  if p_event_id is null or p_event_id = '' then
    return jsonb_build_object('applied', false, 'code', 'malformed_event', 'message', 'Event id is required.');
  end if;
  if p_event_created is null or p_event_created <= 0 then
    return jsonb_build_object('applied', false, 'code', 'malformed_event', 'message', 'Event created time is required.');
  end if;
  if p_event_type is null or p_event_type not in (
    'checkout.session.completed',
    'invoice.paid',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted'
  ) then
    return jsonb_build_object(
      'applied', false,
      'code', 'unsupported_event_type',
      'event_id', p_event_id,
      'event_type', p_event_type
    );
  end if;
  if p_status is null then
    return jsonb_build_object('applied', false, 'code', 'malformed_status', 'event_id', p_event_id);
  end if;
  if p_status not in ('active', 'trialing', 'canceled') then
    return jsonb_build_object(
      'applied', false,
      'code', 'unsupported_status',
      'event_id', p_event_id,
      'status', p_status
    );
  end if;
  if p_plan is null then
    return jsonb_build_object('applied', false, 'code', 'malformed_plan', 'event_id', p_event_id);
  end if;
  if p_plan not in ('free', 'starter', 'pro', 'enterprise', 'brand', 'studio') then
    return jsonb_build_object(
      'applied', false,
      'code', 'unsupported_plan',
      'event_id', p_event_id,
      'plan', p_plan
    );
  end if;
  if p_subscription_id is null or p_subscription_id = '' or p_customer_id is null or p_customer_id = '' then
    return jsonb_build_object('applied', false, 'code', 'malformed_identity', 'event_id', p_event_id);
  end if;
  if length(coalesce(p_digest, '')) <> 64 then
    return jsonb_build_object('applied', false, 'code', 'invalid_digest', 'event_id', p_event_id);
  end if;

  if p_status in ('active', 'trialing') and (
    p_current_period_start_epoch is null or p_current_period_end_epoch is null
    or p_current_period_start_epoch <= 0 or p_current_period_end_epoch <= p_current_period_start_epoch
  ) then
    return jsonb_build_object('applied', false, 'code', 'malformed_period');
  end if;

  -- 2. Idempotency: an event identity is recorded at most once.
  if exists (
    select 1 from public.provider_event_receipts
    where provider = 'stripe' and provider_event_id = p_event_id
  ) then
    return jsonb_build_object('applied', false, 'code', 'duplicate', 'event_id', p_event_id);
  end if;

  -- 3. Resolve and lock the matching profile. The profile hint wins; the
  --    customer linkage is the fallback. The row lock serializes concurrent
  --    deliveries so ordering and write decisions cannot race.
  if p_profile_id is not null then
    select * into v_profile
    from public.profiles
    where id = p_profile_id
    for update;
    if not found then
      return jsonb_build_object(
        'applied', false,
        'code', 'profile_not_found',
        'event_id', p_event_id,
        'profile_id', p_profile_id
      );
    end if;
    if v_profile.stripe_customer_id is not null and v_profile.stripe_customer_id <> p_customer_id then
      return jsonb_build_object(
        'applied', false,
        'code', 'profile_customer_mismatch',
        'event_id', p_event_id,
        'profile_id', p_profile_id
      );
    end if;
  else
    select * into v_profile
    from public.profiles
    where stripe_customer_id = p_customer_id
    for update;
    if not found then
      return jsonb_build_object(
        'applied', false,
        'code', 'profile_not_found',
        'event_id', p_event_id,
        'customer_id', p_customer_id
      );
    end if;
  end if;
  v_profile_id := v_profile.id;

  -- CR-3: a second checkout is not a subscription replacement protocol.
  -- Keep same-subscription commercial updates/deletion and all legacy lifecycle.
  if v_profile.commercial_plan is not null
     and v_profile.subscription_status in ('active','trialing')
     and (v_profile.stripe_subscription_id is distinct from p_subscription_id
          or (p_plan not in ('brand','studio') and p_status <> 'canceled')) then
    return jsonb_build_object('applied',false,'code','existing_contract_preserved');
  end if;

  -- 4. Deterministic ordering: compare the incoming (created, event id)
  --    tuple against the latest receipt recorded for this subscription.
  select provider_event_id, provider_created_epoch, plan, subscription_status, current_period_start_epoch, current_period_end_epoch
    into v_last_event_id, v_last_created, v_last_plan, v_last_status, v_last_start, v_last_period
  from public.provider_event_receipts
  where provider = 'stripe' and subscription_id = p_subscription_id
  order by provider_created_epoch desc, provider_event_id desc
  limit 1;

  if v_last_event_id is not null then
    if (p_event_created, p_event_id) < (v_last_created, v_last_event_id) then
      return jsonb_build_object(
        'applied', false,
        'code', 'stale',
        'event_id', p_event_id,
        'last_event_id', v_last_event_id,
        'event_created', p_event_created,
        'last_created', v_last_created
      );
    end if;
    if p_event_created = v_last_created then
      -- Equal-time event: the same command value is an idempotent replay; a
      -- different value is an ordering contradiction. Both fail closed.
      if p_plan = v_last_plan
         and p_status = v_last_status
         and p_current_period_start_epoch is not distinct from v_last_start
         and coalesce(p_current_period_end_epoch, 0) = coalesce(v_last_period, 0) then
        return jsonb_build_object('applied', false, 'code', 'replay', 'event_id', p_event_id);
      end if;
      return jsonb_build_object(
        'applied', false,
        'code', 'equal_time_conflict',
        'event_id', p_event_id,
        'event_created', p_event_created
      );
    end if;
  end if;

  -- 5. Founder/manual access precedence: never overwrite manual_enterprise or
  --    complimentary access with a Stripe projection. The receipt records what
  --    Stripe claimed; the projection is preserved.
  if v_profile.subscription_status in ('manual_enterprise', 'complimentary') then
    insert into public.provider_event_receipts (
      provider, provider_event_id, provider_created_epoch, subscription_id,
      customer_id, profile_id, command_type, plan, subscription_status,
      current_period_start_epoch, current_period_end_epoch, digest, applied, outcome_code
    ) values (
      'stripe', p_event_id, p_event_created, p_subscription_id,
      p_customer_id, v_profile_id,
      case when p_status in ('active', 'trialing') then 'plan_grant' else 'plan_revoke' end,
      p_plan, p_status, p_current_period_start_epoch, p_current_period_end_epoch, p_digest, false, 'manual_precedence'
    );
    return jsonb_build_object(
      'applied', false,
      'code', 'manual_precedence',
      'event_id', p_event_id,
      'profile_id', v_profile_id
    );
  end if;

  -- commercial_subscription_authority_guard_v1
  -- Compare PROFILE-wide applied authority while holding its row lock. A first
  -- event for another subscription must not escape ordering through an empty
  -- per-subscription receipt stream. Equal timestamps cannot authorize adoption.
  select max(provider_created_epoch) into v_last_created
  from public.provider_event_receipts
  where provider = 'stripe' and profile_id = v_profile_id and applied;
  if v_last_created is not null and p_event_created <= v_last_created then
    return jsonb_build_object('applied', false, 'code', 'profile_event_not_newer');
  end if;

  if v_profile.stripe_subscription_id is not null
     and v_profile.stripe_subscription_id <> p_subscription_id then
    -- Deliberate adoption authority: a signed, owner-bound completed checkout
    -- whose subscription was fetched by the service-role webhook, not an
    -- unrelated subscription lifecycle event on the same customer. Require a
    -- non-regressing provider period and never resurrect a retired authority.
    -- Active legacy missing starts need guarded backfill before adoption.
    -- A canceled/free legacy profile has no paid authority to revoke and may
    -- adopt without an old window (active-only backfill cannot repair it).
    if p_event_type <> 'checkout.session.completed'
       or p_profile_id is distinct from v_profile_id
       or v_profile.stripe_customer_id is distinct from p_customer_id
       or p_status not in ('active', 'trialing')
       or p_plan not in ('starter', 'pro', 'enterprise', 'brand', 'studio')
       or (v_profile.current_period_start is null
           and (v_profile.subscription_status is distinct from 'canceled'
                or v_profile.plan is distinct from 'free'))
       or to_timestamp(p_current_period_start_epoch) < v_profile.current_period_start
       or p_event_created < p_current_period_start_epoch
       or exists (
         select 1 from public.provider_event_receipts
         where provider = 'stripe' and profile_id = v_profile_id
           and subscription_id = p_subscription_id and applied
       ) then
      return jsonb_build_object('applied', false, 'code', 'subscription_adoption_requires_review');
    end if;
  end if;

  -- 6. Apply: exactly one receipt insert plus at most one profile transition,
  --    in the same transaction. A failed transition raises and rolls back the
  --    receipt insert with it — never a split write.
  insert into public.provider_event_receipts (
    provider, provider_event_id, provider_created_epoch, subscription_id,
    customer_id, profile_id, command_type, plan, subscription_status,
    current_period_start_epoch, current_period_end_epoch, digest, applied, outcome_code
  ) values (
    'stripe', p_event_id, p_event_created, p_subscription_id,
    p_customer_id, v_profile_id,
    case when p_status in ('active', 'trialing') then 'plan_grant' else 'plan_revoke' end,
    p_plan, p_status, p_current_period_start_epoch, p_current_period_end_epoch, p_digest, true, 'applied'
  );

  update public.profiles
  set plan = case when p_plan in ('brand','studio') then v_profile.plan else p_plan end,
      commercial_plan = case when p_plan in ('brand','studio') then p_plan else null end,
      subscription_status = p_status,
      stripe_customer_id = p_customer_id,
      stripe_subscription_id = p_subscription_id,
      current_period_start = to_timestamp(p_current_period_start_epoch),
      current_period_end = case
        when p_current_period_end_epoch is null then null
        else to_timestamp(p_current_period_end_epoch)
      end,
      onboarding_status = case
        when p_status in ('active', 'trialing') then 'paid'
        else p_status
      end
  where id = v_profile_id;

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'profile_transition_failed' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'applied', true,
    'code', 'ok',
    'event_id', p_event_id,
    'profile_id', v_profile_id,
    'plan', p_plan,
    'status', p_status
  );
end;
$$;


revoke all on function public.reconcile_stripe_subscription(text,text,bigint,text,text,uuid,text,text,bigint,bigint,text) from public, anon, authenticated;
grant execute on function public.reconcile_stripe_subscription(text,text,bigint,text,text,uuid,text,text,bigint,bigint,text) to service_role;

-- All new purchase paths share the existing owner lock and pending index.
alter table public.commercial_checkouts drop constraint commercial_checkouts_plan_check;
alter table public.commercial_checkouts add constraint commercial_checkouts_plan_check check(plan in ('brand','studio','starter','pro'));
create or replace function public.commercial_checkout_reserve(p jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare pr public.profiles; c public.commercial_checkouts;
begin
 select * into pr from public.profiles where id=(p->>'owner_id')::uuid for update;
 if not found then raise exception 'owner_missing'; end if;
 if not exists(select 1 from auth.users where id=pr.id and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then raise exception 'verified_identity_required'; end if;
 if pr.plan<>'free' or pr.subscription_status in ('manual_enterprise','complimentary','active','trialing') or pr.commercial_plan is not null
 or (pr.stripe_subscription_id is not null and pr.subscription_status is distinct from 'canceled')
 or exists(select 1 from public.workspace_credit_cycles where owner_id=pr.id and commercial_plan is distinct from 'free') then raise exception 'existing_contract_preserved'; end if;
 if coalesce(p->>'plan','') not in ('brand','studio','starter','pro') then raise exception 'invalid_plan'; end if;
 select * into c from public.commercial_checkouts where owner_id=pr.id and state='pending';
 if found then
  if c.plan<>p->>'plan' then raise exception 'pending_plan_conflict'; end if;
  if c.session_id is null and c.created_at<clock_timestamp()-interval '23 hours' then raise exception 'checkout_requires_reconciliation'; end if;
 else
  insert into public.commercial_checkouts(owner_id,plan) values(pr.id,p->>'plan') returning * into c;
 end if;
 return jsonb_build_object('id',c.id,'customer_id',pr.stripe_customer_id,'session_id',c.session_id);
end $$;
-- New legacy hosted sessions participate in shared pending capacity. Existing
-- subscriptions without checkout_intent_id keep their established lifecycle.
create function public.legacy_checkout_apply(p jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare pr public.profiles; c public.commercial_checkouts; result jsonb;
begin
 select * into pr from public.profiles where id=(p->>'owner_id')::uuid for update;
 if not found then raise exception 'owner_missing'; end if;
 select * into c from public.commercial_checkouts where id=(p->>'checkout_id')::uuid and owner_id=pr.id and plan=p->>'plan';
 if not found or c.plan not in ('starter','pro') or c.state='expired' then raise exception 'checkout_authority_required'; end if;
 if p->>'event_type' is distinct from 'checkout.session.completed' then raise exception 'invalid_event'; end if;
 if pr.subscription_status in ('active','trialing') and pr.stripe_subscription_id is distinct from p->>'subscription_id' then raise exception 'existing_contract_preserved'; end if;
 perform public.commercial_checkout_bind(jsonb_build_object('owner_id',pr.id,'id',c.id,'session_id',p->>'session_id'));
 result:=public.reconcile_stripe_subscription(p->>'event_id',p->>'event_type',(p->>'event_created')::bigint,p->>'subscription_id',p->>'customer_id',pr.id,p->>'status',p->>'plan',(p->>'period_start')::bigint,(p->>'period_end')::bigint,p->>'digest');
 select * into pr from public.profiles where id=pr.id;
 if pr.stripe_customer_id=p->>'customer_id' and pr.stripe_subscription_id=p->>'subscription_id'
    and pr.plan=p->>'plan' and pr.subscription_status in ('active','trialing')
    and ((result->>'applied')::boolean or result->>'code' in ('duplicate','replay','profile_event_not_newer')) then
  update public.commercial_checkouts set state='completed' where id=c.id;
 else
  raise exception 'checkout_requires_reconciliation';
 end if;
 return result;
end $$;
revoke all on function public.legacy_checkout_apply(jsonb) from public,anon,authenticated;
grant execute on function public.legacy_checkout_apply(jsonb) to service_role;
commit;
