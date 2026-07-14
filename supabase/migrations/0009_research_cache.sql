-- Cache research output so failed audits can resume without re-running tools.
alter table public.audits add column if not exists research_cache text;
update public.audits set research_cache = '' where research_cache is null;
alter table public.audits alter column research_cache set default '';
alter table public.audits alter column research_cache set not null;
