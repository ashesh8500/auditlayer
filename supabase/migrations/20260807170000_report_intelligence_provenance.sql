-- ===========================================================================
-- ALM-I-025 — pin immutable report versions to canonical intelligence runs.
--
-- Additive contract, later than the W014 decision-vocabulary migration
-- (20260807150000) and any W015 migration (20260807160000). Extends
-- audit_report_versions with ONE optional reference to the canonical
-- intelligence run that produced the report, and extends both finalization
-- RPCs with an optional p_intelligence_run_id that fails closed:
--
--   * the run must exist,
--   * the run must be completed (status = 'completed'),
--   * the run must belong to the same subject as the audit's batch
--     (batch_audits -> audit_batches.subject_id = intelligence_runs.subject_id),
--   * a run can be linked to at most one report version (partial unique
--     index; a duplicate link raises and writes nothing).
--
-- Legacy/null callers are untouched: the column is nullable, the RPC
-- parameter defaults to null, and report retrieval never depends on
-- provenance. No backfill, no rewrite of existing migrations, no new store.
-- The typed manifest (Living Brief, evidence snapshot, methodology,
-- expertise pack, prompt, model configuration, output schema) is projected
-- by readers from the linked intelligence_runs row; this migration only
-- owns the reference and its fail-closed validation.
-- ===========================================================================

alter table public.audit_report_versions
  add column if not exists intelligence_run_id uuid
    references public.intelligence_runs(id) on delete set null;

create unique index if not exists audit_report_versions_intelligence_run_uidx
  on public.audit_report_versions (intelligence_run_id)
  where intelligence_run_id is not null;

-- ---------------------------------------------------------------------------
-- finalize_initial_report — extended with optional intelligence provenance.
-- The old 6-argument overload is replaced by the 7-argument contract.
-- ---------------------------------------------------------------------------
drop function if exists public.finalize_initial_report(uuid, text, text, text, text, text);

create function public.finalize_initial_report(
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

  -- Optional canonical provenance gate: the referenced run must exist, be
  -- completed, and belong to the same subject as this audit's batch. Any
  -- mismatch (missing, stale, non-completed, cross-subject) raises before
  -- any write — the report version is immutable and never partially pinned.
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

  select report_path
    into v_existing_path
    from public.audit_report_versions
   where audit_id = p_audit_id and version = 1;

  if v_existing_path is not null and v_existing_path <> p_report_path then
    raise exception 'initial_report_already_finalized';
  end if;

  if v_existing_path is null then
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
      1,
      p_report_path,
      p_prompt_version,
      p_template_version,
      p_agent_bundle_version,
      p_intelligence_run_id,
      'generation',
      'Initial generated report',
      'worker'
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

revoke all on function public.finalize_initial_report(uuid, text, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_initial_report(uuid, text, text, text, text, text, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- finalize_refinement_report — extended with optional intelligence provenance.
-- The old 8-argument overload is replaced by the 9-argument contract.
-- ---------------------------------------------------------------------------
drop function if exists public.finalize_refinement_report(uuid, uuid, text, text, text, text, text, text);

create function public.finalize_refinement_report(
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

  select audit_id
    into v_refinement_audit_id
    from public.refinements
   where id = p_refinement_id
   for update;
  if v_refinement_audit_id is distinct from p_audit_id then
    raise exception 'refinement_audit_mismatch';
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
