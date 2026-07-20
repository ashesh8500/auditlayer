-- Immutable report revisions. An audit is one evidence/generation event; a
-- report version is a refinement of that event. New audits remain separate.

alter table public.audits
  add column if not exists report_version integer not null default 1,
  add column if not exists template_version text not null default 'master-skeleton-v1';

create table if not exists public.audit_report_versions (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  version integer not null check (version > 0),
  report_path text not null,
  prompt_version text,
  template_version text not null default 'master-skeleton-v1',
  change_type text not null default 'generation'
    check (change_type in ('generation', 'refinement', 'manual')),
  changed_section text,
  change_summary text,
  actor text not null default 'worker',
  created_at timestamptz not null default now(),
  unique (audit_id, version)
);

insert into public.audit_report_versions (
  audit_id, version, report_path, prompt_version, template_version,
  change_type, change_summary, actor, created_at
)
select
  id,
  report_version,
  report_path,
  prompt_version,
  template_version,
  'generation',
  'Imported current report as the initial immutable version',
  'migration',
  coalesce(updated_at, created_at, now())
from public.audits
where report_path is not null
on conflict (audit_id, version) do nothing;

create index if not exists idx_audit_report_versions_audit
  on public.audit_report_versions(audit_id, version desc);

alter table public.audit_report_versions enable row level security;

create policy audit_report_versions_select_own
  on public.audit_report_versions for select to authenticated
  using (public.owns_audit(audit_id));

create policy audit_report_versions_admin_all
  on public.audit_report_versions for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.audit_report_versions is
  'Immutable lineage of generated and refined report artifacts for one audit evidence snapshot.';
