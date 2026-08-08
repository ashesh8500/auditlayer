-- Make the SECURITY DEFINER decision RPC the authoritative tenant boundary.
-- The customer action still performs read-only preflight checks for useful UX, but
-- ownership and target linkage are revalidated under row locks in the same
-- transaction as the decision insert.
create or replace function public.record_decision(
  p_subject_id uuid,
  p_user_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_decision text,
  p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_prior_decision text;
begin
  -- A SHARE lock prevents subject ownership from changing until this write
  -- commits while still allowing independent reads.
  perform 1
  from public.subjects
  where id = p_subject_id
    and user_id = p_user_id
  for share;
  if not found then
    raise exception 'subject_not_owned';
  end if;

  -- Serialize decisions for one target and hold its subject linkage stable.
  if p_target_type = 'proposal' then
    perform 1
    from public.context_update_proposals
    where id = p_target_id
      and subject_id = p_subject_id
    for update;
  elsif p_target_type = 'recommendation' then
    perform 1
    from public.recommendations r
    join public.intelligence_runs ir on ir.id = r.intelligence_run_id
    where r.id = p_target_id
      and ir.subject_id = p_subject_id
    for update of r, ir;
  else
    raise exception 'unsupported_target_type';
  end if;

  if not found then
    raise exception '% % does not belong to subject %',
      p_target_type, p_target_id, p_subject_id;
  end if;

  -- The target lock above makes this check + insert atomic across concurrent
  -- retries. Identical retries recover the committed row; conflicting decisions
  -- are rejected as stale instead of producing a second ledger entry.
  select id, decision
  into v_id, v_prior_decision
  from public.decisions
  where subject_id = p_subject_id
    and user_id = p_user_id
    and target_type = p_target_type
    and target_id = p_target_id
  order by created_at asc, id asc
  limit 1;

  if v_id is not null then
    if v_prior_decision = p_decision then
      return v_id;
    end if;
    raise exception 'decision_already_recorded';
  end if;

  insert into public.decisions (
    subject_id,
    user_id,
    target_type,
    target_id,
    decision,
    note
  )
  values (
    p_subject_id,
    p_user_id,
    p_target_type,
    p_target_id,
    p_decision,
    p_note
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_decision(uuid, uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.record_decision(uuid, uuid, text, uuid, text, text)
  to service_role;

comment on function public.record_decision(uuid, uuid, text, uuid, text, text) is
  'Owner-locked decision ledger write. Revalidates tenant ownership and target linkage transactionally; identical concurrent retries return the existing decision.';
