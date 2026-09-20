-- One transaction-scoped row fence shared by both canonical claim RPCs.
-- Pause waits for in-flight claim transactions; subsequent claims return NULL.
-- Does not cancel, reap, retry or otherwise mutate customer work.
create table public.worker_claim_control (
  singleton boolean primary key default true check (singleton),
  drain_token uuid,
  paused_at timestamptz
);
insert into public.worker_claim_control(singleton) values (true);
alter table public.worker_claim_control enable row level security;
revoke all on public.worker_claim_control from public, anon, authenticated, service_role;

create or replace function public.pause_worker_claims(p_drain_token uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_token uuid;
begin
  if p_drain_token is null then raise exception 'drain_token_required'; end if;
  select drain_token into v_token from public.worker_claim_control where singleton for update;
  if not found then raise exception 'drain_control_missing'; end if;
  if v_token is not null and v_token <> p_drain_token then raise exception 'another_drain_owns_fence'; end if;
  update public.worker_claim_control set drain_token = p_drain_token, paused_at = coalesce(paused_at, now()) where singleton;
end;
$$;
create or replace function public.resume_worker_claims(p_drain_token uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_token uuid;
begin
  if p_drain_token is null then raise exception 'drain_token_required'; end if;
  select drain_token into v_token from public.worker_claim_control where singleton for update;
  if not found then raise exception 'drain_control_missing'; end if;
  if v_token is distinct from p_drain_token then raise exception 'drain_token_mismatch'; end if;
  update public.worker_claim_control set drain_token = null, paused_at = null where singleton;
end;
$$;
create or replace function public.worker_drain_status()
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('paused', drain_token is not null, 'drain_token', drain_token,
    'paused_at', paused_at,
    'active_audits', (select count(*) from public.audits where status = 'running'),
    'active_refinements', (select count(*) from public.refinements where status = 'running'))
  from public.worker_claim_control where singleton;
$$;
revoke all on function public.pause_worker_claims(uuid), public.resume_worker_claims(uuid), public.worker_drain_status() from public, anon, authenticated;
grant execute on function public.pause_worker_claims(uuid), public.resume_worker_claims(uuid), public.worker_drain_status() to service_role;

create or replace function public.claim_next_queued(worker_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_row public.audits%rowtype;
begin
  -- SHARE is held until claim commit; the pause UPDATE cannot overtake it.
  -- Missing control state is an error, never permission to claim.
  perform 1 from public.worker_claim_control where singleton for share;
  if not found then raise exception 'drain_control_missing'; end if;
  if exists (select 1 from public.worker_claim_control where singleton and drain_token is not null) then
    return null;
  end if;
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

create or replace function public.claim_next_refinement(worker_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_audit uuid;
  v_version integer;
  claimed_row public.refinements%rowtype;
begin
  -- SHARE is held until claim commit; the pause UPDATE cannot overtake it.
  -- Missing control state is an error, never permission to claim.
  perform 1 from public.worker_claim_control where singleton for share;
  if not found then raise exception 'drain_control_missing'; end if;
  if exists (select 1 from public.worker_claim_control where singleton and drain_token is not null) then
    return null;
  end if;
  -- Lock the audit first, just like finalization; skip busy audits, not merely
  -- busy refinement rows. Another worker cannot claim a sibling concurrently.
  select a.id, a.report_version into v_audit, v_version
    from public.audits a
   where a.status = 'ready' and nullif(a.report_path, '') is not null
     and exists (select 1 from public.refinements r where r.audit_id = a.id and r.status = 'queued')
     and not exists (select 1 from public.refinements r where r.audit_id = a.id and r.status = 'running')
   order by a.created_at limit 1 for update of a skip locked;
  if not found then return null; end if;
  -- Recheck after acquiring the audit lock (READ COMMITTED snapshot races).
  if exists (select 1 from public.refinements where audit_id = v_audit and status = 'running') then
    return null;
  end if;
  select * into claimed_row from public.refinements
   where audit_id = v_audit and status = 'queued'
   order by created_at, id limit 1 for update skip locked;
  if not found then return null; end if;
  update public.refinements set status = 'running', claimed_at = now(),
    claimed_by = worker_id, updated_at = now(), base_report_version = v_version,
    lease_expires_at = now() + interval '20 minutes'
   where id = claimed_row.id returning * into claimed_row;
  return to_jsonb(claimed_row);
end;
$$;
revoke all on function public.claim_next_refinement(text) from public, anon, authenticated;
grant execute on function public.claim_next_refinement(text) to service_role;
