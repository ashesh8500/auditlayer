-- Canonical ALM operator control plane.
-- Additive only: existing audits, reports, refinements, and worker claims remain unchanged.

alter table public.audits
  add column if not exists agent_bundle_version text;

alter table public.audit_report_versions
  add column if not exists agent_bundle_version text;

create or replace function public.inherit_report_agent_bundle_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.agent_bundle_version is null then
    select a.agent_bundle_version into new.agent_bundle_version
      from public.audits a where a.id = new.audit_id;
  end if;
  return new;
end;
$$;

drop trigger if exists inherit_report_agent_bundle_version on public.audit_report_versions;
create trigger inherit_report_agent_bundle_version
  before insert on public.audit_report_versions
  for each row execute function public.inherit_report_agent_bundle_version();

create table if not exists public.operator_threads (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null unique references public.audits(id) on delete cascade,
  hermes_session_id text not null unique
    check (hermes_session_id ~ '^alm:report:[0-9a-f-]{36}$'),
  created_by uuid references public.profiles(id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operator_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.operator_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null check (char_length(content) between 1 and 12000),
  author_id uuid references public.profiles(id) on delete set null,
  run_id uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.operator_jobs (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.operator_threads(id) on delete set null,
  audit_id uuid references public.audits(id) on delete cascade,
  kind text not null
    check (kind in ('discussion', 'refinement', 'engineering', 'operations')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  approval_state text not null default 'not_required'
    check (approval_state in ('not_required', 'requested', 'approved', 'rejected')),
  instruction text not null check (char_length(instruction) between 1 and 12000),
  requested_by uuid references public.profiles(id) on delete set null,
  result text not null default '',
  error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operator_incidents (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique check (char_length(fingerprint) between 8 and 255),
  source text not null default 'sentry'
    check (source in ('sentry', 'worker', 'manual')),
  severity text not null
    check (severity in ('debug', 'info', 'warning', 'error', 'fatal')),
  environment text not null default 'unknown' check (char_length(environment) <= 80),
  title text not null check (char_length(title) between 1 and 500),
  status text not null default 'open'
    check (status in ('open', 'triaged', 'resolved', 'ignored')),
  event_count integer not null default 1 check (event_count > 0),
  external_url text,
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.ingest_operator_incident(
  p_fingerprint text,
  p_source text,
  p_severity text,
  p_environment text,
  p_title text,
  p_external_url text,
  p_metadata jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.operator_incidents (
    fingerprint, source, severity, environment, title, external_url, metadata,
    first_seen_at, last_seen_at
  ) values (
    p_fingerprint, p_source, p_severity, p_environment, p_title,
    p_external_url, coalesce(p_metadata, '{}'::jsonb), now(), now()
  )
  on conflict (fingerprint) do update
    set severity = excluded.severity,
        environment = excluded.environment,
        title = excluded.title,
        external_url = excluded.external_url,
        metadata = excluded.metadata,
        event_count = public.operator_incidents.event_count + 1,
        last_seen_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.ingest_operator_incident(text, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ingest_operator_incident(text, text, text, text, text, text, jsonb)
  to service_role;

create index if not exists operator_messages_thread_created_idx
  on public.operator_messages(thread_id, created_at);
create index if not exists operator_jobs_status_created_idx
  on public.operator_jobs(status, created_at);
create index if not exists operator_incidents_status_seen_idx
  on public.operator_incidents(status, last_seen_at desc);

alter table public.operator_threads enable row level security;
alter table public.operator_messages enable row level security;
alter table public.operator_jobs enable row level security;
alter table public.operator_incidents enable row level security;

drop policy if exists operator_threads_admin_all on public.operator_threads;
create policy operator_threads_admin_all on public.operator_threads
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists operator_messages_admin_all on public.operator_messages;
create policy operator_messages_admin_all on public.operator_messages
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists operator_jobs_admin_all on public.operator_jobs;
create policy operator_jobs_admin_all on public.operator_jobs
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists operator_incidents_admin_all on public.operator_incidents;
create policy operator_incidents_admin_all on public.operator_incidents
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.operator_threads from anon;
revoke all on public.operator_messages from anon;
revoke all on public.operator_jobs from anon;
revoke all on public.operator_incidents from anon;
grant all on public.operator_threads to authenticated, service_role;
grant all on public.operator_messages to authenticated, service_role;
grant all on public.operator_jobs to authenticated, service_role;
grant all on public.operator_incidents to authenticated, service_role;

drop trigger if exists set_operator_threads_updated_at on public.operator_threads;
create trigger set_operator_threads_updated_at
  before update on public.operator_threads
  for each row execute function public.set_updated_at();

drop trigger if exists set_operator_jobs_updated_at on public.operator_jobs;
create trigger set_operator_jobs_updated_at
  before update on public.operator_jobs
  for each row execute function public.set_updated_at();

drop trigger if exists set_operator_incidents_updated_at on public.operator_incidents;
create trigger set_operator_incidents_updated_at
  before update on public.operator_incidents
  for each row execute function public.set_updated_at();

comment on table public.operator_threads is
  'One durable canonical ALM operator discussion thread per report.';
comment on table public.operator_messages is
  'Admin-only transcript of report-scoped ALM operator discussions.';
comment on table public.operator_jobs is
  'Typed, auditable requests separated from free-form operator discussion.';
comment on table public.operator_incidents is
  'Sanitized and deduplicated observability intake; payloads never authorize execution.';
