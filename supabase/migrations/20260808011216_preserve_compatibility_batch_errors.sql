-- Preserve the established compatibility-RPC error contract while retaining the
-- tenant locks and rolling retry semantics introduced in the preceding migration.
create or replace function public.submit_audit_batch(
  p_user_id uuid,
  p_subject_id uuid,
  p_idempotency_key text,
  p_audit_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_audit_id uuid;
begin
  perform 1
  from public.profiles
  where id = p_user_id
  for update;
  if not found then
    raise exception 'user % not found', p_user_id;
  end if;

  perform 1
  from public.subjects
  where id = p_subject_id
    and user_id = p_user_id
  for share;
  if not found then
    raise exception 'subject % is not owned by user %', p_subject_id, p_user_id;
  end if;

  select id into v_batch_id
  from public.audit_batches
  where user_id = p_user_id
    and subject_id = p_subject_id
    and idempotency_key = p_idempotency_key
    and created_at >= now() - interval '10 minutes'
  order by created_at desc
  limit 1;

  if v_batch_id is not null then
    return v_batch_id;
  end if;

  foreach v_audit_id in array p_audit_ids loop
    perform 1
    from public.audits
    where id = v_audit_id
      and user_id = p_user_id
    for share;
    if not found then
      raise exception 'audit % is not owned by user %', v_audit_id, p_user_id;
    end if;
  end loop;

  insert into public.audit_batches (user_id, subject_id, idempotency_key)
  values (p_user_id, p_subject_id, p_idempotency_key)
  returning id into v_batch_id;

  foreach v_audit_id in array p_audit_ids loop
    insert into public.batch_audits (batch_id, audit_id)
    values (v_batch_id, v_audit_id);
  end loop;

  return v_batch_id;
end;
$$;

revoke all on function public.submit_audit_batch(uuid, uuid, text, uuid[])
  from public, anon, authenticated;
grant execute on function public.submit_audit_batch(uuid, uuid, text, uuid[])
  to service_role;

comment on function public.submit_audit_batch(uuid, uuid, text, uuid[]) is
  'Compatibility path for linking existing audits. Tenant-serialized, owner-locked, transactional, and idempotent within a rolling ten-minute window.';

create or replace function public.add_audit_to_batch(
  p_batch_id uuid,
  p_audit_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_user_id uuid;
begin
  select user_id into v_batch_user_id
  from public.audit_batches
  where id = p_batch_id
  for update;
  if not found then
    raise exception 'batch % not found', p_batch_id;
  end if;

  perform 1
  from public.audits
  where id = p_audit_id
    and user_id = v_batch_user_id
  for share;
  if not found then
    raise exception 'audit % is not owned by batch user %', p_audit_id, v_batch_user_id;
  end if;

  insert into public.batch_audits (batch_id, audit_id)
  values (p_batch_id, p_audit_id)
  on conflict (batch_id, audit_id) do nothing;
end;
$$;

revoke all on function public.add_audit_to_batch(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.add_audit_to_batch(uuid, uuid)
  to service_role;

comment on function public.add_audit_to_batch(uuid, uuid) is
  'Legacy compatibility shim. Locks the batch and rejects cross-tenant audit links.';
