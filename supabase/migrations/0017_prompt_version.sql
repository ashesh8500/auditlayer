-- Store prompt version for report reproducibility.
-- Bump PROMPT_VERSION in worker/auditlayer_worker/core.py when the
-- prompt template, system messages, or business constraints change.
alter table public.audits add column if not exists prompt_version text;

-- Backfill existing audits with the version that produced them
-- (v0.6 was the live version when this column was introduced).
update public.audits set prompt_version = '0.6' where prompt_version is null;
