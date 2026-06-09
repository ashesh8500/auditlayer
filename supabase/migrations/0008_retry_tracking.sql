-- Add retry tracking columns to audits table for graceful failure recovery.
alter table public.audits add column if not exists retry_count int not null default 0;
alter table public.audits add column if not exists last_failed_at timestamptz;
