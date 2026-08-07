-- ===========================================================================
-- ALM-I-021 — admit `modified` to the canonical decisions ledger vocabulary.
--
-- Additive contract, later than the W013 Stripe migration timestamp
-- (20260807140000). Replaces ONLY the named `decisions.decision` CHECK
-- constraint created by the kernel migration
-- (20260723020611_alm_intelligence_kernel.sql) and reasserts the
-- `record_decision` RPC's service-role-only / fixed-search-path semantics so
-- the decision write path is provably unchanged apart from the vocabulary
-- extension. The original kernel migration is NOT edited.
--
-- The `recommendation_outcomes` ledger remains a later observation record and
-- is NOT a decision store: it admits `modified` only with a bounded observation
-- window. The immediate `modified` decision belongs in `decisions` with the
-- required refinement note.
-- ===========================================================================

-- 1. Replace the decisions.decision CHECK constraint.
--    Postgres names inline column CHECKs `<table>_<column>_check`, so the
--    kernel's inline `check (decision in (...))` is `decisions_decision_check`.
alter table public.decisions
  drop constraint if exists decisions_decision_check;

alter table public.decisions
  add constraint decisions_decision_check
  check (decision in ('accepted', 'rejected', 'modified', 'superseded'));

-- 2. Reassert record_decision: SECURITY DEFINER, fixed search_path, target
--    linkage validation, and service_role-only execute. Identical semantics to
--    the kernel definition — only the decisions CHECK above widened the
--    vocabulary. The RPC itself performs no vocabulary validation because the
--    CHECK constraint is the authoritative vocabulary gate.
create or replace function public.record_decision(
  p_subject_id uuid,
  p_user_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_decision text,
  p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_ok boolean := false;
begin
  -- Validate the target belongs to the subject (recommendation -> run -> subject).
  if p_target_type = 'proposal' then
    select exists (
      select 1 from public.context_update_proposals
      where id = p_target_id and subject_id = p_subject_id
    ) into v_ok;
  elsif p_target_type = 'recommendation' then
    select exists (
      select 1
      from public.recommendations r
      join public.intelligence_runs ir on ir.id = r.intelligence_run_id
      where r.id = p_target_id and ir.subject_id = p_subject_id
    ) into v_ok;
  end if;

  if not v_ok then
    raise exception '% % does not belong to subject %',
      p_target_type, p_target_id, p_subject_id;
  end if;

  insert into public.decisions (subject_id, user_id, target_type, target_id, decision, note)
  values (p_subject_id, p_user_id, p_target_type, p_target_id, p_decision, p_note)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_decision(uuid, uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.record_decision(uuid, uuid, text, uuid, text, text)
  to service_role;
