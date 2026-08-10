-- Full report regenerations must preserve immutable version 1 and allocate a
-- new immutable report version. This path is distinct from refinements because
-- it has no refinement row, and distinct from initial finalization because a
-- founder-triggered requeue can start from an already-ready audit.

create or replace function public.finalize_regenerated_report(
  p_audit_id uuid,
  p_delivery_status text,
  p_report_path text,
  p_prompt_version text,
  p_template_version text,
  p_agent_bundle_version text,
  p_intelligence_run_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  if p_delivery_status not in ('ready', 'needs_review') then
    raise exception 'invalid_delivery_status';
  end if;
  if trim(coalesce(p_report_path, '')) = '' then
    raise exception 'report_path_required';
  end if;
  if trim(coalesce(p_agent_bundle_version, '')) = '' then
    raise exception 'agent_bundle_version_required';
  end if;

  perform 1 from public.audits where id = p_audit_id for update;
  if not found then
    raise exception 'audit_not_found';
  end if;

  if p_intelligence_run_id is not null then
    if not exists (
      select 1
        from public.intelligence_runs ir
        join public.batch_audits ba on ba.audit_id = p_audit_id
        join public.audit_batches ab on ab.id = ba.batch_id
       where ir.id = p_intelligence_run_id
         and ir.status = 'completed'
         and ir.subject_id = ab.subject_id
    ) then
      raise exception 'intelligence_run_provenance_invalid';
    end if;
  end if;

  -- A post-upload retry with the same object is idempotent. A distinct object
  -- allocates max(version)+1 while the audit row lock serializes concurrent
  -- finalizers for this audit.
  select version
    into v_version
    from public.audit_report_versions
   where audit_id = p_audit_id
     and report_path = p_report_path
   order by version desc
   limit 1;

  if v_version is null then
    select coalesce(max(version), 0) + 1
      into v_version
      from public.audit_report_versions
     where audit_id = p_audit_id;

    insert into public.audit_report_versions (
      audit_id,
      version,
      report_path,
      prompt_version,
      template_version,
      agent_bundle_version,
      intelligence_run_id,
      change_type,
      change_summary,
      actor
    ) values (
      p_audit_id,
      v_version,
      p_report_path,
      p_prompt_version,
      p_template_version,
      p_agent_bundle_version,
      p_intelligence_run_id,
      'generation',
      'Founder-triggered full report regeneration',
      'worker'
    );
  end if;

  update public.audits
     set status = p_delivery_status,
         report_path = p_report_path,
         report_version = v_version,
         prompt_version = p_prompt_version,
         template_version = p_template_version,
         agent_bundle_version = p_agent_bundle_version,
         force_refresh = false,
         updated_at = now()
   where id = p_audit_id;

  return v_version;
end;
$$;

revoke all on function public.finalize_regenerated_report(uuid, text, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_regenerated_report(uuid, text, text, text, text, text, uuid)
  to service_role;
