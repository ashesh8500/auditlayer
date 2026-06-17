-- Add report_type column to audits table
alter table public.audits add column if not exists report_type text not null default 'standard';

-- Backfill existing audits
update public.audits set report_type = 'standard' where report_type is null;
