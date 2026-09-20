-- Serialized, finite refinement attempts. Expired work is never auto-replayed:
-- a killed worker may already have spent tokens. Unknown usage stays NULL.
alter table public.refinements
  add column if not exists base_report_version integer,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists tokens_in bigint,
  add column if not exists tokens_out bigint,
  add column if not exists cost_usd numeric,
  add column if not exists usage_estimated boolean,
  add column if not exists usage_status text not null default 'unknown';

create or replace function public.enqueue_report_refinement(
  p_audit_id uuid, p_user_id uuid, p_report_version integer,
  p_section text, p_instruction text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform 1 from public.audits where id = p_audit_id and user_id = p_user_id
    and status = 'ready' and nullif(report_path, '') is not null
    and report_version = p_report_version for update;
  if not found then raise exception 'report_changed_or_unavailable'; end if;
  if length(trim(p_section)) not between 1 and 160 or length(trim(p_instruction)) not between 8 and 4000 then
    raise exception 'invalid_refinement';
  end if;
  insert into public.refinements(audit_id,user_id,section,instruction,status)
    values(p_audit_id,p_user_id,p_section,p_instruction,'queued') returning id into v_id;
  insert into public.audit_events(audit_id,actor,event_type,phase,detail)
    values(p_audit_id,'client','refinement_requested','refinement',p_section);
  return v_id;
end;
$$;
revoke all on function public.enqueue_report_refinement(uuid,uuid,integer,text,text) from public, anon, authenticated;
grant execute on function public.enqueue_report_refinement(uuid,uuid,integer,text,text) to service_role;

create or replace function public.claim_next_refinement(worker_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_audit uuid;
  v_version integer;
  claimed_row public.refinements%rowtype;
begin
  -- Lock the audit first, just like finalization; skip busy audits, not merely
  -- busy refinement rows. Another worker cannot claim a sibling concurrently.
  select a.id, a.report_version into v_audit, v_version
    from public.audits a
   where a.status = 'ready' and nullif(a.report_path, '') is not null
     and exists (select 1 from public.refinements r where r.audit_id = a.id and r.status = 'queued')
     and not exists (select 1 from public.refinements r where r.audit_id = a.id and r.status = 'running')
   order by a.created_at limit 1 for update of a skip locked;
  if not found then return null; end if;
  -- Recheck after acquiring the audit lock (READ COMMITTED snapshot races).
  if exists (select 1 from public.refinements where audit_id = v_audit and status = 'running') then
    return null;
  end if;
  select * into claimed_row from public.refinements
   where audit_id = v_audit and status = 'queued'
   order by created_at, id limit 1 for update skip locked;
  if not found then return null; end if;
  update public.refinements set status = 'running', claimed_at = now(),
    claimed_by = worker_id, updated_at = now(), base_report_version = v_version,
    lease_expires_at = now() + interval '20 minutes'
   where id = claimed_row.id returning * into claimed_row;
  return to_jsonb(claimed_row);
end;
$$;
revoke all on function public.claim_next_refinement(text) from public, anon, authenticated;
grant execute on function public.claim_next_refinement(text) to service_role;

create or replace function public.sweep_stale_refinements()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  -- Bounded terminal recovery, including running rows from before this migration.
  with stale as (
    select id from public.refinements where status = 'running'
      and coalesce(lease_expires_at, claimed_at + interval '20 minutes', updated_at + interval '20 minutes') < now()
    order by updated_at limit 100 for update skip locked
  )
  update public.refinements r set
    status = case when exists (select 1 from public.audit_report_versions v where v.source_refinement_id = r.id) then 'done' else 'failed' end,
    error = case when exists (select 1 from public.audit_report_versions v where v.source_refinement_id = r.id) then '' else 'Refinement interrupted. No automatic retry was made; the previous report is retained.' end,
    updated_at = now()
   where r.id in (select id from stale);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.sweep_stale_refinements() from public, anon, authenticated;
grant execute on function public.sweep_stale_refinements() to service_role;

create or replace function public.finalize_refinement_report(
  p_audit_id uuid,
  p_refinement_id uuid,
  p_report_path text,
  p_prompt_version text,
  p_template_version text,
  p_agent_bundle_version text,
  p_changed_section text,
  p_change_summary text,
  p_intelligence_run_id uuid default null
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
  v_ref public.refinements%rowtype;
  v_base integer;
begin
  if trim(coalesce(p_report_path, '')) = '' then
    raise exception 'report_path_required';
  end if;
  if trim(coalesce(p_agent_bundle_version, '')) = '' then
    raise exception 'agent_bundle_version_required';
  end if;

  select report_version into v_base from public.audits where id = p_audit_id for update;
  if not found then
    raise exception 'audit_not_found';
  end if;

  select audit_id
    into v_refinement_audit_id
    from public.refinements
   where id = p_refinement_id
   for update;
  if v_refinement_audit_id is distinct from p_audit_id then
    raise exception 'refinement_audit_mismatch';
  end if;

  select * into v_ref from public.refinements where id = p_refinement_id;
  -- Committed retry returns its immutable result without rewinding a newer report.
  select version into v_version from public.audit_report_versions
   where source_refinement_id = p_refinement_id and audit_id = p_audit_id;
  if found then
    if not exists (select 1 from public.audit_report_versions
      where source_refinement_id = p_refinement_id and report_path = p_report_path
        and prompt_version is not distinct from p_prompt_version
        and template_version is not distinct from p_template_version
        and agent_bundle_version is not distinct from p_agent_bundle_version
        and intelligence_run_id is not distinct from p_intelligence_run_id) then
      raise exception 'refinement_provenance_conflict';
    end if;
    return v_version;
  end if;
  if v_ref.status <> 'running' or v_ref.lease_expires_at is null
     or v_ref.lease_expires_at <= now() then
    raise exception 'refinement_lease_expired';
  end if;
  if v_ref.base_report_version is distinct from v_base then
    raise exception 'refinement_base_changed';
  end if;

  -- Same optional canonical provenance gate as the initial path.
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

  select version, report_path
    into v_version, v_final_path
    from public.audit_report_versions
   where source_refinement_id = p_refinement_id;

  if v_version is null then
    v_final_path := p_report_path;
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
      changed_section,
      change_summary,
      actor,
      source_refinement_id
    ) values (
      p_audit_id,
      v_version,
      p_report_path,
      p_prompt_version,
      p_template_version,
      p_agent_bundle_version,
      p_intelligence_run_id,
      'refinement',
      nullif(p_changed_section, ''),
      left(coalesce(p_change_summary, ''), 500),
      'worker',
      p_refinement_id
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
     set status = 'done',
         error = '',
         updated_at = now()
   where id = p_refinement_id;

  return v_version;
end;
$$;

revoke all on function public.finalize_refinement_report(uuid, uuid, text, text, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_refinement_report(uuid, uuid, text, text, text, text, text, text, uuid)
  to service_role;
