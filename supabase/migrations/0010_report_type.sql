-- Add report_type column to audits table
alter table public.audits add column if not exists report_type text not null default 'standard';

-- Backfill existing audits
update public.audits set report_type = 'standard' where report_type is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.audits'::regclass
      and conname = 'audits_report_type_check'
  ) then
    alter table public.audits
      add constraint audits_report_type_check
      check (report_type in ('pulse', 'standard', 'extended', 'enterprise', 'blueprint'));
  end if;
end
$$;
