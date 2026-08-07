create table if not exists public.report_generation_runs (
  id uuid primary key,
  status text not null default 'running'
    check (status in ('running', 'ready', 'needs_review', 'failed', 'blocked', 'crashed'))
);
