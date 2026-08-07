-- ALM-I-003 — Recommendation outcome ledger contract.
-- Additive migration: creates the recommendation_outcomes table, a typed
-- service-role write RPC, tenant-scoped RLS read policies, and strict grants.
--
-- Contract (see docs/improvements/IDEA-QUEUE.md row "P8 · C9 · D5"):
--   A recorded outcome MUST link to a real recommendation AND a real subject,
--   capture accepted/rejected/modified state, a bounded ordered observation
--   window, observed outcome data, and explicit confounding notes.
--   Unlinked observations cannot be stored as recommendation efficacy evidence.
--
-- The write path validates subject ownership linkage, recommendation→subject
-- linkage (cross-subject rejection), and window time ordering.  Anonymous and
-- cross-tenant reads fail closed.  Fixtures verify this software contract;
-- they do not prove causal efficacy or migration success on production.
--
-- Idempotent: safe to re-run.  Additive only; nothing existing is dropped.

-- ===========================================================================
-- 1. Recommendation outcomes ledger
-- ===========================================================================
create table if not exists public.recommendation_outcomes (
  id                uuid primary key default gen_random_uuid(),
  subject_id        uuid not null references public.subjects(id) on delete cascade,
  recommendation_id uuid not null references public.recommendations(id) on delete cascade,
  decision_state    text not null
    constraint recommendation_outcomes_decision_state_check
      check (decision_state in ('accepted', 'rejected', 'modified')),
  window_start      timestamptz not null,
  window_end        timestamptz not null,
  outcome_data      jsonb not null default '{}'::jsonb,
  outcome_summary   text not null default '',
  confounding_notes jsonb not null default '[]'::jsonb,
  evidence_ids      jsonb not null default '[]'::jsonb,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  constraint recommendation_outcomes_window_order_check
    check (window_end >= window_start)
);

create index if not exists idx_recommendation_outcomes_subject
  on recommendation_outcomes(subject_id, created_at desc);
create index if not exists idx_recommendation_outcomes_recommendation
  on recommendation_outcomes(recommendation_id, window_start);

comment on table public.recommendation_outcomes is
  'Observed outcomes linked to a real recommendation and subject. Records the decision state (accepted/rejected/modified), a bounded observation window, observed outcome data, and explicit confounding notes. Unlinked observations cannot be stored as recommendation efficacy evidence.';
comment on column public.recommendation_outcomes.subject_id is
  'Tenant scoping key. Must equal the subject that owns the recommendation (validated by record_recommendation_outcome).';
comment on column public.recommendation_outcomes.decision_state is
  'accepted | rejected | modified — how the creator acted on the recommendation.';
comment on column public.recommendation_outcomes.window_start is
  'Start of the experiment/observation window. Must be <= window_end.';
comment on column public.recommendation_outcomes.window_end is
  'End of the experiment/observation window. Must be >= window_start.';
comment on column public.recommendation_outcomes.outcome_data is
  'Observed outcome data (typed JSON, e.g. metric deltas). Absent metrics render Data needed; never invented precision.';
comment on column public.recommendation_outcomes.confounding_notes is
  'Explicit confounding factors (JSON array). Honest causal humility: outcomes without confounder accounting do not support efficacy claims.';
comment on column public.recommendation_outcomes.evidence_ids is
  'Evidence ledger ids supporting this observed outcome. Walkable to source and observation time when present.';

-- ===========================================================================
-- 2. Row Level Security — read via subject ownership, admin all.
--    No INSERT/UPDATE/DELETE policy for browser roles: the only write path is
--    the typed service-role RPC below.
-- ===========================================================================
alter table public.recommendation_outcomes enable row level security;

drop policy if exists recommendation_outcomes_select_own on public.recommendation_outcomes;
create policy recommendation_outcomes_select_own on public.recommendation_outcomes
  for select to authenticated
  using (public.owns_subject(subject_id));

drop policy if exists recommendation_outcomes_admin_all on public.recommendation_outcomes;
create policy recommendation_outcomes_admin_all on public.recommendation_outcomes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ===========================================================================
-- 3. Typed write RPC — validates subject ownership linkage, recommendation→
--    subject linkage (cross-subject rejection), decision state, and window
--    time ordering.  Service-role only.
-- ===========================================================================
create or replace function public.record_recommendation_outcome(
  p_subject_id        uuid,
  p_recommendation_id uuid,
  p_user_id           uuid,
  p_decision_state    text,
  p_window_start      timestamptz,
  p_window_end        timestamptz,
  p_outcome_data      jsonb default '{}'::jsonb,
  p_outcome_summary   text default '',
  p_confounding_notes jsonb default '[]'::jsonb,
  p_evidence_ids      jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id           uuid;
  v_subject_user uuid;
  v_rec_subject  uuid;
begin
  -- Subject ownership linkage: the subject must exist and belong to the user.
  select user_id into v_subject_user
  from public.subjects
  where id = p_subject_id;
  if not found then
    raise exception 'subject % not found', p_subject_id;
  end if;
  if v_subject_user is distinct from p_user_id then
    raise exception 'subject % is not owned by user %', p_subject_id, p_user_id;
  end if;

  -- Recommendation→subject linkage: the recommendation must belong to the
  -- same subject (cross-subject rejection).  Unlinked recommendations fail.
  select ir.subject_id into v_rec_subject
  from public.recommendations r
  join public.intelligence_runs ir on ir.id = r.intelligence_run_id
  where r.id = p_recommendation_id;
  if not found then
    raise exception 'recommendation % not found', p_recommendation_id;
  end if;
  if v_rec_subject is distinct from p_subject_id then
    raise exception 'recommendation % does not belong to subject %',
      p_recommendation_id, p_subject_id;
  end if;

  -- Decision state must be one of the typed states.
  if p_decision_state not in ('accepted', 'rejected', 'modified') then
    raise exception 'invalid decision_state: %', p_decision_state;
  end if;

  -- Bounded, ordered observation window.
  if p_window_start is null or p_window_end is null
     or p_window_end < p_window_start then
    raise exception 'outcome window must be ordered: window_start <= window_end';
  end if;

  insert into public.recommendation_outcomes (
    subject_id,
    recommendation_id,
    decision_state,
    window_start,
    window_end,
    outcome_data,
    outcome_summary,
    confounding_notes,
    evidence_ids,
    created_by
  ) values (
    p_subject_id,
    p_recommendation_id,
    p_decision_state,
    p_window_start,
    p_window_end,
    p_outcome_data,
    p_outcome_summary,
    p_confounding_notes,
    p_evidence_ids,
    p_user_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_recommendation_outcome(
  uuid, uuid, uuid, text, timestamptz, timestamptz, jsonb, text, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.record_recommendation_outcome(
  uuid, uuid, uuid, text, timestamptz, timestamptz, jsonb, text, jsonb, jsonb
) to service_role;

comment on function public.record_recommendation_outcome(
  uuid, uuid, uuid, text, timestamptz, timestamptz, jsonb, text, jsonb, jsonb
) is
  'Typed write path for recommendation outcomes. Validates subject ownership, recommendation→subject linkage (cross-subject rejection), decision state, and window ordering. Service-role only.';

-- ===========================================================================
-- 4. Grants — anonymous reads fail closed; browser roles may only SELECT via
--    RLS; service_role (worker) owns the write path through the RPC.
-- ===========================================================================
revoke all on public.recommendation_outcomes from anon;
revoke all on public.recommendation_outcomes from public;
grant select on public.recommendation_outcomes to authenticated;
grant all on public.recommendation_outcomes to service_role;
