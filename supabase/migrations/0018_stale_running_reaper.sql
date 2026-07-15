-- Atomic stale-running reaper RPC for ghost-lock recovery.
-- When a worker dies mid-generation, audits stay locked in 'running'.
-- This function atomically resets eligible rows (updated_at older than
-- cutoff_minutes) back to 'queued', or terminally fails them after three
-- stale recoveries. Uses FOR UPDATE SKIP LOCKED so
-- concurrent reaper calls never contend for the same row.
--
-- retry_count column already added in migration 0008_retry_tracking.sql.

drop function if exists public.reap_stale_running(int);
create or replace function public.reap_stale_running(cutoff_minutes int default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  stale_id uuid;
  stale_retry_count int;
  reaped_count int := 0;
begin
  for stale_id, stale_retry_count in
    select id, retry_count
    from public.audits
    where status = 'running'
      and updated_at < (now() - (cutoff_minutes || ' minutes')::interval)
    order by updated_at asc
    for update skip locked
  loop
    update public.audits
    set status = case when coalesce(stale_retry_count, 0) + 1 >= 3 then 'failed' else 'queued' end,
        retry_count = coalesce(stale_retry_count, 0) + 1,
        last_failed_at = now(),
        claimed_at = null,
        claimed_by = null,
        updated_at = now()
    where id = stale_id;
    reaped_count := reaped_count + 1;
  end loop;
  return reaped_count;
end;
$$;

revoke all on function public.reap_stale_running(int) from public, anon, authenticated;
grant execute on function public.reap_stale_running(int) to service_role;
