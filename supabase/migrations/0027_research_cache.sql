-- Research cache: per-account snapshots of research evidence and Instagram
-- metrics so subsequent audits for the same handle skip the expensive
-- web-research + IG-API round-trip within a 7-day validity window.
--
-- Accounts table gets four new columns:
--   last_researched_at   — when the last research sweep completed
--   research_snapshot    — serialised web evidence from the last sweep
--   ig_metrics_snapshot  — serialised Instagram metrics (JSON or null)
--   cache_valid_until    — expiry timestamp (last_researched_at + 7 days)
--
-- Audits table gets one new column:
--   force_refresh        — when true the worker skips the account cache and
--                          always runs a fresh research sweep

alter table public.accounts
    add column if not exists last_researched_at   timestamptz,
    add column if not exists research_snapshot    text,
    add column if not exists ig_metrics_snapshot  text,
    add column if not exists cache_valid_until    timestamptz;

alter table public.audits
    add column if not exists force_refresh boolean not null default false;
