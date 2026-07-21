-- Post-review hardening for the canonical ALM operator and report lineage.

-- Authenticated founders may read the operator control plane, but browser JWTs
-- cannot mutate transcripts, jobs, incidents, or approval state directly.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'operator_threads', 'operator_messages', 'operator_jobs', 'operator_incidents'
  ] loop
    execute format('revoke all on public.%I from authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end;
$$;

drop policy if exists operator_threads_admin_all on public.operator_threads;
drop policy if exists operator_messages_admin_all on public.operator_messages;
drop policy if exists operator_jobs_admin_all on public.operator_jobs;
drop policy if exists operator_incidents_admin_all on public.operator_incidents;

create policy operator_threads_admin_select on public.operator_threads
  for select to authenticated using (public.is_admin());
create policy operator_messages_admin_select on public.operator_messages
  for select to authenticated using (public.is_admin());
create policy operator_jobs_admin_select on public.operator_jobs
  for select to authenticated using (public.is_admin());
create policy operator_incidents_admin_select on public.operator_incidents
  for select to authenticated using (public.is_admin());

alter table public.operator_jobs
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz;

alter table public.operator_jobs
  drop constraint if exists operator_jobs_approval_kind_check;
alter table public.operator_jobs
  add constraint operator_jobs_approval_kind_check check (
    (kind = 'operations' and approval_state in ('requested', 'approved', 'rejected'))
    or
    (kind <> 'operations' and approval_state = 'not_required')
  ) not valid;
alter table public.operator_jobs validate constraint operator_jobs_approval_kind_check;

create or replace function public.approve_operator_job(
  p_job_id uuid,
  p_approved boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1
      from public.profiles
     where id = auth.uid()
       and role = 'admin'
       and lower(email) = 'ashesh@asheshkaji.com'
  ) then
    raise exception 'operator_approval_forbidden' using errcode = '42501';
  end if;

  update public.operator_jobs
     set approval_state = case when p_approved then 'approved' else 'rejected' end,
         approved_by = auth.uid(),
         approved_at = now(),
         status = case when p_approved then status else 'cancelled' end,
         updated_at = now()
   where id = p_job_id
     and kind = 'operations'
     and status = 'queued'
     and approval_state = 'requested';

  if not found then
    raise exception 'operator_job_not_approvable';
  end if;
end;
$$;

revoke all on function public.approve_operator_job(uuid, boolean)
  from public, anon, service_role;
grant execute on function public.approve_operator_job(uuid, boolean)
  to authenticated;

-- Replace report finalization RPCs so bundle lineage and the user-visible
-- report pointer are committed in the same database transaction.
drop function if exists public.finalize_initial_report(uuid, text, text, text, text);

create function public.finalize_initial_report(
  p_audit_id uuid,
  p_delivery_status text,
  p_report_path text,
  p_prompt_version text,
  p_template_version text,
  p_agent_bundle_version text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_path text;
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

  select report_path into v_existing_path
    from public.audit_report_versions
   where audit_id = p_audit_id and version = 1;

  if v_existing_path is not null and v_existing_path <> p_report_path then
    raise exception 'initial_report_already_finalized';
  end if;

  if v_existing_path is null then
    insert into public.audit_report_versions (
      audit_id, version, report_path, prompt_version, template_version,
      agent_bundle_version, change_type, change_summary, actor
    ) values (
      p_audit_id, 1, p_report_path, p_prompt_version, p_template_version,
      p_agent_bundle_version, 'generation', 'Initial generated report', 'worker'
    );
  end if;

  update public.audits
     set status = p_delivery_status,
         report_path = p_report_path,
         report_version = 1,
         prompt_version = p_prompt_version,
         template_version = p_template_version,
         agent_bundle_version = p_agent_bundle_version,
         updated_at = now()
   where id = p_audit_id;

  return 1;
end;
$$;

revoke all on function public.finalize_initial_report(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.finalize_initial_report(uuid, text, text, text, text, text)
  to service_role;

drop function if exists public.finalize_refinement_report(uuid, uuid, text, text, text, text, text);

create function public.finalize_refinement_report(
  p_audit_id uuid,
  p_refinement_id uuid,
  p_report_path text,
  p_prompt_version text,
  p_template_version text,
  p_agent_bundle_version text,
  p_changed_section text,
  p_change_summary text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
  v_refinement_audit_id uuid;
  v_final_path text := p_report_path;
begin
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

  select audit_id into v_refinement_audit_id
    from public.refinements
   where id = p_refinement_id
   for update;
  if v_refinement_audit_id is distinct from p_audit_id then
    raise exception 'refinement_audit_mismatch';
  end if;

  select version, report_path into v_version, v_final_path
    from public.audit_report_versions
   where source_refinement_id = p_refinement_id;

  if v_version is null then
    select coalesce(max(version), 0) + 1 into v_version
      from public.audit_report_versions
     where audit_id = p_audit_id;

    insert into public.audit_report_versions (
      audit_id, version, report_path, prompt_version, template_version,
      agent_bundle_version, change_type, changed_section, change_summary,
      actor, source_refinement_id
    ) values (
      p_audit_id, v_version, p_report_path, p_prompt_version, p_template_version,
      p_agent_bundle_version, 'refinement', nullif(p_changed_section, ''),
      left(coalesce(p_change_summary, ''), 500), 'worker', p_refinement_id
    );
  end if;

  update public.audits
     set report_path = v_final_path,
         report_version = v_version,
         prompt_version = p_prompt_version,
         template_version = p_template_version,
         agent_bundle_version = p_agent_bundle_version,
         updated_at = now()
   where id = p_audit_id;

  update public.refinements
     set status = 'done', error = '', updated_at = now()
   where id = p_refinement_id;

  return v_version;
end;
$$;

revoke all on function public.finalize_refinement_report(
  uuid, uuid, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.finalize_refinement_report(
  uuid, uuid, text, text, text, text, text, text
) to service_role;
