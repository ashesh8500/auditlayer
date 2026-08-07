-- Stripe subscription reconciliation — idempotent, ordered, auditable (ALM-I-020).
--
-- The Stripe webhook no longer writes `profiles` directly. A signed event is
-- reduced (web/src/lib/stripe-reconciliation.ts) to exactly one typed
-- commercial command and submitted to this single service-role-only RPC. The
-- RPC owns the atomic write: it records one append-only provider receipt
-- keyed by Stripe event id and changes the profile entitlement projection at
-- most once, inside one transaction.
--
-- Ordering and ties are deterministic: events compare as the tuple
-- (provider_created_epoch, provider_event_id). A duplicate event id, an older
-- event, an equal-time same-value replay, and an equal-time contradiction all
-- fail closed with a bounded jsonb result and zero profile mutations.
--
-- Founder-assigned access is preserved: when the locked profile carries
-- `subscription_status` in ('manual_enterprise', 'complimentary'), the RPC
-- records the receipt (applied=false, outcome_code='manual_precedence') and
-- never overwrites the projection with the Stripe claim.
--
-- The receipt stores typed bounded facts and a sha256 digest only — never the
-- raw Stripe payload, customer payload, or secrets — and is append-only.
-- Browser roles get no table or function access.
--
-- Additive: one new table, one RPC, one append-only guard trigger. No
-- existing table, column, policy, or trigger is changed.

-- ---------------------------------------------------------------------------
-- 1. Append-only provider event receipt.
-- ---------------------------------------------------------------------------
create table if not exists public.provider_event_receipts (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe',
  provider_event_id text not null,
  provider_created_epoch bigint not null,
  subscription_id text not null,
  customer_id text not null,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  command_type text not null,
  plan text not null,
  subscription_status text not null,
  current_period_end_epoch bigint,
  digest text not null,
  applied boolean not null,
  outcome_code text not null default 'applied',
  created_at timestamptz not null default now(),
  constraint provider_event_receipts_provider_event_unique unique (provider, provider_event_id),
  constraint provider_event_receipts_command_type_check check (command_type in ('plan_grant', 'plan_revoke')),
  constraint provider_event_receipts_plan_check check (plan in ('free', 'starter', 'pro', 'enterprise')),
  constraint provider_event_receipts_status_check check (subscription_status in ('active', 'trialing', 'canceled')),
  constraint provider_event_receipts_digest_check check (length(digest) = 64),
  constraint provider_event_receipts_applied_check check (applied in (true, false)),
  constraint provider_event_receipts_outcome_check check (outcome_code in ('applied', 'manual_precedence'))
);

-- ---------------------------------------------------------------------------
-- 2. Service-role-only atomic reconciliation RPC.
-- ---------------------------------------------------------------------------
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
  select provider_event_id, provider_created_epoch, plan, subscription_status, current_period_end_epoch
    into v_last_event_id, v_last_created, v_last_plan, v_last_status, v_last_period
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
      current_period_end_epoch, digest, applied, outcome_code
    ) values (
      'stripe', p_event_id, p_event_created, p_subscription_id,
      p_customer_id, v_profile_id,
      case when p_status in ('active', 'trialing') then 'plan_grant' else 'plan_revoke' end,
      p_plan, p_status, p_current_period_end_epoch, p_digest, false, 'manual_precedence'
    );
    return jsonb_build_object(
      'applied', false,
      'code', 'manual_precedence',
      'event_id', p_event_id,
      'profile_id', v_profile_id
    );
  end if;

  -- 6. Apply: exactly one receipt insert plus at most one profile transition,
  --    in the same transaction. A failed transition raises and rolls back the
  --    receipt insert with it — never a split write.
  insert into public.provider_event_receipts (
    provider, provider_event_id, provider_created_epoch, subscription_id,
    customer_id, profile_id, command_type, plan, subscription_status,
    current_period_end_epoch, digest, applied, outcome_code
  ) values (
    'stripe', p_event_id, p_event_created, p_subscription_id,
    p_customer_id, v_profile_id,
    case when p_status in ('active', 'trialing') then 'plan_grant' else 'plan_revoke' end,
    p_plan, p_status, p_current_period_end_epoch, p_digest, true, 'applied'
  );

  update public.profiles
  set plan = p_plan,
      subscription_status = p_status,
      stripe_customer_id = p_customer_id,
      stripe_subscription_id = p_subscription_id,
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

-- ---------------------------------------------------------------------------
-- 3. Append-only guard: receipts can never be updated or deleted.
-- ---------------------------------------------------------------------------
create or replace function public.provider_event_receipts_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'provider_event_receipts is append-only' using errcode = 'P0001';
end;
$$;

drop trigger if exists provider_event_receipts_append_only_trigger on public.provider_event_receipts;
create trigger provider_event_receipts_append_only_trigger
  before update or delete on public.provider_event_receipts
  for each row execute function public.provider_event_receipts_append_only();

-- ---------------------------------------------------------------------------
-- 4. RLS + grants: service_role only; browser roles revoked.
-- ---------------------------------------------------------------------------
alter table public.provider_event_receipts enable row level security;
revoke all on public.provider_event_receipts from anon, authenticated;
revoke all on function public.reconcile_stripe_subscription(text, text, bigint, text, text, uuid, text, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.reconcile_stripe_subscription(text, text, bigint, text, text, uuid, text, text, bigint, text)
  to service_role;
