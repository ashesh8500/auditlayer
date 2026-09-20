-- Stage 1: exact Stripe windows. Deploy webhook + reconcile existing subscribers
-- BEFORE applying the gated allowance migration. Never infer a missing anchor.
alter table public.profiles add column if not exists current_period_start timestamptz;
alter table public.provider_event_receipts add column if not exists current_period_start_epoch bigint;
drop function if exists public.reconcile_stripe_subscription(text, text, bigint, text, text, uuid, text, text, bigint, text);
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
  if p_plan not in ('free', 'starter', 'pro', 'enterprise') then
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
       or p_plan not in ('starter', 'pro', 'enterprise')
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
  set plan = p_plan,
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

-- Narrow rollout repair: only an already-linked current subscriber with a missing
-- start and exactly the same provider end. Renewals require event reconciliation.
create or replace function public.backfill_stripe_period_start(
 p_user_id uuid, p_subscription_id text, p_customer_id text,
 p_start_epoch bigint, p_end_epoch bigint
) returns boolean language plpgsql security definer set search_path = public as $$
declare p public.profiles%rowtype;
begin
 select * into p from public.profiles where id=p_user_id for update;
 if not found or p.stripe_subscription_id is distinct from p_subscription_id
 or p.stripe_customer_id is distinct from p_customer_id
 or p.subscription_status not in ('active','trialing')
 or p.plan not in ('starter','pro') or p.current_period_start is not null
 or p.current_period_end is distinct from to_timestamp(p_end_epoch)
 or p_start_epoch is null or p_start_epoch <= 0 or p_end_epoch is null or p_end_epoch <= p_start_epoch then
   return false;
 end if;
 update public.profiles set current_period_start=to_timestamp(p_start_epoch) where id=p_user_id;
 return true;
end; $$;
revoke all on function public.backfill_stripe_period_start(uuid,text,text,bigint,bigint) from public,anon,authenticated;
grant execute on function public.backfill_stripe_period_start(uuid,text,text,bigint,bigint) to service_role;
