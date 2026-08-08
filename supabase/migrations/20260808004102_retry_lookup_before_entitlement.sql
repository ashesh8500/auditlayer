-- Read-only retry recovery before mutable entitlement planning. This allows a
-- client to recover a committed response even when the first submission used
-- the final available entitlement.
create or replace function public.lookup_entitled_audit_batch_retry(
  p_user_id uuid,
  p_idempotency_key text
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
begin
  if p_user_id is null or nullif(btrim(p_idempotency_key), '') is null then
    return null;
  end if;

  select ab.id, ab.subject_id
  into v_batch_id, v_subject_id
  from public.audit_batches ab
  join public.subjects s on s.id = ab.subject_id
  where ab.user_id = p_user_id
    and s.user_id = p_user_id
    and ab.idempotency_key = p_idempotency_key
    and ab.created_at >= now() - interval '10 minutes'
  order by ab.created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  select coalesce(array_agg(ba.audit_id order by ba.audit_id), array[]::uuid[])
  into v_audit_ids
  from public.batch_audits ba
  where ba.batch_id = v_batch_id;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'audit_ids', to_jsonb(v_audit_ids),
    'subject_id', v_subject_id
  );
end;
$$;

revoke all on function public.lookup_entitled_audit_batch_retry(uuid, text) from public, anon, authenticated;
grant execute on function public.lookup_entitled_audit_batch_retry(uuid, text) to service_role;

comment on function public.lookup_entitled_audit_batch_retry(uuid, text) is
  'Returns a completed semantic retry for an owned subject within the rolling ten-minute window, before mutable entitlement planning.';
