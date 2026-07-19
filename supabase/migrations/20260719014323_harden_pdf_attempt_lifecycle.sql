-- Complete the asynchronous PDF lifecycle: dedicated claim metadata, bounded
-- attempts, atomic failure transitions, and stale-claim recovery.

alter table public.audits
  add column if not exists pdf_attempt_count int not null default 0,
  add column if not exists pdf_claimed_at timestamptz,
  add column if not exists pdf_claimed_by text,
  add column if not exists pdf_last_failed_at timestamptz,
  add column if not exists pdf_last_error text;

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
  select * into claimed_row
  from public.audits
  where pdf_status = 'pending'
    and report_path is not null
    and pdf_attempt_count < 3
  order by created_at asc
  limit 1
  for update skip locked;

  if not found then return null; end if;

  update public.audits
  set pdf_status = 'generating',
      pdf_attempt_count = pdf_attempt_count + 1,
      pdf_claimed_at = now(),
      pdf_claimed_by = worker_id,
      updated_at = now()
  where id = claimed_row.id
  returning * into claimed_row;

  return to_jsonb(claimed_row);
end;
$$;
revoke all on function public.claim_next_pdf(text) from public, anon, authenticated;
grant execute on function public.claim_next_pdf(text) to service_role;

drop function if exists public.mark_pdf_attempt_failed(uuid, text, int);
create or replace function public.mark_pdf_attempt_failed(
  p_audit_id uuid,
  p_error text,
  p_max_attempts int default 3
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  row_attempts int;
  next_status text;
begin
  select pdf_attempt_count into row_attempts
  from public.audits
  where id = p_audit_id
  for update;

  if not found then raise exception 'audit not found'; end if;
  next_status := case when row_attempts >= p_max_attempts then 'failed' else 'pending' end;

  update public.audits
  set pdf_status = next_status,
      pdf_claimed_at = null,
      pdf_claimed_by = null,
      pdf_last_failed_at = now(),
      pdf_last_error = left(coalesce(p_error, 'PDF generation failed'), 500),
      updated_at = now()
  where id = p_audit_id;

  insert into public.audit_events (audit_id, actor, event_type, phase, detail)
  values (
    p_audit_id,
    'pdf-worker',
    case when next_status = 'failed' then 'pdf_failed' else 'pdf_retry' end,
    'pdf',
    case when next_status = 'failed'
      then 'PDF generation exhausted automatic attempts. Founder review is required.'
      else 'PDF generation failed transiently and was queued for retry.'
    end
  );
  return next_status;
end;
$$;
revoke all on function public.mark_pdf_attempt_failed(uuid, text, int)
  from public, anon, authenticated;
grant execute on function public.mark_pdf_attempt_failed(uuid, text, int)
  to service_role;

drop function if exists public.reap_stale_pdf_claims(int, int);
create or replace function public.reap_stale_pdf_claims(
  cutoff_minutes int default 15,
  p_max_attempts int default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate record;
  retried int := 0;
  exhausted int := 0;
  next_status text;
begin
  for candidate in
    select id, pdf_attempt_count
    from public.audits
    where pdf_status = 'generating'
      and pdf_claimed_at < now() - make_interval(mins => cutoff_minutes)
    for update skip locked
  loop
    next_status := case
      when candidate.pdf_attempt_count >= p_max_attempts then 'failed'
      else 'pending'
    end;
    update public.audits
    set pdf_status = next_status,
        pdf_claimed_at = null,
        pdf_claimed_by = null,
        pdf_last_failed_at = now(),
        pdf_last_error = 'Stale PDF claim recovered',
        updated_at = now()
    where id = candidate.id;

    insert into public.audit_events (audit_id, actor, event_type, phase, detail)
    values (
      candidate.id,
      'pdf-worker',
      case when next_status = 'failed' then 'pdf_failed' else 'pdf_retry' end,
      'pdf',
      case when next_status = 'failed'
        then 'Stale PDF claim exhausted automatic attempts.'
        else 'Stale PDF claim recovered and queued for retry.'
      end
    );
    if next_status = 'failed' then exhausted := exhausted + 1;
    else retried := retried + 1;
    end if;
  end loop;
  return jsonb_build_object('retried', retried, 'exhausted', exhausted);
end;
$$;
revoke all on function public.reap_stale_pdf_claims(int, int)
  from public, anon, authenticated;
grant execute on function public.reap_stale_pdf_claims(int, int)
  to service_role;
