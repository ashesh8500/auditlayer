-- Restore the production worker model contract to DeepSeek V4 Flash.
-- Provider authentication is supplied by DEEPSEEK_API_KEY in the worker environment.

alter table public.app_settings
  alter column hermes_model set default 'deepseek-v4-flash';

update public.app_settings
set hermes_model = 'deepseek-v4-flash', updated_at = now()
where id = 1;