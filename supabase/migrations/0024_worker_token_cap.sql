-- Align the database safety ceiling with the worker's combined-token budget.
--
-- HERMES_MAX_TOKENS remains the per-call output ceiling (32k). This cap covers
-- aggregate input + output across the research and composition stages; 32k was
-- lower than a successful bounded Pulse run's 51,238 combined tokens even
-- though the run cost only $0.128 under the independent $3 hard cost ceiling.

alter table public.app_settings
  alter column token_cap set default 120000;

update public.app_settings
set token_cap = 120000,
    updated_at = now()
where id = 1
  and token_cap < 120000;
