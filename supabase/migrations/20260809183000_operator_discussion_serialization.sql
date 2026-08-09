-- Serialize discussion calls per durable Hermes thread. Without this guard,
-- two admins/tabs can race the same session and persist responses out of order.

create unique index if not exists operator_jobs_one_running_discussion_per_thread_idx
  on public.operator_jobs(thread_id)
  where kind = 'discussion' and status = 'running';
