-- Founder audit recovery transitions — atomic compare-and-transition (ALM-I-017).
--
-- approve / requeue / block are founder-only recovery actions over the existing
-- `audits` state machine. This single SECURITY DEFINER RPC is the authoritative
-- compare-and-transition path used by the founder server actions:
--
--   - it validates the founder actor against `profiles.role = 'admin'`;
--   - it locks the current audit row (`for update`) and compares the current
--     status before any write, so a stale or duplicate submission cannot race
--     a concurrent transition;
--   - it validates the requested action against the one canonical matrix
--     (approve: needs_review/blocked -> queued; requeue: failed/ready ->
--     queued; block: needs_review/queued/running -> blocked; terminal success,
--     terminal failure, and already-blocked are rejected);
--   - it bounds and redacts the founder note (control characters stripped,
--     whitespace collapsed, capped at 500 chars; block requires >= 4 chars);
--   - it changes `audits.status` exactly once and inserts exactly one matching
--     founder `audit_events` row in the same transaction.
--
-- Every rejection (unauthorized, unsupported action, missing audit, invalid
-- transition, stale status, short note) returns a bounded structured jsonb
-- result and performs ZERO status/event writes.
--
-- The RPC is executable only by service_role; browser roles are never granted
-- execute. Additive only: no table, column, policy, or trigger changes.

-- ---------------------------------------------------------------------------
-- 1. Founder compare-and-transition RPC.
-- ---------------------------------------------------------------------------
drop function if exists public.founder_transition_audit(uuid, text, uuid, text);
create or replace function public.founder_transition_audit(
  p_audit_id uuid,
  p_action text,
  p_actor_id uuid,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status_before text;
  v_target_status text;
  v_event_type text;
  v_event_phase text;
  v_detail text;
  v_note text;
  v_is_admin boolean;
  v_updated int;
begin
  -- 1. Validate the founder actor (profiles.role = 'admin').
  select exists(
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin'
  ) into v_is_admin;

  if not v_is_admin then
    return jsonb_build_object(
      'ok', false,
      'code', 'unauthorized',
      'message', 'Founder role required for audit transitions.'
    );
  end if;

  -- 2. Validate the action is supported before touching any row.
  if p_action not in ('approve', 'requeue', 'block') then
    return jsonb_build_object(
      'ok', false,
      'code', 'unsupported_action',
      'message', format('Unsupported founder action: %s.', p_action)
    );
  end if;

  -- 3. Lock the current audit row and read its status.
  select status into v_status_before
  from public.audits
  where id = p_audit_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'audit_not_found',
      'message', 'Audit not found.'
    );
  end if;

  -- 4. Bound and redact the note before any write or detail emission.
  --    Strip control characters, collapse whitespace runs, trim, cap at 500.
  v_note := left(
    regexp_replace(
      regexp_replace(
        coalesce(p_note, ''),
        E'[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g'
      ),
      E'[ \t\r\n]+', ' ', 'g'
    ),
    500
  );

  -- 5. Resolve the requested transition against the canonical matrix.
  if p_action = 'approve' and v_status_before in ('needs_review', 'blocked') then
    v_target_status := 'queued';
    v_event_type := 'audit_approved';
    v_event_phase := 'approved';
    v_detail := case when v_note = '' then 'Approved by founder' else v_note end;
  elsif p_action = 'requeue' and v_status_before in ('failed', 'ready') then
    v_target_status := 'queued';
    v_event_type := 'audit_requeued';
    v_event_phase := 'queued';
    v_detail := 'Re-queued by founder';
  elsif p_action = 'block' and v_status_before in ('needs_review', 'queued', 'running') then
    if length(v_note) < 4 then
      return jsonb_build_object(
        'ok', false,
        'code', 'note_required',
        'message', 'Blocking requires a clear note.',
        'status_before', v_status_before,
        'status_after', null
      );
    end if;
    v_target_status := 'blocked';
    v_event_type := 'audit_blocked';
    v_event_phase := 'failed';
    v_detail := v_note;
  else
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_transition',
      'message', format('Transition %s is not allowed from status %s.', p_action, v_status_before),
      'status_before', v_status_before,
      'status_after', null
    );
  end if;

  -- 6. Compare-and-transition: change status exactly once, guarded by the
  --    locked status so a concurrent change cannot slip between read and write.
  update public.audits
  set status = v_target_status,
      admin_notes = case
        when p_action = 'block' then concat_ws(E'\n', nullif(admin_notes, ''), 'Blocked: ' || v_note)
        else admin_notes
      end,
      updated_at = now()
  where id = p_audit_id
    and status = v_status_before;

  get diagnostics v_updated = row_count;

  if v_updated <> 1 then
    return jsonb_build_object(
      'ok', false,
      'code', 'stale_status',
      'message', 'Audit status changed concurrently.',
      'status_before', v_status_before,
      'status_after', null
    );
  end if;

  -- 7. Insert exactly one matching founder event in the same transaction.
  insert into public.audit_events (audit_id, actor, event_type, phase, detail)
  values (p_audit_id, 'admin:' || p_actor_id, v_event_type, v_event_phase, v_detail);

  return jsonb_build_object(
    'ok', true,
    'code', 'ok',
    'status_before', v_status_before,
    'status_after', v_target_status,
    'event_type', v_event_type,
    'phase', v_event_phase,
    'detail', v_detail
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Grants — service_role only. Browser roles never execute transitions.
-- ---------------------------------------------------------------------------
revoke all on function public.founder_transition_audit(uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.founder_transition_audit(uuid, text, uuid, text)
  to service_role;
