-- ALM Intelligence v1 — persistence and domain kernel.
-- Additive migration: creates subjects, channels, Living Brief versions,
-- intelligence runs, evidence ledger, scores/findings/recommendations/decisions
-- with RLS and service-role RPCs.
--
-- Preserves existing accounts, audits, report versions, and observed-target
-- ownership semantics.  All new tables are additive; no existing table columns
-- are dropped or renamed.
--
-- Backfill strategy: existing accounts.accounts rows with ownership_status in
-- ('connected','managed') may optionally be promoted to subject_channels via
-- a future backfill RPC.  Observed-target semantics remain unchanged: public
-- audit targets live in audits and are never auto-promoted into subjects.
--
-- Idempotent: safe to re-run.

-- ===========================================================================
-- 1. Subjects — the parent entity in the longitudinal model.
-- ===========================================================================
create table if not exists public.subjects (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  name         text not null,
  subject_type text not null default 'creator'
    check (subject_type in ('person', 'creator', 'brand', 'organization', 'project')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_subjects_user on subjects(user_id, created_at desc);

comment on table public.subjects is
  'Parent entity for longitudinal intelligence. Represents a person, creator, brand, organization, or project.';
comment on column public.subjects.subject_type is
  'person | creator | brand | organization | project';

-- ===========================================================================
-- 2. Helper function (placed after subjects table for dependency)
-- ===========================================================================
create or replace function public.owns_subject(target_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subjects s
    where s.id = target_subject_id
      and s.user_id = auth.uid()
  );
$$;

-- ===========================================================================
-- 3. Subject channels — platforms owned by a subject.
-- ===========================================================================
create table if not exists public.subject_channels (
  id           uuid primary key default gen_random_uuid(),
  subject_id   uuid not null references public.subjects(id) on delete cascade,
  channel_type text not null
    check (channel_type in ('instagram', 'website', 'youtube', 'tiktok', 'x', 'linkedin')),
  locator      text not null,
  managed      boolean not null default false,
  account_id   uuid references public.accounts(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (subject_id, channel_type, locator)
);

create index if not exists idx_subject_channels_subject
  on subject_channels(subject_id, channel_type);

comment on table public.subject_channels is
  'Channels (Instagram, website, YouTube, etc.) belonging to a subject.';
comment on column public.subject_channels.managed is
  'True when the user has connected or explicitly manages this channel (OAuth or manual).';
comment on column public.subject_channels.account_id is
  'Optional backlink to the legacy accounts table for connected Instagram channels.';

-- ===========================================================================
-- 4. Living Brief versions — immutable, versioned context snapshots.
-- ===========================================================================
create table if not exists public.living_brief_versions (
  id            uuid primary key default gen_random_uuid(),
  subject_id    uuid not null references public.subjects(id) on delete cascade,
  version       integer not null check (version > 0),
  schema_version text not null default '1.0',
  identity      jsonb not null default '{}'::jsonb,
  audience      jsonb not null default '{}'::jsonb,
  positioning   jsonb not null default '{}'::jsonb,
  offers        jsonb not null default '[]'::jsonb,
  goals         jsonb not null default '[]'::jsonb,
  constraints   jsonb not null default '[]'::jsonb,
  experiments   jsonb not null default '[]'::jsonb,
  decisions     jsonb not null default '[]'::jsonb,
  confirmed     boolean not null default false,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (subject_id, version)
);

create index if not exists idx_living_brief_versions_subject
  on living_brief_versions(subject_id, version desc);

comment on table public.living_brief_versions is
  'Immutable versioned snapshots of a subject''s Living Brief context.';
comment on column public.living_brief_versions.confirmed is
  'True when a user has explicitly confirmed this version. Model proposals have confirmed=false.';

-- ===========================================================================
-- 5. Context update proposals — model-proposed edits for review.
-- ===========================================================================
create table if not exists public.context_update_proposals (
  id                  uuid primary key default gen_random_uuid(),
  subject_id          uuid not null references public.subjects(id) on delete cascade,
  base_version        integer not null check (base_version > 0),
  intelligence_run_id uuid,
  path                text not null,
  operation           text not null
    check (operation in ('add', 'replace', 'remove')),
  proposed_value      jsonb not null,
  evidence_ids        jsonb not null default '[]'::jsonb,
  reason              text not null default '',
  status              text not null default 'proposed'
    check (status in ('proposed', 'accepted', 'rejected', 'superseded')),
  decided_by          uuid references public.profiles(id) on delete set null,
  decided_at          timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists idx_context_update_proposals_subject
  on context_update_proposals(subject_id, status, created_at desc);

comment on table public.context_update_proposals is
  'Model-proposed edits to a Living Brief (diff format). Requires user review for identity, vision, goals, and constraints.';
comment on column public.context_update_proposals.path is
  'JSON Pointer path (RFC 6901) into the Living Brief document.';

-- ===========================================================================
-- 6. Audit batches — atomic, idempotent batch submissions.
-- ===========================================================================
create table if not exists public.audit_batches (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  subject_id      uuid not null references public.subjects(id) on delete cascade,
  status          text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  idempotency_key text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists idx_audit_batches_user on audit_batches(user_id, created_at desc);

comment on table public.audit_batches is
  'Atomic, idempotent batch of audits submitted together for one subject.';

-- ===========================================================================
-- 7. Batch-audit linking table.
-- ===========================================================================
create table if not exists public.batch_audits (
  batch_id uuid not null references public.audit_batches(id) on delete cascade,
  audit_id uuid not null references public.audits(id) on delete cascade,
  primary key (batch_id, audit_id)
);

comment on table public.batch_audits is
  'Links individual audits to their parent batch submission.';

-- ===========================================================================
-- 8. Intelligence runs — pinned contract versions and durable stage state.
-- ===========================================================================
create table if not exists public.intelligence_runs (
  id                    uuid primary key default gen_random_uuid(),
  subject_id            uuid not null references public.subjects(id) on delete cascade,
  brief_version         integer not null check (brief_version > 0),
  evidence_snapshot_id  uuid not null,
  batch_id              uuid references public.audit_batches(id) on delete set null,
  methodology_version   text not null,
  expertise_pack_version text not null,
  prompt_version        text not null,
  model_config_hash     text not null,
  output_schema_version text not null default '1.0',
  stage_state           jsonb not null default '{}'::jsonb,
  status                text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  latency_ms            integer,
  tokens_in             integer not null default 0,
  tokens_out            integer not null default 0,
  cost_usd              numeric(12,6) not null default 0,
  cache_mode            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_intelligence_runs_subject
  on intelligence_runs(subject_id, created_at desc);
create index if not exists idx_intelligence_runs_status
  on intelligence_runs(status, created_at);

comment on table public.intelligence_runs is
  'Immutable record of an intelligence-generation run with pinned contract versions and durable stage state for resume.';

-- ===========================================================================
-- 9. Evidence snapshots — lightweight grouping for run-level evidence sets.
-- ===========================================================================
create table if not exists public.evidence_snapshots (
  id         uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.evidence_snapshots is
  'Grouping key for evidence items captured during one intelligence run.';

-- Add FK from intelligence_runs to evidence_snapshots (deferred because
-- evidence_snapshots is created after intelligence_runs).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_intelligence_runs_evidence_snapshot'
  ) then
    alter table public.intelligence_runs
      add constraint fk_intelligence_runs_evidence_snapshot
      foreign key (evidence_snapshot_id) references public.evidence_snapshots(id)
      on delete restrict;
  end if;
end $$;

-- ===========================================================================
-- 10. Evidence ledger — validated, versioned evidence items.
-- ===========================================================================
create table if not exists public.evidence (
  id           uuid primary key default gen_random_uuid(),
  subject_id   uuid not null references public.subjects(id) on delete cascade,
  channel_id   uuid references public.subject_channels(id) on delete set null,
  snapshot_id  uuid references public.evidence_snapshots(id) on delete cascade,
  source_type  text not null
    check (source_type in ('connected_api', 'official_web', 'public_web', 'user_context', 'methodology')),
  source_url   text,
  observed_at  timestamptz not null,
  expires_at   timestamptz,
  content_hash text not null check (char_length(content_hash) >= 16),
  confidence   text not null
    check (confidence in ('low', 'medium', 'high', 'authoritative')),
  coverage     jsonb not null default '{}'::jsonb,
  payload      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  unique (subject_id, content_hash)
);

create index if not exists idx_evidence_subject on evidence(subject_id, observed_at desc);
create index if not exists idx_evidence_snapshot on evidence(snapshot_id);
create index if not exists idx_evidence_channel on evidence(channel_id);

comment on table public.evidence is
  'Validated, versioned evidence ledger. Every factual finding and score rationale resolves to evidence IDs in this table.';
comment on column public.evidence.confidence is
  'low | medium | high | authoritative';

-- ===========================================================================
-- 11. Scores ledger — per-dimension scores with change tracking.
-- ===========================================================================
create table if not exists public.scores (
  id                  uuid primary key default gen_random_uuid(),
  intelligence_run_id uuid not null references public.intelligence_runs(id) on delete cascade,
  dimension           text not null,
  value               numeric(5,1) check (value is null or (value >= 0 and value <= 100)),
  previous_value      numeric(5,1) check (previous_value is null or (previous_value >= 0 and previous_value <= 100)),
  evidence_ids        jsonb not null default '[]'::jsonb,
  methodology_version text not null,
  change_kind         text
    check (change_kind is null or change_kind in ('evidence', 'brief_lens', 'methodology', 'prior_correction')),
  created_at          timestamptz not null default now()
);

create index if not exists idx_scores_run on scores(intelligence_run_id, dimension);

comment on table public.scores is
  'Per-dimension scores with evidence backing and change attribution. Null value means Data needed.';
comment on column public.scores.change_kind is
  'What caused the score change: evidence, brief/lens, methodology, or prior correction.';

-- ===========================================================================
-- 12. Findings ledger — analysis findings with dimension impacts.
-- ===========================================================================
create table if not exists public.findings (
  id                  uuid primary key default gen_random_uuid(),
  intelligence_run_id uuid not null references public.intelligence_runs(id) on delete cascade,
  finding_ref         text not null,
  claim               text not null,
  evidence_ids        jsonb not null default '[]'::jsonb,
  confidence          text not null
    check (confidence in ('low', 'medium', 'high')),
  dimension_impacts   jsonb not null default '{}'::jsonb,
  channel_type        text
    check (channel_type is null or channel_type in ('instagram', 'website', 'youtube', 'tiktok', 'x', 'linkedin')),
  created_at          timestamptz not null default now()
);

create index if not exists idx_findings_run on findings(intelligence_run_id);

comment on table public.findings is
  'Analysis findings with confidence ratings, evidence backing, and dimension impacts.';

-- ===========================================================================
-- 13. Recommendations ledger — actionable recommendations with status.
-- ===========================================================================
create table if not exists public.recommendations (
  id                  uuid primary key default gen_random_uuid(),
  intelligence_run_id uuid not null references public.intelligence_runs(id) on delete cascade,
  recommendation_ref  text not null,
  content             jsonb not null default '{}'::jsonb,
  evidence_ids        jsonb not null default '[]'::jsonb,
  status              text not null default 'proposed'
    check (status in ('proposed', 'accepted', 'rejected', 'implemented', 'superseded')),
  channel_type        text
    check (channel_type is null or channel_type in ('instagram', 'website', 'youtube', 'tiktok', 'x', 'linkedin')),
  created_at          timestamptz not null default now()
);

create index if not exists idx_recommendations_run on recommendations(intelligence_run_id);

comment on table public.recommendations is
  'Actionable recommendations with status tracking. Rejected recommendations do not reappear without new evidence.';

-- ===========================================================================
-- 14. Decisions ledger — user decisions on proposals and recommendations.
-- ===========================================================================
create table if not exists public.decisions (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references public.subjects(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  target_type text not null
    check (target_type in ('proposal', 'recommendation')),
  target_id   uuid not null,
  decision    text not null
    check (decision in ('accepted', 'rejected', 'superseded')),
  note        text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists idx_decisions_subject on decisions(subject_id, created_at desc);
create index if not exists idx_decisions_target on decisions(target_type, target_id);

comment on table public.decisions is
  'User decisions on context update proposals and recommendations. Durable audit trail.';

-- ===========================================================================
-- 15. updated_at triggers
-- ===========================================================================
drop trigger if exists set_subjects_updated_at on public.subjects;
create trigger set_subjects_updated_at
  before update on public.subjects
  for each row execute function public.set_updated_at();

drop trigger if exists set_audit_batches_updated_at on public.audit_batches;
create trigger set_audit_batches_updated_at
  before update on public.audit_batches
  for each row execute function public.set_updated_at();

drop trigger if exists set_intelligence_runs_updated_at on public.intelligence_runs;
create trigger set_intelligence_runs_updated_at
  before update on public.intelligence_runs
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- 16. Row Level Security
-- ===========================================================================
alter table public.subjects enable row level security;
alter table public.subject_channels enable row level security;
alter table public.living_brief_versions enable row level security;
alter table public.context_update_proposals enable row level security;
alter table public.audit_batches enable row level security;
alter table public.batch_audits enable row level security;
alter table public.intelligence_runs enable row level security;
alter table public.evidence_snapshots enable row level security;
alter table public.evidence enable row level security;
alter table public.scores enable row level security;
alter table public.findings enable row level security;
alter table public.recommendations enable row level security;
alter table public.decisions enable row level security;

-- ---------------------------------------------------------------------------
-- 16a. subjects
-- ---------------------------------------------------------------------------
drop policy if exists subjects_select_own on public.subjects;
create policy subjects_select_own on public.subjects
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists subjects_admin_all on public.subjects;
create policy subjects_admin_all on public.subjects
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 16b. subject_channels — read via subject ownership
-- ---------------------------------------------------------------------------
drop policy if exists subject_channels_select_own on public.subject_channels;
create policy subject_channels_select_own on public.subject_channels
  for select to authenticated
  using (public.owns_subject(subject_id));

drop policy if exists subject_channels_admin_all on public.subject_channels;
create policy subject_channels_admin_all on public.subject_channels
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 16c. living_brief_versions — read via subject ownership
-- ---------------------------------------------------------------------------
drop policy if exists living_brief_versions_select_own on public.living_brief_versions;
create policy living_brief_versions_select_own on public.living_brief_versions
  for select to authenticated
  using (public.owns_subject(subject_id));

drop policy if exists living_brief_versions_admin_all on public.living_brief_versions;
create policy living_brief_versions_admin_all on public.living_brief_versions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 16d. context_update_proposals — read via subject ownership
-- ---------------------------------------------------------------------------
drop policy if exists context_update_proposals_select_own on public.context_update_proposals;
create policy context_update_proposals_select_own on public.context_update_proposals
  for select to authenticated
  using (public.owns_subject(subject_id));

drop policy if exists context_update_proposals_admin_all on public.context_update_proposals;
create policy context_update_proposals_admin_all on public.context_update_proposals
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 16e. audit_batches — read own, admin all
-- ---------------------------------------------------------------------------
drop policy if exists audit_batches_select_own on public.audit_batches;
create policy audit_batches_select_own on public.audit_batches
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists audit_batches_admin_all on public.audit_batches;
create policy audit_batches_admin_all on public.audit_batches
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 16f. batch_audits — read via batch ownership
-- ---------------------------------------------------------------------------
drop policy if exists batch_audits_select_own on public.batch_audits;
create policy batch_audits_select_own on public.batch_audits
  for select to authenticated
  using (exists (
    select 1 from public.audit_batches b
    where b.id = batch_audits.batch_id
      and b.user_id = auth.uid()
  ));

drop policy if exists batch_audits_admin_all on public.batch_audits;
create policy batch_audits_admin_all on public.batch_audits
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 16g. intelligence_runs — read via subject ownership
-- ---------------------------------------------------------------------------
drop policy if exists intelligence_runs_select_own on public.intelligence_runs;
create policy intelligence_runs_select_own on public.intelligence_runs
  for select to authenticated
  using (public.owns_subject(subject_id));

drop policy if exists intelligence_runs_admin_all on public.intelligence_runs;
create policy intelligence_runs_admin_all on public.intelligence_runs
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 16h. evidence_snapshots — read via subject ownership
-- ---------------------------------------------------------------------------
drop policy if exists evidence_snapshots_select_own on public.evidence_snapshots;
create policy evidence_snapshots_select_own on public.evidence_snapshots
  for select to authenticated
  using (public.owns_subject(subject_id));

drop policy if exists evidence_snapshots_admin_all on public.evidence_snapshots;
create policy evidence_snapshots_admin_all on public.evidence_snapshots
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 16i. evidence — read via subject ownership
-- ---------------------------------------------------------------------------
drop policy if exists evidence_select_own on public.evidence;
create policy evidence_select_own on public.evidence
  for select to authenticated
  using (public.owns_subject(subject_id));

drop policy if exists evidence_admin_all on public.evidence;
create policy evidence_admin_all on public.evidence
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 16j. scores — read via subject ownership (through intelligence_run)
-- ---------------------------------------------------------------------------
drop policy if exists scores_select_own on public.scores;
create policy scores_select_own on public.scores
  for select to authenticated
  using (exists (
    select 1 from public.intelligence_runs r
    where r.id = scores.intelligence_run_id
      and public.owns_subject(r.subject_id)
  ));

drop policy if exists scores_admin_all on public.scores;
create policy scores_admin_all on public.scores
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 16k. findings — read via subject ownership (through intelligence_run)
-- ---------------------------------------------------------------------------
drop policy if exists findings_select_own on public.findings;
create policy findings_select_own on public.findings
  for select to authenticated
  using (exists (
    select 1 from public.intelligence_runs r
    where r.id = findings.intelligence_run_id
      and public.owns_subject(r.subject_id)
  ));

drop policy if exists findings_admin_all on public.findings;
create policy findings_admin_all on public.findings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 16l. recommendations — read via subject ownership (through intelligence_run)
-- ---------------------------------------------------------------------------
drop policy if exists recommendations_select_own on public.recommendations;
create policy recommendations_select_own on public.recommendations
  for select to authenticated
  using (exists (
    select 1 from public.intelligence_runs r
    where r.id = recommendations.intelligence_run_id
      and public.owns_subject(r.subject_id)
  ));

drop policy if exists recommendations_admin_all on public.recommendations;
create policy recommendations_admin_all on public.recommendations
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 16m. decisions — read own decisions
-- ---------------------------------------------------------------------------
drop policy if exists decisions_select_own on public.decisions;
create policy decisions_select_own on public.decisions
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists decisions_admin_all on public.decisions;
create policy decisions_admin_all on public.decisions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ===========================================================================
-- 17. Service-role RPCs
-- ===========================================================================

-- 17a. create_subject — creates a new subject, returns its id.
-- ===========================================================================
create or replace function public.create_subject(
  p_user_id uuid,
  p_name text,
  p_subject_type text default 'creator'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.subjects (user_id, name, subject_type)
  values (p_user_id, p_name, p_subject_type)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_subject(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.create_subject(uuid, text, text)
  to service_role;

-- 17b. link_subject_channel — add a channel to a subject.
-- ===========================================================================
create or replace function public.link_subject_channel(
  p_subject_id uuid,
  p_channel_type text,
  p_locator text,
  p_managed boolean default false,
  p_account_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.subject_channels (subject_id, channel_type, locator, managed, account_id)
  values (p_subject_id, p_channel_type, p_locator, p_managed, p_account_id)
  on conflict (subject_id, channel_type, locator) do update
    set managed = excluded.managed,
        account_id = coalesce(excluded.account_id, subject_channels.account_id)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.link_subject_channel(uuid, text, text, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.link_subject_channel(uuid, text, text, boolean, uuid)
  to service_role;

-- 17c. record_living_brief_version — creates an immutable brief version.
-- ===========================================================================
create or replace function public.record_living_brief_version(
  p_subject_id uuid,
  p_version integer,
  p_schema_version text,
  p_identity jsonb,
  p_audience jsonb,
  p_positioning jsonb,
  p_offers jsonb,
  p_goals jsonb,
  p_constraints jsonb,
  p_experiments jsonb,
  p_decisions jsonb,
  p_created_by uuid default null,
  p_confirmed boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.living_brief_versions (
    subject_id, version, schema_version,
    identity, audience, positioning, offers, goals, constraints,
    experiments, decisions, created_by, confirmed
  ) values (
    p_subject_id, p_version, p_schema_version,
    p_identity, p_audience, p_positioning, p_offers, p_goals, p_constraints,
    p_experiments, p_decisions, p_created_by, p_confirmed
  )
  on conflict (subject_id, version) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_living_brief_version(uuid, integer, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.record_living_brief_version(uuid, integer, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, boolean)
  to service_role;

-- 17d. create_context_update_proposals — bulk insert proposals from analysis.
-- ===========================================================================
create or replace function public.create_context_update_proposals(
  p_proposals jsonb
)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _prop jsonb;
  _id uuid;
begin
  for _prop in select * from jsonb_array_elements(p_proposals) loop
    insert into public.context_update_proposals (
      subject_id, base_version, intelligence_run_id,
      path, operation, proposed_value, evidence_ids, reason
    ) values (
      (_prop->>'subject_id')::uuid,
      (_prop->>'base_version')::integer,
      (_prop->>'intelligence_run_id')::uuid,
      _prop->>'path',
      _prop->>'operation',
      _prop->'proposed_value',
      coalesce(_prop->'evidence_ids', '[]'::jsonb),
      coalesce(_prop->>'reason', '')
    )
    returning id into _id;
    return next _id;
  end loop;
  return;
end;
$$;

revoke all on function public.create_context_update_proposals(jsonb)
  from public, anon, authenticated;
grant execute on function public.create_context_update_proposals(jsonb)
  to service_role;

-- 17e. resolve_context_update_proposal — user accepts or rejects a proposal.
-- ===========================================================================
create or replace function public.resolve_context_update_proposal(
  p_proposal_id uuid,
  p_status text,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.context_update_proposals
  set status = p_status,
      decided_by = p_user_id,
      decided_at = now()
  where id = p_proposal_id
    and status = 'proposed';

  if not found then
    raise exception 'Proposal % not found or not in proposed state', p_proposal_id;
  end if;
end;
$$;

revoke all on function public.resolve_context_update_proposal(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_context_update_proposal(uuid, text, uuid)
  to service_role;

-- 17f. create_audit_batch — idempotent batch creation.
-- ===========================================================================
create or replace function public.create_audit_batch(
  p_user_id uuid,
  p_subject_id uuid,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.audit_batches (user_id, subject_id, idempotency_key)
  values (p_user_id, p_subject_id, p_idempotency_key)
  on conflict (user_id, idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.audit_batches
    where user_id = p_user_id and idempotency_key = p_idempotency_key;
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_audit_batch(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_audit_batch(uuid, uuid, text)
  to service_role;

-- 17g. add_audit_to_batch — link an audit to its batch.
-- ===========================================================================
create or replace function public.add_audit_to_batch(
  p_batch_id uuid,
  p_audit_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.batch_audits (batch_id, audit_id)
  values (p_batch_id, p_audit_id)
  on conflict (batch_id, audit_id) do nothing;
end;
$$;

revoke all on function public.add_audit_to_batch(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.add_audit_to_batch(uuid, uuid)
  to service_role;

-- 17h. start_intelligence_run — create a new run record.
-- ===========================================================================
create or replace function public.start_intelligence_run(
  p_subject_id uuid,
  p_brief_version integer,
  p_evidence_snapshot_id uuid,
  p_methodology_version text,
  p_expertise_pack_version text,
  p_prompt_version text,
  p_model_config_hash text,
  p_output_schema_version text default '1.0',
  p_batch_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.intelligence_runs (
    subject_id, brief_version, evidence_snapshot_id, batch_id,
    methodology_version, expertise_pack_version, prompt_version,
    model_config_hash, output_schema_version
  ) values (
    p_subject_id, p_brief_version, p_evidence_snapshot_id, p_batch_id,
    p_methodology_version, p_expertise_pack_version, p_prompt_version,
    p_model_config_hash, p_output_schema_version
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.start_intelligence_run(uuid, integer, uuid, text, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.start_intelligence_run(uuid, integer, uuid, text, text, text, text, text, uuid)
  to service_role;

-- 17i. finalize_intelligence_run — mark complete and record telemetry.
-- ===========================================================================
create or replace function public.finalize_intelligence_run(
  p_run_id uuid,
  p_status text,
  p_latency_ms integer,
  p_tokens_in integer,
  p_tokens_out integer,
  p_cost_usd numeric,
  p_cache_mode text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.intelligence_runs
  set status = p_status,
      latency_ms = coalesce(p_latency_ms, latency_ms),
      tokens_in = coalesce(p_tokens_in, tokens_in),
      tokens_out = coalesce(p_tokens_out, tokens_out),
      cost_usd = coalesce(p_cost_usd, cost_usd),
      cache_mode = coalesce(p_cache_mode, cache_mode),
      updated_at = now()
  where id = p_run_id;

  if not found then
    raise exception 'Intelligence run % not found', p_run_id;
  end if;
end;
$$;

revoke all on function public.finalize_intelligence_run(uuid, text, integer, integer, integer, numeric, text)
  from public, anon, authenticated;
grant execute on function public.finalize_intelligence_run(uuid, text, integer, integer, integer, numeric, text)
  to service_role;

-- 17j. create_evidence_snapshot — create a snapshot grouping.
-- ===========================================================================
create or replace function public.create_evidence_snapshot(
  p_subject_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.evidence_snapshots (subject_id)
  values (p_subject_id)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_evidence_snapshot(uuid)
  from public, anon, authenticated;
grant execute on function public.create_evidence_snapshot(uuid)
  to service_role;

-- 17k. upsert_evidence — bulk upsert evidence items (idempotent by content_hash).
-- ===========================================================================
create or replace function public.upsert_evidence(
  p_items jsonb
)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _item jsonb;
  _id uuid;
begin
  for _item in select * from jsonb_array_elements(p_items) loop
    insert into public.evidence (
      subject_id, channel_id, snapshot_id,
      source_type, source_url, observed_at, expires_at,
      content_hash, confidence, coverage, payload
    ) values (
      (_item->>'subject_id')::uuid,
      (_item->>'channel_id')::uuid,
      (_item->>'snapshot_id')::uuid,
      _item->>'source_type',
      nullif(_item->>'source_url', ''),
      (_item->>'observed_at')::timestamptz,
      case when _item ? 'expires_at' and _item->>'expires_at' is not null
           then (_item->>'expires_at')::timestamptz else null end,
      _item->>'content_hash',
      _item->>'confidence',
      coalesce(_item->'coverage', '{}'::jsonb),
      coalesce(_item->'payload', '{}'::jsonb)
    )
    on conflict (subject_id, content_hash) do nothing
    returning id into _id;
    return next _id;
  end loop;
  return;
end;
$$;

revoke all on function public.upsert_evidence(jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_evidence(jsonb)
  to service_role;

-- 17l. record_scores — bulk insert scores.
-- ===========================================================================
create or replace function public.record_scores(
  p_scores jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _s jsonb;
begin
  for _s in select * from jsonb_array_elements(p_scores) loop
    insert into public.scores (
      intelligence_run_id, dimension, value, evidence_ids, methodology_version
    ) values (
      (_s->>'run_id')::uuid,
      _s->>'dimension',
      case when _s->>'value' is null then null
           else (_s->>'value')::numeric end,
      coalesce(_s->'evidence_ids', '[]'::jsonb),
      _s->>'methodology_version'
    );
  end loop;
end;
$$;

revoke all on function public.record_scores(jsonb)
  from public, anon, authenticated;
grant execute on function public.record_scores(jsonb)
  to service_role;

-- 17m. record_findings — bulk insert findings.
-- ===========================================================================
create or replace function public.record_findings(
  p_findings jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _f jsonb;
begin
  for _f in select * from jsonb_array_elements(p_findings) loop
    insert into public.findings (
      intelligence_run_id, finding_ref, claim, evidence_ids, confidence,
      dimension_impacts, channel_type
    ) values (
      (_f->>'run_id')::uuid,
      _f->>'finding_ref',
      _f->>'claim',
      coalesce(_f->'evidence_ids', '[]'::jsonb),
      _f->>'confidence',
      coalesce(_f->'dimension_impacts', '{}'::jsonb),
      nullif(_f->>'channel_type', '')
    );
  end loop;
end;
$$;

revoke all on function public.record_findings(jsonb)
  from public, anon, authenticated;
grant execute on function public.record_findings(jsonb)
  to service_role;

-- 17n. record_recommendations — bulk insert recommendations.
-- ===========================================================================
create or replace function public.record_recommendations(
  p_recommendations jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _r jsonb;
begin
  for _r in select * from jsonb_array_elements(p_recommendations) loop
    insert into public.recommendations (
      intelligence_run_id, recommendation_ref, content, evidence_ids, channel_type
    ) values (
      (_r->>'run_id')::uuid,
      _r->>'recommendation_ref',
      coalesce(_r->'content', '{}'::jsonb),
      coalesce(_r->'evidence_ids', '[]'::jsonb),
      nullif(_r->>'channel_type', '')
    );
  end loop;
end;
$$;

revoke all on function public.record_recommendations(jsonb)
  from public, anon, authenticated;
grant execute on function public.record_recommendations(jsonb)
  to service_role;

-- 17o. record_decision — record a user decision on a proposal or recommendation.
-- ===========================================================================
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
begin
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

-- ===========================================================================
-- 18. Revoke anon access from sensitive new tables
-- ===========================================================================
revoke all on public.subjects from anon;
revoke all on public.subject_channels from anon;
revoke all on public.living_brief_versions from anon;
revoke all on public.context_update_proposals from anon;
revoke all on public.audit_batches from anon;
revoke all on public.batch_audits from anon;
revoke all on public.intelligence_runs from anon;
revoke all on public.evidence_snapshots from anon;
revoke all on public.evidence from anon;
revoke all on public.scores from anon;
revoke all on public.findings from anon;
revoke all on public.recommendations from anon;
revoke all on public.decisions from anon;

grant all on public.subjects to authenticated, service_role;
grant all on public.subject_channels to authenticated, service_role;
grant all on public.living_brief_versions to authenticated, service_role;
grant all on public.context_update_proposals to authenticated, service_role;
grant all on public.audit_batches to authenticated, service_role;
grant all on public.batch_audits to authenticated, service_role;
grant all on public.intelligence_runs to authenticated, service_role;
grant all on public.evidence_snapshots to authenticated, service_role;
grant all on public.evidence to authenticated, service_role;
grant all on public.scores to authenticated, service_role;
grant all on public.findings to authenticated, service_role;
grant all on public.recommendations to authenticated, service_role;
grant all on public.decisions to authenticated, service_role;

-- ===========================================================================
-- 19. Backfill strategy (documentation only)
-- ===========================================================================
-- Existing accounts with ownership_status in ('connected', 'managed') can be
-- promoted to subjects and channels via a future backfill RPC.  The pattern:
--
--   1. For each user with connected/managed accounts, create a subject (if none).
--   2. Link each qualifying account as a subject_channel with managed=true and
--      account_id pointing to the existing accounts row.
--   3. Create a confirmed living_brief_version v1 with minimal identity derived
--      from the account metadata.
--
-- Observed targets (audits without connected accounts) remain in audits and are
-- never auto-promoted.  The subject_channels.account_id column provides a
-- read-path for the backfill without requiring data migration.
-- ===========================================================================

-- ===========================================================================
-- 20. Living Brief immutability trigger — reject UPDATE and DELETE.
-- ===========================================================================
create or replace function public.reject_living_brief_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'living_brief_versions is immutable — UPDATE and DELETE are rejected';
  end if;
  return null;
end;
$$;

drop trigger if exists reject_living_brief_mutation
  on public.living_brief_versions;
create trigger reject_living_brief_mutation
  before update or delete on public.living_brief_versions
  for each row execute function public.reject_living_brief_mutation();

comment on function public.reject_living_brief_mutation() is
  'Enforces Living Brief immutability: UPDATE and DELETE are rejected by the database.';

-- ===========================================================================
-- 21. Relational consistency FKs (additive ALTER TABLE, idempotent).
-- ===========================================================================
do $$
begin
  -- 21a. intelligence_runs (subject_id, brief_version) must reference a real
  --      living_brief_versions row for that subject.
  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_intelligence_runs_brief_version'
  ) then
    alter table public.intelligence_runs
      add constraint fk_intelligence_runs_brief_version
      foreign key (subject_id, brief_version)
      references public.living_brief_versions(subject_id, version)
      on delete restrict;
  end if;

  -- 21b. context_update_proposals.intelligence_run_id must reference a real run.
  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_context_update_proposals_run'
  ) then
    alter table public.context_update_proposals
      add constraint fk_context_update_proposals_run
      foreign key (intelligence_run_id)
      references public.intelligence_runs(id)
      on delete set null;
  end if;
end $$;

-- ===========================================================================
-- 22. Atomic, idempotent batch-submission RPC.
--     Replaces the two-step create_audit_batch + add_audit_to_batch pattern.
--     Creates the batch row and links every audit in a single transaction.
--     Validates subject ownership and audit ownership.
--     Idempotent: returns the existing batch on key collision.
-- ===========================================================================
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
  -- Validate subject is owned by the user.
  if not exists (
    select 1 from public.subjects
    where id = p_subject_id and user_id = p_user_id
  ) then
    raise exception 'subject % is not owned by user %', p_subject_id, p_user_id;
  end if;

  -- Idempotency: return the existing batch if this key was already submitted.
  select id into v_batch_id
  from public.audit_batches
  where user_id = p_user_id and idempotency_key = p_idempotency_key;

  if v_batch_id is not null then
    return v_batch_id;
  end if;

  -- Validate every audit belongs to the user.
  foreach v_audit_id in array p_audit_ids loop
    if not exists (
      select 1 from public.audits
      where id = v_audit_id and user_id = p_user_id
    ) then
      raise exception 'audit % is not owned by user %', v_audit_id, p_user_id;
    end if;
  end loop;

  -- Create the batch row and link every audit in one atomic block.
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
  'Atomic, idempotent batch submission. Validates subject/audit ownership, creates the batch and all audit links in one transaction. Returns the existing batch on idempotency-key collision.';

-- Preserve the original RPCs for backward compatibility during rollout;
-- they delegate to the atomic RPC internally.
-- ===========================================================================
create or replace function public.create_audit_batch(
  p_user_id uuid,
  p_subject_id uuid,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Legacy compatibility shim: create an empty batch.
  -- Prefer submit_audit_batch for new callers.
  return public.submit_audit_batch(p_user_id, p_subject_id, p_idempotency_key, array[]::uuid[]);
end;
$$;

revoke all on function public.create_audit_batch(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_audit_batch(uuid, uuid, text)
  to service_role;

create or replace function public.add_audit_to_batch(
  p_batch_id uuid,
  p_audit_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.batch_audits (batch_id, audit_id)
  values (p_batch_id, p_audit_id)
  on conflict (batch_id, audit_id) do nothing;
end;
$$;

revoke all on function public.add_audit_to_batch(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.add_audit_to_batch(uuid, uuid)
  to service_role;

-- ===========================================================================
-- 23. Same-tenant consistency enforcement.
--     Updated versions of RPCs that validate cross-entity ownership.
-- ===========================================================================

-- 23a. link_subject_channel — validate account_id belongs to same user.
-- ===========================================================================
create or replace function public.link_subject_channel(
  p_subject_id uuid,
  p_channel_type text,
  p_locator text,
  p_managed boolean default false,
  p_account_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_subject_user_id uuid;
begin
  -- Resolve the subject's owner for cross-entity validation.
  select user_id into v_subject_user_id
  from public.subjects where id = p_subject_id;
  if not found then
    raise exception 'subject % not found', p_subject_id;
  end if;

  -- If an account_id is supplied, it must belong to the same user as the subject.
  if p_account_id is not null then
    if not exists (
      select 1 from public.accounts
      where id = p_account_id and user_id = v_subject_user_id
    ) then
      raise exception 'account % does not belong to user %', p_account_id, v_subject_user_id;
    end if;
  end if;

  insert into public.subject_channels (subject_id, channel_type, locator, managed, account_id)
  values (p_subject_id, p_channel_type, p_locator, p_managed, p_account_id)
  on conflict (subject_id, channel_type, locator) do update
    set managed = excluded.managed,
        account_id = coalesce(excluded.account_id, subject_channels.account_id)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.link_subject_channel(uuid, text, text, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.link_subject_channel(uuid, text, text, boolean, uuid)
  to service_role;

-- 23b. resolve_context_update_proposal — validate proposal belongs to user.
-- ===========================================================================
create or replace function public.resolve_context_update_proposal(
  p_proposal_id uuid,
  p_status text,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Validate that the user owns the subject the proposal targets.
  if not exists (
    select 1
    from public.context_update_proposals cup
    join public.subjects s on s.id = cup.subject_id
    where cup.id = p_proposal_id
      and cup.status = 'proposed'
      and s.user_id = p_user_id
  ) then
    raise exception 'proposal % not found, not in proposed state, or not owned by user %',
      p_proposal_id, p_user_id;
  end if;

  update public.context_update_proposals
  set status = p_status,
      decided_by = p_user_id,
      decided_at = now()
  where id = p_proposal_id
    and status = 'proposed';
end;
$$;

revoke all on function public.resolve_context_update_proposal(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_context_update_proposal(uuid, text, uuid)
  to service_role;

-- 23c. record_decision — validate target belongs to the specified subject.
-- ===========================================================================
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
  -- Validate the target belongs to the subject.
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

-- ===========================================================================
-- 24. Bounded compatibility backfill RPC.
--     Promotes only connected/managed accounts into subjects and channels.
--     Observed targets are never promoted.  Idempotent: safe to re-run.
-- ===========================================================================
create or replace function public.backfill_connected_subjects()
returns table(action text, detail text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account record;
  v_subject_id uuid;
  v_subject_name text;
begin
  for v_account in
    select a.id, a.user_id, a.handle, a.platform, a.display_name
    from public.accounts a
    where a.ownership_status in ('connected', 'managed')
      and not exists (
        select 1 from public.subject_channels sc
        where sc.account_id = a.id
      )
  loop
    -- Get or create a subject for this user.
    select id into v_subject_id
    from public.subjects
    where user_id = v_account.user_id
    order by created_at limit 1;

    if v_subject_id is null then
      v_subject_name := coalesce(nullif(v_account.display_name, ''), v_account.handle);
      insert into public.subjects (user_id, name, subject_type)
      values (v_account.user_id, v_subject_name, 'creator')
      returning id into v_subject_id;
      action := 'created_subject';
      detail := format('subject %s for user %s', v_subject_id, v_account.user_id);
      return next;
    end if;

    -- Link channel, skip duplicates.
    insert into public.subject_channels (subject_id, channel_type, locator, managed, account_id)
    values (v_subject_id, v_account.platform, v_account.handle, true, v_account.id)
    on conflict (subject_id, channel_type, locator) do nothing;

    action := 'linked_channel';
    detail := format('channel %s/%s → subject %s', v_account.platform, v_account.handle, v_subject_id);
    return next;
  end loop;
end;
$$;

revoke all on function public.backfill_connected_subjects()
  from public, anon, authenticated;
grant execute on function public.backfill_connected_subjects()
  to service_role;

comment on function public.backfill_connected_subjects() is
  'Backfill: promotes connected/managed accounts into subjects and channels. Observed targets are never promoted. Idempotent.';

-- ===========================================================================
-- 25. Revised backfill strategy
-- ===========================================================================
-- The backfill_connected_subjects() RPC (section 24) implements the documented
-- strategy from section 19.  It is safe to run at any time:
--
--   1. Only accounts with ownership_status IN ('connected','managed') are
--      eligible.  Observed-target audits are never promoted.
--   2. Each user gets one subject (earliest-created).  Additional accounts
--      become channels on the same subject.
--   3. Channels are linked with managed=true and account_id back-reference.
--   4. Fully idempotent: re-running produces no duplicates and no extra subjects.
--
-- A confirmed living_brief_version v1 is not created automatically; that step
-- requires business input (identity, goals, audience) that cannot be inferred
-- from account metadata alone.
