-- Private attempt-level telemetry for bounded report generation.
-- Contains aggregate runtime metadata only; never report content, handles, context,
-- credentials, or tracebacks.

create table if not exists public.report_generation_runs (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid null references public.audits(id) on delete cascade,
  run_kind text not null default 'production'
    check (run_kind in ('production', 'benchmark')),
  worker_id text not null,
  report_type text not null,
  account_mode text not null default 'unknown'
    check (account_mode in ('unknown', 'public_instagram', 'connected_instagram', 'public_other')),
  cache_mode text not null default 'fresh'
    check (cache_mode in ('fresh', 'reused', 'resume')),
  status text not null default 'running'
    check (status in ('running', 'ready', 'needs_review', 'failed', 'blocked', 'crashed')),
  model text not null,
  prompt_version text not null,
  bundle_version text null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  total_seconds numeric(12,3) null check (total_seconds is null or total_seconds >= 0),
  stage_timings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(stage_timings) = 'object'),
  tokens_in integer not null default 0 check (tokens_in >= 0),
  tokens_out integer not null default 0 check (tokens_out >= 0),
  cost_usd numeric(12,6) not null default 0 check (cost_usd >= 0),
  evidence_items integer not null default 0 check (evidence_items >= 0),
  quality_score integer null check (quality_score between 0 and 100),
  format_retry_used boolean not null default false,
  research_cache_used boolean not null default false,
  error_code text null check (error_code is null or length(error_code) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'running' and finished_at is null)
    or (status <> 'running' and finished_at is not null)
  )
);

create index if not exists report_generation_runs_started_idx
  on public.report_generation_runs (started_at desc);
create index if not exists report_generation_runs_dimensions_idx
  on public.report_generation_runs (report_type, account_mode, status, started_at desc);
create index if not exists report_generation_runs_audit_idx
  on public.report_generation_runs (audit_id, started_at desc)
  where audit_id is not null;

alter table public.report_generation_runs enable row level security;
revoke all on public.report_generation_runs from public, anon, authenticated;
grant select, insert, update, delete on public.report_generation_runs to service_role;

create or replace function public.reap_stale_report_generation_runs(
  p_cutoff_minutes integer default 10
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  reaped_count integer;
begin
  if p_cutoff_minutes < 1 or p_cutoff_minutes > 1440 then
    raise exception 'p_cutoff_minutes must be between 1 and 1440';
  end if;

  update public.report_generation_runs
  set status = 'crashed',
      finished_at = now(),
      total_seconds = greatest(
        0,
        extract(epoch from (now() - started_at))::numeric(12,3)
      ),
      error_code = 'worker_attempt_abandoned',
      updated_at = now()
  where status = 'running'
    and started_at < now() - make_interval(mins => p_cutoff_minutes);

  get diagnostics reaped_count = row_count;
  return reaped_count;
end;
$$;

revoke all on function public.reap_stale_report_generation_runs(integer)
  from public, anon, authenticated;
grant execute on function public.reap_stale_report_generation_runs(integer)
  to service_role;

comment on table public.report_generation_runs is
  'Private bounded report-generation attempt metrics without customer content or identifiers beyond audit FK.';
comment on column public.report_generation_runs.stage_timings is
  'Whitelisted aggregate stage durations in seconds.';
