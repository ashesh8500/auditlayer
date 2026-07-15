-- Founder-operated commercial entitlements and atomic trial/audit operations.
--
-- Trial redemption and gifted-credit consumption must be transactional. The web
-- app calls these service-role-only RPCs rather than performing read/update/write
-- sequences that can race or consume a credit without creating an audit.

alter table public.trial_links
  add column if not exists offer_plan text not null default 'starter';
alter table public.trial_links
  add column if not exists report_types text[] not null default array['standard']::text[];
alter table public.trial_links
  add column if not exists access_days int not null default 14;

alter table public.profiles
  add column if not exists trial_plan text;
alter table public.profiles
  add column if not exists trial_report_types text[] not null default '{}'::text[];
alter table public.profiles
  add column if not exists trial_expires_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.trial_links'::regclass
      and conname = 'trial_links_offer_plan_check'
  ) then
    alter table public.trial_links
      add constraint trial_links_offer_plan_check
      check (offer_plan in ('free', 'starter', 'pro', 'enterprise'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.trial_links'::regclass
      and conname = 'trial_links_report_types_check'
  ) then
    alter table public.trial_links
      add constraint trial_links_report_types_check
      check (
        cardinality(report_types) > 0
        and report_types <@ array['pulse', 'standard', 'extended', 'enterprise', 'blueprint']::text[]
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.trial_links'::regclass
      and conname = 'trial_links_access_days_check'
  ) then
    alter table public.trial_links
      add constraint trial_links_access_days_check check (access_days between 1 and 365);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_trial_plan_check'
  ) then
    alter table public.profiles
      add constraint profiles_trial_plan_check
      check (trial_plan is null or trial_plan in ('free', 'starter', 'pro', 'enterprise'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_trial_report_types_check'
  ) then
    alter table public.profiles
      add constraint profiles_trial_report_types_check
      check (trial_report_types <@ array['pulse', 'standard', 'extended', 'enterprise', 'blueprint']::text[]);
  end if;
end
$$;

-- These tables were introduced after the base RLS migration. Fail closed and
-- permit only authenticated founders through is_admin(); service_role bypasses RLS.
alter table public.trial_links enable row level security;
alter table public.admin_actions enable row level security;

drop policy if exists trial_links_admin_all on public.trial_links;
create policy trial_links_admin_all on public.trial_links
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists admin_actions_admin_select on public.admin_actions;
create policy admin_actions_admin_select on public.admin_actions
  for select to authenticated
  using (public.is_admin());

revoke all on public.trial_links from anon, authenticated;
revoke all on public.admin_actions from anon, authenticated;
grant select, insert, update, delete on public.trial_links to authenticated;
grant select on public.admin_actions to authenticated;

-- Atomically redeem one invite. A profile can redeem only one trial invite; this
-- prevents repeated callback visits from resetting or multiplying credits.
drop function if exists public.redeem_trial_link(text, uuid);
create or replace function public.redeem_trial_link(p_token text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  offer public.trial_links%rowtype;
  profile_row public.profiles%rowtype;
begin
  select * into offer
  from public.trial_links
  where token = p_token
  for update;

  if not found then raise exception 'trial_not_found' using errcode = 'P0001'; end if;
  if offer.revoked_at is not null then raise exception 'trial_revoked' using errcode = 'P0001'; end if;
  if offer.expires_at is not null and offer.expires_at <= now() then
    raise exception 'trial_expired' using errcode = 'P0001';
  end if;
  if offer.max_uses is not null and offer.used_count >= offer.max_uses then
    raise exception 'trial_exhausted' using errcode = 'P0001';
  end if;

  select * into profile_row
  from public.profiles
  where id = p_user_id
  for update;
  if not found then raise exception 'profile_not_found' using errcode = 'P0001'; end if;
  if profile_row.trial_link_id is not null then
    raise exception 'trial_already_redeemed' using errcode = 'P0001';
  end if;

  update public.profiles
  set account_type = 'trial',
      gifted_audits = gifted_audits + offer.audits_granted,
      trial_link_id = offer.id,
      trial_plan = offer.offer_plan,
      trial_report_types = offer.report_types,
      trial_expires_at = now() + make_interval(days => offer.access_days)
  where id = p_user_id;

  update public.trial_links
  set used_count = used_count + 1
  where id = offer.id;

  insert into public.admin_actions (actor_id, target_user_id, action, detail)
  values (
    offer.created_by,
    p_user_id,
    'trial_redeemed',
    jsonb_build_object(
      'trial_link_id', offer.id,
      'audits_granted', offer.audits_granted,
      'offer_plan', offer.offer_plan,
      'report_types', offer.report_types,
      'access_days', offer.access_days
    )
  );

  return jsonb_build_object(
    'trial_link_id', offer.id,
    'audits_granted', offer.audits_granted,
    'offer_plan', offer.offer_plan,
    'report_types', offer.report_types,
    'trial_expires_at', now() + make_interval(days => offer.access_days)
  );
end;
$$;
revoke all on function public.redeem_trial_link(text, uuid) from public, anon, authenticated;
grant execute on function public.redeem_trial_link(text, uuid) to service_role;

-- Atomically enforce report entitlements, consume a gifted credit when present,
-- enforce the paid-plan allowance otherwise, and create the queued audit.
drop function if exists public.submit_entitled_audit(uuid, text, text, text, text, text, text, jsonb, text);
create or replace function public.submit_entitled_audit(
  p_user_id uuid,
  p_handle text,
  p_platform text,
  p_goal text,
  p_report_type text,
  p_context text,
  p_status text,
  p_limitations jsonb,
  p_milestone_label text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_row public.profiles%rowtype;
  effective_plan text;
  allowed_types text[];
  plan_limit int;
  current_usage int;
  use_gifted boolean := false;
  created_audit public.audits%rowtype;
begin
  select * into profile_row
  from public.profiles
  where id = p_user_id
  for update;
  if not found then raise exception 'profile_not_found' using errcode = 'P0001'; end if;

  if p_report_type not in ('pulse', 'standard', 'extended', 'enterprise', 'blueprint') then
    raise exception 'invalid_report_type' using errcode = 'P0001';
  end if;
  if p_status not in ('queued', 'needs_review', 'blocked') then
    raise exception 'invalid_initial_status' using errcode = 'P0001';
  end if;

  effective_plan := case
    when profile_row.role = 'admin' then 'enterprise'
    when profile_row.trial_expires_at > now() and profile_row.trial_plan is not null
      then profile_row.trial_plan
    else profile_row.plan
  end;

  allowed_types := case effective_plan
    when 'free' then array['pulse']::text[]
    when 'starter' then array['pulse', 'standard']::text[]
    when 'pro' then array['pulse', 'standard', 'extended', 'blueprint']::text[]
    when 'enterprise' then array['pulse', 'standard', 'extended', 'enterprise', 'blueprint']::text[]
    else array['pulse']::text[]
  end;
  if profile_row.trial_expires_at > now() then
    allowed_types := array(select distinct unnest(allowed_types || profile_row.trial_report_types));
  end if;
  if not p_report_type = any(allowed_types) then
    raise exception 'report_type_not_entitled' using errcode = 'P0001';
  end if;

  use_gifted := profile_row.gifted_audits > 0
    and (profile_row.account_type <> 'trial' or profile_row.trial_expires_at > now());

  if use_gifted then
    update public.profiles
    set gifted_audits = gifted_audits - 1
    where id = p_user_id;
  elsif profile_row.role <> 'admin' then
    plan_limit := case effective_plan
      when 'free' then 1
      when 'starter' then 5
      when 'pro' then 15
      when 'enterprise' then 10000
      else 1
    end;
    select count(*) into current_usage
    from public.audits
    where user_id = p_user_id
      and status in ('queued', 'running', 'ready', 'needs_review');
    if current_usage >= plan_limit then
      raise exception 'audit_limit_reached' using errcode = 'P0001';
    end if;
  end if;

  insert into public.audits (
    user_id, handle, platform, goal, report_type, context, status,
    limitations, milestone_label
  ) values (
    p_user_id, p_handle, p_platform, p_goal, p_report_type, p_context, p_status,
    coalesce(p_limitations, '[]'::jsonb), p_milestone_label
  ) returning * into created_audit;

  return jsonb_build_object(
    'id', created_audit.id,
    'gifted_consumed', use_gifted,
    'effective_plan', effective_plan
  );
end;
$$;
revoke all on function public.submit_entitled_audit(uuid, text, text, text, text, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.submit_entitled_audit(uuid, text, text, text, text, text, text, jsonb, text)
  to service_role;

-- Atomic founder access assignment for trial/comp/paid/manual-enterprise accounts.
drop function if exists public.admin_set_access(uuid, uuid, text, text, int, text);
create or replace function public.admin_set_access(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_plan text,
  p_account_type text,
  p_gifted_audits int,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  old_profile public.profiles%rowtype;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and role = 'admin') then
    raise exception 'actor_not_admin' using errcode = 'P0001';
  end if;
  if p_plan not in ('free', 'starter', 'pro', 'enterprise') then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  if p_account_type not in ('standard', 'trial', 'comp') then
    raise exception 'invalid_account_type' using errcode = 'P0001';
  end if;
  if p_gifted_audits < 0 then raise exception 'invalid_gifted_audits' using errcode = 'P0001'; end if;
  if length(trim(p_reason)) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;

  select * into old_profile
  from public.profiles
  where id = p_target_user_id
  for update;
  if not found then raise exception 'profile_not_found' using errcode = 'P0001'; end if;

  update public.profiles
  set plan = p_plan,
      account_type = p_account_type,
      gifted_audits = p_gifted_audits,
      subscription_status = case
        when p_plan = 'enterprise' then 'manual_enterprise'
        when p_account_type = 'comp' then 'complimentary'
        else subscription_status
      end,
      onboarding_status = case when p_plan = 'enterprise' then 'active' else onboarding_status end
  where id = p_target_user_id;

  insert into public.admin_actions (actor_id, target_user_id, action, detail)
  values (
    p_actor_id,
    p_target_user_id,
    'access_assignment',
    jsonb_build_object(
      'from_plan', old_profile.plan,
      'to_plan', p_plan,
      'from_account_type', old_profile.account_type,
      'to_account_type', p_account_type,
      'from_gifted_audits', old_profile.gifted_audits,
      'to_gifted_audits', p_gifted_audits,
      'reason', trim(p_reason)
    )
  );

  return jsonb_build_object(
    'plan', p_plan,
    'account_type', p_account_type,
    'gifted_audits', p_gifted_audits
  );
end;
$$;
revoke all on function public.admin_set_access(uuid, uuid, text, text, int, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_access(uuid, uuid, text, text, int, text)
  to service_role;

-- Audit insertion is server-owned so clients cannot bypass transactional
-- entitlement checks with a direct PostgREST insert.
revoke insert on public.audits from anon, authenticated;

-- Embedded production runtime alignment. Provider authentication remains an
-- environment/Hermes-profile concern; this row selects the matching model.
alter table public.app_settings alter column hermes_model set default 'gpt-5.6-sol';
update public.app_settings
set hermes_model = 'gpt-5.6-sol', updated_at = now()
where id = 1;
