-- Cache research output so failed audits can resume without re-running tools.
alter table public.audits add column if not exists research_cache text;
