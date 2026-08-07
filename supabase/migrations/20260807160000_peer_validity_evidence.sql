-- Peer validity evidence columns — same-tier peer auditor (ALM-I-024 / W015).
--
-- The deterministic peer-validity auditor
-- (worker/auditlayer_worker/intelligence/peer_validity.py) requires
-- provenance and relationship evidence before a cached peer_graph row can be
-- projected toward the bounded report prompt as a candidate lead. This
-- additive migration stores that evidence on the existing peer_graph table
-- with fail-closed defaults:
--
--   source_url            non-empty provenance source; '' = missing
--   source_observed_at    when the source was observed (nullable); NULL and
--                         '' both render "Data needed: PEER_MISSING_PROVENANCE"
--   verification_status   stored verification result; fail-closed default
--                         'unverified' (live validity stays UNKNOWN offline;
--                         'failed' rejects as PEER_HANDLE_UNVERIFIABLE)
--   relationship_status   relationship framing; fail-closed default 'unknown'
--                         maps to neutral framing unless evidence supports
--                         collaborator/competitor
--   relationship_evidence JSON array of {kind, source_url, observed_at, note}
--                         entries; contradictory collaborator+competitor
--                         evidence is rejected deterministically
--
-- Additive only: no table is created or dropped, no column is altered or
-- removed, no policy is changed, RLS remains enabled on peer_graph, and no
-- browser role is granted. Existing rows keep their cached handle/niche/
-- followers/metrics; they simply fail closed until evidence is backfilled.
-- Live web verification is intentionally outside this contract.

-- ---------------------------------------------------------------------------
-- 1. Additive provenance + relationship evidence columns.
-- ---------------------------------------------------------------------------
alter table public.peer_graph
  add column if not exists source_url text not null default '',
  add column if not exists source_observed_at timestamptz,
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists relationship_status text not null default 'unknown',
  add column if not exists relationship_evidence jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. Fail-closed allowlists enforced at the schema boundary.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'peer_graph_verification_status_check'
      and conrelid = 'public.peer_graph'::regclass
  ) then
    alter table public.peer_graph
      add constraint peer_graph_verification_status_check
      check (verification_status in ('unverified', 'verified', 'failed'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'peer_graph_relationship_status_check'
      and conrelid = 'public.peer_graph'::regclass
  ) then
    alter table public.peer_graph
      add constraint peer_graph_relationship_status_check
      check (relationship_status in ('unknown', 'collaborator', 'competitor'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Comments (founder-operable documentation at the schema level).
-- ---------------------------------------------------------------------------
comment on column public.peer_graph.source_url is
  'Provenance: URL where this peer row was observed. Empty string means missing evidence (PEER_MISSING_PROVENANCE).';
comment on column public.peer_graph.source_observed_at is
  'Provenance observation time; drives deterministic source age and the 180-day freshness gate.';
comment on column public.peer_graph.verification_status is
  'Stored verification result: unverified (fail-closed default), verified, or failed (PEER_HANDLE_UNVERIFIABLE). Never proof of live existence.';
comment on column public.peer_graph.relationship_status is
  'Relationship framing: unknown (default, neutral), collaborator, or competitor. Non-neutral claims require relationship_evidence.';
comment on column public.peer_graph.relationship_evidence is
  'JSON array of evidence entries {kind, source_url, observed_at, note} supporting collaborator/competitor framing; contradictory entries are rejected.';
