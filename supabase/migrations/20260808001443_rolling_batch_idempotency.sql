-- Retry idempotency is a rolling ten-minute property, not a permanent
-- uniqueness property. The profile row lock inside submit_entitled_audit_batch
-- serializes submissions for one user, so the lookup and insert remain race-free.
alter table public.audit_batches
  drop constraint if exists audit_batches_user_id_idempotency_key_key;

create index if not exists idx_audit_batches_retry_lookup
  on public.audit_batches (user_id, idempotency_key, created_at desc);

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

    v_created_audit := public.submit_entitled_audit(
      p_user_id,
      v_item->>'handle',
      v_item->>'platform',
      v_item->>'goal',
      v_item->>'report_type',
      coalesce(v_item->>'context', ''),
      v_item->>'status',
      coalesce(v_item->'limitations', '[]'::jsonb),
      nullif(v_item->>'milestone_label', '')
    );
    v_audit_id := (v_created_audit->>'id')::uuid;
    if v_audit_id is null then
      raise exception 'audit_creation_failed' using errcode = 'P0001';
    end if;

    update public.audits
    set force_refresh = coalesce((v_item->>'force_refresh')::boolean, false)
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
    perform public.record_living_brief_version(
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
