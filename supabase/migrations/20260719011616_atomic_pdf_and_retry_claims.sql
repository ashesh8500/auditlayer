-- Atomic PDF claiming and database-owned retry eligibility. These functions are
-- internal worker APIs and are executable only by service_role.

create index if not exists idx_audits_failed_retry
  on public.audits (last_failed_at, retry_count)
  where status = 'failed';

drop function if exists public.claim_next_pdf(text);
create or replace function public.claim_next_pdf(worker_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_row public.audits%rowtype;
begin
  select *
  into claimed_row
  from public.audits
  where pdf_status = 'pending'
    and report_path is not null
  order by created_at asc
  limit 1
  for update skip locked;

  if not found then
    return null;
  end if;

  update public.audits
  set pdf_status = 'generating',
      claimed_at = now(),
      claimed_by = worker_id,
      updated_at = now()
  where id = claimed_row.id
  returning * into claimed_row;

  return to_jsonb(claimed_row);
end;
$$;

revoke all on function public.claim_next_pdf(text) from public, anon, authenticated;
grant execute on function public.claim_next_pdf(text) to service_role;


drop function if exists public.sweep_retryable_audits(int, int, int);
create or replace function public.sweep_retryable_audits(
  p_max_retries int default 3,
  p_transient_delay_seconds int default 300,
  p_base_delay_seconds int default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate record;
  requeued_count int := 0;
  exhausted_count int := 0;
begin
  -- Terminal failures become founder-visible blocked audits rather than sitting
  -- indefinitely in a retryable status.
  for candidate in
    select id
    from public.audits
    where status = 'failed'
      and retry_count >= p_max_retries
    for update skip locked
  loop
    update public.audits
    set status = 'blocked',
        admin_notes = concat_ws(E'\n', nullif(admin_notes, ''), 'Automatic retries exhausted.'),
        updated_at = now()
    where id = candidate.id
      and status = 'failed';

    if found then
      insert into public.audit_events (audit_id, actor, event_type, phase, detail)
      values (
        candidate.id,
        'worker',
        'dead_lettered',
        'failed',
        'Automatic retries were exhausted. Founder review is required.'
      );
      exhausted_count := exhausted_count + 1;
    end if;
  end loop;

  for candidate in
    select id, retry_count
    from public.audits
    where status = 'failed'
      and retry_count < p_max_retries
      and (
        last_failed_at is null
        or now() >= last_failed_at + make_interval(
          secs => case
            when retry_count < 2 then p_transient_delay_seconds
            else least((power(2, retry_count) * p_base_delay_seconds)::int, 3600)
          end
        )
      )
    order by coalesce(last_failed_at, created_at) asc
    limit 10
    for update skip locked
  loop
    update public.audits
    set status = 'queued',
        retry_count = candidate.retry_count + 1,
        claimed_at = null,
        claimed_by = null,
        updated_at = now()
    where id = candidate.id
      and status = 'failed';

    if found then
      requeued_count := requeued_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'requeued', requeued_count,
    'exhausted', exhausted_count
  );
end;
$$;

revoke all on function public.sweep_retryable_audits(int, int, int)
  from public, anon, authenticated;
grant execute on function public.sweep_retryable_audits(int, int, int)
  to service_role;
