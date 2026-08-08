-- Create entitled audits, their intake events, and the enclosing batch in one
-- transaction. Any validation, entitlement, or persistence failure rolls the
-- entire statement back, including gifted-credit consumption.
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
  v_profile_id uuid;
  v_batch_id uuid;
  v_audit_ids uuid[] := array[]::uuid[];
  v_item jsonb;
  v_created_audit jsonb;
  v_audit_id uuid;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'invalid_idempotency_key' using errcode = 'P0001';
  end if;
  if p_audits is null
    or jsonb_typeof(p_audits) <> 'array'
    or jsonb_array_length(p_audits) = 0
    or jsonb_array_length(p_audits) > 32
  then
    raise exception 'invalid_batch_audits' using errcode = 'P0001';
  end if;

  -- Serialize entitlement and idempotency decisions for this user. The nested
  -- submit_entitled_audit calls lock the same row re-entrantly.
  select id into v_profile_id
  from public.profiles
  where id = p_user_id
  for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.subjects
    where id = p_subject_id and user_id = p_user_id
  ) then
    raise exception 'subject_not_owned' using errcode = 'P0001';
  end if;

  -- A retry returns the audits linked by the original transaction before any
  -- channels, entitlements, audit rows, or events are written.
  select id into v_batch_id
  from public.audit_batches
  where user_id = p_user_id and idempotency_key = p_idempotency_key;

  if found then
    select coalesce(
      array_agg(ba.audit_id order by ba.audit_id),
      array[]::uuid[]
    ) into v_audit_ids
    from public.batch_audits ba
    where ba.batch_id = v_batch_id;

    return jsonb_build_object(
      'batch_id', v_batch_id,
      'audit_ids', to_jsonb(v_audit_ids)
    );
  end if;

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

  insert into public.audit_batches (user_id, subject_id, idempotency_key)
  values (p_user_id, p_subject_id, p_idempotency_key)
  returning id into v_batch_id;

  foreach v_audit_id in array v_audit_ids
  loop
    insert into public.batch_audits (batch_id, audit_id)
    values (v_batch_id, v_audit_id);
  end loop;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'audit_ids', to_jsonb(v_audit_ids)
  );
end;
$$;

revoke all on function public.submit_entitled_audit_batch(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_entitled_audit_batch(uuid, uuid, text, jsonb) to service_role;

comment on function public.submit_entitled_audit_batch(uuid, uuid, text, jsonb) is
  'Atomically validates ownership and entitlements, creates audits and intake events, links channels, and creates an idempotent audit batch.';
