-- Stage 2: deliberately refuse rollout before real existing Stripe facts were reconciled.
do $$ begin
 if exists(select 1 from public.profiles where stripe_subscription_id is not null
   and subscription_status in ('active','trialing') and plan in ('starter','pro')
   and (current_period_start is null or current_period_end is null or current_period_start >= current_period_end)) then
   raise exception 'reconcile_existing_stripe_windows_before_allowance_gate';
 end if;
end $$;
create index if not exists audits_allowance_window on public.audits(user_id,created_at)
 where status in ('queued','running','ready','needs_review');

create or replace function public.audit_allowance(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 p public.profiles%rowtype; effective_plan text; allowed_types text[];
 cap int; used int; gifts int; remaining int; trial_active boolean; monthly boolean;
 window_ok boolean := true;
begin
 -- Customer reads are owner-only, including admins. Service-role submit holds profile lock.
 if coalesce(auth.role(),'') <> 'service_role' and (auth.uid() is null or auth.uid() <> p_user_id) then
   raise exception 'not_authorized';
 end if;
 select * into p from public.profiles where id=p_user_id;
 if not found then raise exception 'profile_not_found'; end if;
 trial_active := coalesce(p.trial_expires_at > now(),false);
 effective_plan := case when p.role='admin' then 'enterprise'
   when trial_active and p.trial_plan is not null then p.trial_plan else p.plan end;
 allowed_types := case effective_plan when 'starter' then array['pulse','standard']
   when 'pro' then array['pulse','standard','extended','blueprint']
   when 'enterprise' then array['pulse','standard','extended','enterprise','blueprint']
   else array['pulse'] end;
 if trial_active then allowed_types := array(select distinct unnest(allowed_types || p.trial_report_types)); end if;
 cap := case effective_plan when 'starter' then 5 when 'pro' then 15 when 'enterprise' then 10000 else 1 end;
 gifts := case when p.account_type <> 'trial' or trial_active then greatest(0,p.gifted_audits) else 0 end;
 monthly := p.role <> 'admin' and not trial_active and p.stripe_subscription_id is not null
   and p.subscription_status in ('active','trialing') and effective_plan in ('starter','pro');
 if monthly then
   window_ok := coalesce(p.current_period_start <= now() and now() < p.current_period_end
     and p.current_period_start < p.current_period_end,false);
 end if;
 select count(*) into used from public.audits where user_id=p_user_id
   and status in ('queued','running','ready','needs_review')
   and (not monthly or (created_at >= p.current_period_start and created_at < p.current_period_end));
 -- Preserve historical gifts-first counting: gifted rows also count against cap.
 remaining := case when p.role='admin' then null when not window_ok then gifts
   else greatest(gifts, cap-used) end;
 return jsonb_build_object('effective_plan',effective_plan,'allowed_report_types',allowed_types,
   'limit',case when p.role='admin' then null else cap end,'usage',used,'gifts',gifts,
   'remaining',remaining,'can_submit',p.role='admin' or remaining>0,
   'window_kind',case when monthly then 'stripe' else 'lifetime' end,
   'window_start',case when monthly then p.current_period_start else null end,
   'window_end',case when monthly then p.current_period_end else null end,
   'window_valid',window_ok,'trial_active',trial_active,
   'trial_expires_at',case when trial_active then p.trial_expires_at else null end);
end $$;
revoke all on function public.audit_allowance(uuid) from public,anon;
grant execute on function public.audit_allowance(uuid) to authenticated,service_role;

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
  allowance jsonb;
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

  allowance := public.audit_allowance(p_user_id);
  effective_plan := allowance->>'effective_plan';
  select array_agg(value) into allowed_types from jsonb_array_elements_text(allowance->'allowed_report_types');
  if not p_report_type = any(allowed_types) then
    raise exception 'report_type_not_entitled' using errcode = 'P0001';
  end if;

  use_gifted := (allowance->>'gifts')::int > 0;
  if use_gifted then
    update public.profiles set gifted_audits=gifted_audits-1 where id=p_user_id;
  elsif not (allowance->>'window_valid')::boolean then
    raise exception 'billing_period_unreconciled' using errcode='P0001';
  elsif not (allowance->>'can_submit')::boolean then
    raise exception 'audit_limit_reached' using errcode='P0001';
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


alter table public.audits add column if not exists brief_version_id uuid references public.living_brief_versions(id);
create or replace function public.submit_entitled_audit_batch(
  p_user_id uuid,
  p_subject_id uuid,
  p_idempotency_key text,
  p_audits jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_audit_ids uuid[] := array[]::uuid[];
  v_item jsonb;
  v_created_audit jsonb;
  v_audit_id uuid;
  v_brief public.living_brief_versions%rowtype;
  v_context text;
begin
  if p_user_id is null or p_subject_id is null then
    raise exception 'invalid_batch_owner' using errcode = 'P0001';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'invalid_idempotency_key' using errcode = 'P0001';
  end if;
  if p_audits is null
    or jsonb_typeof(p_audits) <> 'array'
    or jsonb_array_length(p_audits) < 1
    or jsonb_array_length(p_audits) > 32
  then
    raise exception 'invalid_batch_size' using errcode = 'P0001';
  end if;

  -- Serialize entitlement consumption and idempotency lookup per user.
  perform 1
  from public.profiles
  where id = p_user_id
  for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;

  perform 1
  from public.subjects
  where id = p_subject_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'subject_not_owned' using errcode = 'P0001';
  end if;

  -- A semantic retry within the rolling window returns the original transaction.
  select id into v_batch_id
  from public.audit_batches
  where user_id = p_user_id
    and idempotency_key = p_idempotency_key
    and created_at >= now() - interval '10 minutes'
  order by created_at desc
  limit 1;
  if found then
    select coalesce(array_agg(ba.audit_id order by ba.audit_id), array[]::uuid[])
    into v_audit_ids
    from public.batch_audits ba
    where ba.batch_id = v_batch_id;

    return jsonb_build_object(
      'batch_id', v_batch_id,
      'audit_ids', to_jsonb(v_audit_ids)
    );
  end if;

  -- Every nested function call and insert shares this function's transaction.
  -- Any exception rolls back channel links, credits, audits, events, and batch.
  for v_item in select value from jsonb_array_elements(p_audits)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or nullif(btrim(v_item->>'handle'), '') is null
      or nullif(btrim(v_item->>'platform'), '') is null
      or nullif(btrim(v_item->>'goal'), '') is null
      or nullif(btrim(v_item->>'report_type'), '') is null
      or nullif(btrim(v_item->>'status'), '') is null
    then
      raise exception 'invalid_batch_audit' using errcode = 'P0001';
    end if;

    if nullif(btrim(v_item->>'channel_type'), '') is not null
      and nullif(btrim(v_item->>'channel_locator'), '') is not null
    then
      perform public.link_subject_channel(
        p_subject_id,
        v_item->>'channel_type',
        v_item->>'channel_locator',
        true,
        null
      );
    end if;

    -- Pin and authorize at submission, never resolve latest at completion.
    select * into v_brief from public.living_brief_versions
      where subject_id=p_subject_id
      and id=nullif(v_item->>'brief_version_id','')::uuid;
    if nullif(v_item->>'brief_version_id','') is not null and not found then
      raise exception 'brief_not_owned';
    end if;
    v_context := coalesce(v_item->>'context','');
    if v_brief.id is not null then
      v_context := 'Living Brief (pinned version ' || v_brief.id::text || E'):\n' ||
        (to_jsonb(v_brief) - array['created_by','created_at','subject_id'])::text ||
        E'\nChange notes:\n' || v_context;
    end if;

    v_created_audit := public.submit_entitled_audit(
      p_user_id,
      v_item->>'handle',
      v_item->>'platform',
      v_item->>'goal',
      v_item->>'report_type',
      v_context,
      v_item->>'status',
      coalesce(v_item->'limitations', '[]'::jsonb),
      nullif(v_item->>'milestone_label', '')
    );
    v_audit_id := (v_created_audit->>'id')::uuid;
    if v_audit_id is null then
      raise exception 'audit_creation_failed' using errcode = 'P0001';
    end if;

    update public.audits
    set brief_version_id=v_brief.id, force_refresh = coalesce((v_item->>'force_refresh')::boolean, false)
    where id = v_audit_id;

    v_audit_ids := array_append(v_audit_ids, v_audit_id);

    insert into public.audit_events (
      audit_id,
      actor,
      event_type,
      phase,
      detail
    ) values (
      v_audit_id,
      'client',
      'audit_submitted',
      'intake',
      format('batch_subject=%s; platform=%s', p_subject_id, v_item->>'platform')
    );
  end loop;

  insert into public.audit_batches (
    user_id,
    subject_id,
    idempotency_key
  ) values (
    p_user_id,
    p_subject_id,
    p_idempotency_key
  ) returning id into v_batch_id;

  insert into public.batch_audits (batch_id, audit_id)
  select v_batch_id, unnest(v_audit_ids);

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'audit_ids', to_jsonb(v_audit_ids)
  );
end;
$$;

revoke all on function public.submit_entitled_audit_batch(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_entitled_audit_batch(uuid, uuid, text, jsonb) to service_role;

comment on function public.submit_entitled_audit_batch(uuid, uuid, text, jsonb) is
  'Atomically creates entitled audit batches; identical semantic payloads retry the latest batch within a rolling ten-minute window.';

-- V2 also owns draft subject + initial brief creation. Its retry lookup runs
-- before those writes, so a lost response cannot create a duplicate subject or
-- consume entitlement twice.
create or replace function public.submit_entitled_audit_batch_v2(
  p_user_id uuid,
  p_subject_id uuid,
  p_subject_draft jsonb,
  p_idempotency_key text,
  p_audits jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_subject_id uuid;
  v_audit_ids uuid[] := array[]::uuid[];
  v_result jsonb;
  v_name text;
  v_subject_type text;
  v_initial_brief_id uuid;
begin
  if p_user_id is null then
    raise exception 'invalid_batch_owner' using errcode = 'P0001';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'invalid_idempotency_key' using errcode = 'P0001';
  end if;
  if p_audits is null
    or jsonb_typeof(p_audits) <> 'array'
    or jsonb_array_length(p_audits) < 1
    or jsonb_array_length(p_audits) > 32
  then
    raise exception 'invalid_batch_size' using errcode = 'P0001';
  end if;

  perform 1
  from public.profiles
  where id = p_user_id
  for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;

  -- A retry returns the original subject before any draft-subject write.
  select ab.id, ab.subject_id
  into v_batch_id, v_subject_id
  from public.audit_batches ab
  join public.subjects s on s.id = ab.subject_id
  where ab.user_id = p_user_id
    and s.user_id = p_user_id
    and ab.idempotency_key = p_idempotency_key
    and ab.created_at >= now() - interval '10 minutes'
  order by ab.created_at desc
  limit 1
  for update of s;
  if found then
    select coalesce(array_agg(ba.audit_id order by ba.audit_id), array[]::uuid[])
    into v_audit_ids
    from public.batch_audits ba
    where ba.batch_id = v_batch_id;

    return jsonb_build_object(
      'batch_id', v_batch_id,
      'audit_ids', to_jsonb(v_audit_ids),
      'subject_id', v_subject_id
    );
  end if;

  if p_subject_id is null then
    if p_subject_draft is null or jsonb_typeof(p_subject_draft) <> 'object' then
      raise exception 'invalid_subject_draft' using errcode = 'P0001';
    end if;
    v_name := nullif(btrim(p_subject_draft->>'name'), '');
    v_subject_type := coalesce(
      nullif(btrim(p_subject_draft->>'subject_type'), ''),
      'creator'
    );
    if v_name is null then
      raise exception 'invalid_subject_draft' using errcode = 'P0001';
    end if;

    v_subject_id := public.create_subject(p_user_id, v_name, v_subject_type);
    v_initial_brief_id := public.record_living_brief_version(
      v_subject_id,
      1,
      '1.0',
      coalesce(p_subject_draft->'identity', jsonb_build_object(
        'name', v_name,
        'subject_type', v_subject_type
      )),
      '{}'::jsonb,
      '{}'::jsonb,
      '[]'::jsonb,
      coalesce(p_subject_draft->'goals', '[]'::jsonb),
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      p_user_id,
      true
    );
  else
    if p_subject_draft is not null then
      raise exception 'invalid_subject_input' using errcode = 'P0001';
    end if;
    v_subject_id := p_subject_id;
  end if;

  if v_initial_brief_id is not null then
    select jsonb_agg(value || jsonb_build_object('brief_version_id',v_initial_brief_id))
      into p_audits from jsonb_array_elements(p_audits);
  end if;
  v_result := public.submit_entitled_audit_batch(
    p_user_id,
    v_subject_id,
    p_idempotency_key,
    p_audits
  );

  return v_result || jsonb_build_object('subject_id', v_subject_id);
end;
$$;

revoke all on function public.submit_entitled_audit_batch_v2(uuid, uuid, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_entitled_audit_batch_v2(uuid, uuid, jsonb, text, jsonb) to service_role;

comment on function public.submit_entitled_audit_batch_v2(uuid, uuid, jsonb, text, jsonb) is
  'Atomically creates an optional draft subject, its first brief, entitled audits, events, channel links, and batch with rolling retry idempotency.';
