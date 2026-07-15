-- Add claim-tracking columns to audits table for RPC-based atomic claiming.
-- The RPC function uses SELECT ... FOR UPDATE SKIP LOCKED so concurrent
-- workers never contend for the same row, and claimed_at / claimed_by
-- provide audit trail for stuck-running recovery.
alter table public.audits add column if not exists claimed_at timestamptz;
alter table public.audits add column if not exists claimed_by text;

-- Same for refinements.
alter table public.refinements add column if not exists claimed_at timestamptz;
alter table public.refinements add column if not exists claimed_by text;

-- ---------------------------------------------------------------------------
-- claim_next_queued(worker_id text)
--   Returns the full audits row as JSON, or NULL if no queued audits exist.
--   Atomically transitions the oldest queued audit to 'running'.
--   Uses FOR UPDATE SKIP LOCKED so concurrent callers skip rows another
--   transaction is already claiming.
-- ---------------------------------------------------------------------------
drop function if exists public.claim_next_queued(text);
create or replace function public.claim_next_queued(worker_id text)
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
  where status = 'queued'
  order by created_at asc
  limit 1
  for update skip locked;

  if not found then
    return null;
  end if;

  update public.audits
  set status = 'running',
      claimed_at = now(),
      claimed_by = worker_id,
      updated_at = now()
  where id = claimed_row.id
  returning * into claimed_row;

  return to_jsonb(claimed_row);
end;
$$;

revoke all on function public.claim_next_queued(text) from public, anon, authenticated;
grant execute on function public.claim_next_queued(text) to service_role;

-- ---------------------------------------------------------------------------
-- claim_next_refinement(worker_id text)
--   Same pattern for the refinements queue.
-- ---------------------------------------------------------------------------
drop function if exists public.claim_next_refinement(text);
create or replace function public.claim_next_refinement(worker_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_row public.refinements%rowtype;
begin
  select *
  into claimed_row
  from public.refinements
  where status = 'queued'
  order by created_at asc
  limit 1
  for update skip locked;

  if not found then
    return null;
  end if;

  update public.refinements
  set status = 'running',
      claimed_at = now(),
      claimed_by = worker_id,
      updated_at = now()
  where id = claimed_row.id
  returning * into claimed_row;

  return to_jsonb(claimed_row);
end;
$$;

revoke all on function public.claim_next_refinement(text) from public, anon, authenticated;
grant execute on function public.claim_next_refinement(text) to service_role;
