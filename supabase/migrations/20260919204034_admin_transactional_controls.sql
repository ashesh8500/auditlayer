-- Service-owned founder controls. No browser grant and no historical rewrites.
-- The existing access assignment owns validation, manual enterprise/comp
-- precedence and the audit log. Calculate the balance ONLY under its row lock.
create function public.admin_assign_access_delta(
  p_actor_id uuid, p_target_user_id uuid, p_plan text,
  p_account_type text, p_gifted_delta integer, p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_balance integer;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and role = 'admin') then
    raise exception 'actor_not_admin';
  end if;
  if p_plan is null or p_account_type is null or p_gifted_delta is null
     or length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'invalid_access_assignment';
  end if;
  select gifted_audits into v_balance from public.profiles
    where id = p_target_user_id for update;
  if not found then raise exception 'profile_not_found'; end if;
  if v_balance + p_gifted_delta < 0 then raise exception 'insufficient_gifted_balance'; end if;
  return public.admin_set_access(p_actor_id, p_target_user_id, p_plan,
    p_account_type, v_balance + p_gifted_delta, p_reason);
end;
$$;
revoke all on function public.admin_assign_access_delta(uuid, uuid, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.admin_assign_access_delta(uuid, uuid, text, text, integer, text)
  to service_role;

-- Private objects are uploaded with upsert=false before this transaction. A
-- failed/unknown commit leaves an orphan for later reconciliation, never deletes
-- an object that a successful but unacknowledged transaction may reference.
create function public.admin_finalize_manual_report(
  p_actor_id uuid, p_audit_id uuid, p_report_path text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_audit public.audits%rowtype;
  v_version integer;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and role = 'admin') then
    raise exception 'actor_not_admin';
  end if;
  if p_report_path is null or p_report_path !~ ('^' || p_audit_id::text || '/manual/[0-9a-f-]{36}\.html$') then
    raise exception 'invalid_manual_report_path';
  end if;
  select * into v_audit from public.audits where id = p_audit_id for update;
  if not found then raise exception 'audit_not_found'; end if;
  -- Replays return the committed version without moving a newer report pointer.
  select version into v_version from public.audit_report_versions
    where audit_id = p_audit_id and report_path = p_report_path and change_type = 'manual';
  if found then return jsonb_build_object('version', v_version, 'replayed', true); end if;
  if v_audit.status in ('queued', 'running') or exists (
    select 1 from public.refinements where audit_id = p_audit_id and status in ('queued', 'running')
  ) then raise exception 'audit_work_in_flight'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'reports' and name = p_report_path) then
    raise exception 'manual_report_object_missing';
  end if;
  select coalesce(max(version), 0) + 1 into v_version
    from public.audit_report_versions where audit_id = p_audit_id;
  insert into public.audit_report_versions (
    audit_id, version, report_path, prompt_version, template_version,
    agent_bundle_version, change_type, change_summary, actor
  ) values (p_audit_id, v_version, p_report_path, null, 'manual',
    'manual', 'manual', 'Founder-uploaded report', 'admin');
  update public.audits set report_path = p_report_path, report_version = v_version,
    status = 'ready', prompt_version = null, template_version = 'manual',
    agent_bundle_version = 'manual', updated_at = now() where id = p_audit_id;
  insert into public.audit_events(audit_id, actor, event_type, phase, detail)
    values (p_audit_id, 'admin', 'report_ready', 'succeeded', 'Manual report attached.');
  insert into public.admin_actions(actor_id, target_user_id, action, detail)
    values (p_actor_id, v_audit.user_id, 'manual_report_upload',
      jsonb_build_object('audit_id', p_audit_id, 'version', v_version, 'report_path', p_report_path));
  return jsonb_build_object('version', v_version, 'replayed', false);
end;
$$;
revoke all on function public.admin_finalize_manual_report(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_finalize_manual_report(uuid, uuid, text) to service_role;

