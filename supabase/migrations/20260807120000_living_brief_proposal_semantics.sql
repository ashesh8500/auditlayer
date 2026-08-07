-- ALM-I-009 — Living Brief protected proposal semantics.
-- Additive migration: enforces that model output stays a bounded RFC 6901 diff
-- proposal, that acceptance of protected Living Brief fields (identity
-- including vision, positioning, goals, constraints) requires an owner-scoped
-- explicit confirmation, and that acceptance atomically appends the next
-- confirmed Living Brief version plus a durable decision while rejection
-- records a durable decision and an evidence-linked rejection fingerprint.
--
-- A rejected semantic proposal cannot recur while its evidence set is
-- unchanged: `rejected_context_proposals` keys each rejected proposal by its
-- evidence-linked `semantic_fingerprint` (computed in the worker, opaque to
-- SQL), and `create_context_update_proposals` fails closed when a new
-- proposal carries an already-rejected fingerprint.  New evidence changes the
-- fingerprint and makes the proposal admissible again.
--
-- No existing column is dropped or renamed; `living_brief_versions` remains
-- immutable (the kernel trigger still rejects UPDATE/DELETE); the existing
-- product call site `resolve_context_update_proposal(p_proposal_id,
-- p_status, p_user_id)` keeps working because the new explicit-confirmation
-- parameter is optional with default false.

-- ===========================================================================
-- 1. Evidence-linked semantic fingerprint on proposals (opaque to SQL).
-- ===========================================================================
alter table public.context_update_proposals
  add column if not exists semantic_fingerprint text;

comment on column public.context_update_proposals.semantic_fingerprint is
  'Evidence-linked semantic fingerprint computed in the worker (sha256 over canonical subject_id/path/operation/proposed_value/sorted evidence_ids). Opaque to SQL; used to prevent unchanged-evidence rejection recurrence.';

create index if not exists idx_context_update_proposals_fingerprint
  on public.context_update_proposals(subject_id, semantic_fingerprint)
  where semantic_fingerprint is not null;

-- ===========================================================================
-- 2. Durable rejection fingerprints — the deterministic non-recurrence gate.
-- ===========================================================================
create table if not exists public.rejected_context_proposals (
  id                  uuid primary key default gen_random_uuid(),
  subject_id          uuid not null references public.subjects(id) on delete cascade,
  proposal_id         uuid not null references public.context_update_proposals(id) on delete cascade,
  semantic_fingerprint text not null,
  path                text not null,
  operation           text not null
    check (operation in ('add', 'replace', 'remove')),
  proposed_value      jsonb not null,
  evidence_ids        jsonb not null default '[]'::jsonb,
  rejected_by         uuid references public.profiles(id) on delete set null,
  rejected_at         timestamptz not null default now(),
  unique (subject_id, semantic_fingerprint)
);

create index if not exists idx_rejected_context_proposals_subject
  on rejected_context_proposals(subject_id, rejected_at desc);

comment on table public.rejected_context_proposals is
  'Durable evidence-linked fingerprints of rejected Living Brief proposals. Unique per (subject, fingerprint): a rejected semantic proposal cannot recur while its evidence set is unchanged; new evidence changes the fingerprint.';
comment on column public.rejected_context_proposals.semantic_fingerprint is
  'Worker-computed sha256 fingerprint binding path/operation/proposed_value to the ordered evidence set.';

-- ===========================================================================
-- 3. Bounded RFC 6901 helpers (immutable, no table access).
-- ===========================================================================

-- brief_path_tokens: validate and decode an RFC 6901 pointer with a bounded
-- length and token count.  Raises brief_path_outside_vocabulary on any
-- non-conforming path so invalid paths always fail closed.
create or replace function public.brief_path_tokens(p_path text)
returns text[]
language plpgsql
immutable
set search_path = public
as $$
declare
  v_tokens text[];
  v_i int;
begin
  if p_path is null or left(p_path, 1) <> '/' then
    raise exception 'brief_path_outside_vocabulary: path must be a JSON Pointer starting with /';
  end if;
  if length(p_path) > 512 then
    raise exception 'brief_path_outside_vocabulary: path exceeds 512 characters';
  end if;
  v_tokens := string_to_array(substr(p_path, 2), '/');
  if array_length(v_tokens, 1) is null or array_length(v_tokens, 1) < 1 then
    raise exception 'brief_path_outside_vocabulary: path must name a Living Brief field';
  end if;
  if array_length(v_tokens, 1) > 8 then
    raise exception 'brief_path_outside_vocabulary: path exceeds 8 tokens';
  end if;
  -- RFC 6901: only ~0 (tilde) and ~1 (slash) escapes are valid.
  for v_i in 1..array_length(v_tokens, 1) loop
    if v_tokens[v_i] ~ '~[^01]' then
      raise exception 'brief_path_outside_vocabulary: invalid RFC 6901 escape in path';
    end if;
    v_tokens[v_i] := replace(replace(v_tokens[v_i], '~1', '/'), '~0', '~');
  end loop;
  return v_tokens;
end;
$$;

comment on function public.brief_path_tokens(text) is
  'Validates and decodes a bounded RFC 6901 pointer. Raises brief_path_outside_vocabulary on invalid paths.';

-- brief_path_is_protected: identity (including vision), positioning, goals,
-- constraints are protected fields whose acceptance requires explicit owner
-- confirmation.  Anything outside the proposable vocabulary raises.
create or replace function public.brief_path_is_protected(p_path text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_tokens text[];
begin
  v_tokens := public.brief_path_tokens(p_path);
  if v_tokens[1] not in ('identity', 'audience', 'positioning', 'offers', 'goals', 'constraints', 'experiments') then
    raise exception 'brief_path_outside_vocabulary: % is not a proposable Living Brief field', v_tokens[1];
  end if;
  return v_tokens[1] in ('identity', 'positioning', 'goals', 'constraints');
end;
$$;

comment on function public.brief_path_is_protected(text) is
  'True when the path targets a protected Living Brief field (identity incl. vision, positioning, goals, constraints). Raises for paths outside the proposable vocabulary.';

-- apply_brief_pointer_inner: recursive bounded RFC 6901 application over a
-- single Living Brief column value.  Supported leaf operations:
--   object: add (create-or-replace key), replace (key must exist), remove
--   array : add at "-" (append) or exact-length append; replace at index;
--           remove at index
-- Interior-array add (inserting before an existing element) is unsupported
-- and rejected with the exact supported-path list rather than silently
-- coercing.  Every unsupported or missing target raises a stable exception,
-- so a proposal can never broaden mutation or partially rewrite state.
create or replace function public.apply_brief_pointer_inner(
  p_base jsonb,
  p_tokens text[],
  p_operation text,
  p_value jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_n int := coalesce(array_length(p_tokens, 1), 0);
  v_head text;
  v_tail text[];
  v_child jsonb;
  v_idx int;
  v_len int;
begin
  if v_n = 0 then
    raise exception 'brief_path_outside_vocabulary: empty reference token';
  end if;
  v_head := p_tokens[1];
  v_tail := nullif(p_tokens[2:v_n], '{}');
  if v_n = 1 then
    if jsonb_typeof(p_base) = 'array' then
      if v_head = '-' then
        if p_operation <> 'add' then
          raise exception 'brief_operation_unsupported: "-" append marker only supports add (supported: add, replace at index, remove at index)';
        end if;
        return p_base || jsonb_build_array(p_value);
      end if;
      begin
        v_idx := v_head::int;
      exception when others then
        raise exception 'brief_path_outside_vocabulary: array index % is not an integer or "-"', v_head;
      end;
      v_len := jsonb_array_length(p_base);
      if p_operation = 'add' then
        if v_idx < 0 or v_idx > v_len then
          raise exception 'brief_path_out_of_bounds: array add index % outside [0, %]', v_idx, v_len;
        end if;
        if v_idx = v_len then
          return p_base || jsonb_build_array(p_value);
        end if;
        raise exception 'brief_operation_unsupported: array add at interior index % is unsupported (supported: "-" append, exact-length append, replace, remove)', v_idx;
      end if;
      if p_operation = 'remove' then
        if v_idx < 0 or v_idx >= v_len then
          raise exception 'brief_path_out_of_bounds: array remove index % out of range', v_idx;
        end if;
        return p_base - v_idx;
      end if;
      if v_idx < 0 or v_idx >= v_len then
        raise exception 'brief_path_out_of_bounds: array replace index % out of range', v_idx;
      end if;
      return jsonb_set(p_base, array[v_head], p_value, false);
    end if;
    -- object leaf
    if p_operation = 'remove' then
      if not p_base ? v_head then
        raise exception 'brief_path_outside_vocabulary: key % does not exist', v_head;
      end if;
      return p_base - v_head;
    end if;
    if p_operation = 'add' then
      return jsonb_set(p_base, array[v_head], p_value, true);
    end if;
    if not p_base ? v_head then
      raise exception 'brief_path_outside_vocabulary: key % does not exist', v_head;
    end if;
    return jsonb_set(p_base, array[v_head], p_value, false);
  end if;
  -- descend one level
  if jsonb_typeof(p_base) = 'array' then
    if v_head = '-' then
      raise exception 'brief_path_outside_vocabulary: "-" append marker must be the final token';
    end if;
    begin
      v_idx := v_head::int;
    exception when others then
      raise exception 'brief_path_outside_vocabulary: array index % is not an integer', v_head;
    end;
    if v_idx < 0 or v_idx >= jsonb_array_length(p_base) then
      raise exception 'brief_path_out_of_bounds: array index % out of range', v_idx;
    end if;
    v_child := p_base -> v_idx;
    return jsonb_set(
      p_base,
      array[v_head],
      public.apply_brief_pointer_inner(v_child, v_tail, p_operation, p_value),
      false
    );
  end if;
  if not p_base ? v_head then
    raise exception 'brief_path_outside_vocabulary: key % does not exist', v_head;
  end if;
  v_child := p_base -> v_head;
  return jsonb_set(
    p_base,
    array[v_head],
    public.apply_brief_pointer_inner(v_child, v_tail, p_operation, p_value),
    false
  );
end;
$$;

-- apply_brief_pointer: public entry point.  A single-token path (the whole
-- field) only supports replace; anything else requires a reference token
-- below the field.
create or replace function public.apply_brief_pointer(
  p_base jsonb,
  p_path text,
  p_operation text,
  p_value jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_tokens text[];
  v_n int;
  v_result jsonb;
begin
  if p_operation not in ('add', 'replace', 'remove') then
    raise exception 'brief_operation_unsupported: % is not add/replace/remove', p_operation;
  end if;
  v_tokens := public.brief_path_tokens(p_path);
  v_n := array_length(v_tokens, 1);
  if v_n = 1 then
    if p_operation = 'replace' then
      return p_value;
    end if;
    raise exception 'brief_operation_unsupported: % on the whole % field is unsupported (supported: replace the whole field, or target a key/index below it)', p_operation, v_tokens[1];
  end if;
  v_result := public.apply_brief_pointer_inner(p_base, v_tokens[2:v_n], p_operation, p_value);
  return v_result;
end;
$$;

comment on function public.apply_brief_pointer(jsonb, text, text, jsonb) is
  'Bounded RFC 6901 application to one Living Brief column value. Rejects unsupported operations and missing targets with stable exceptions; never silently coerces.';

-- ===========================================================================
-- 4. Service-role RPCs (SECURITY DEFINER, fixed search_path).
-- ===========================================================================

-- 4a. create_context_update_proposals — bulk insert proposals from analysis.
-- Requires each proposal to carry a worker-computed semantic fingerprint and
-- fails closed when the fingerprint was already rejected for the same subject
-- with an unchanged evidence set.  Also validates the RFC 6901 path and
-- operation so the SQL boundary never accepts an out-of-vocabulary proposal.
create or replace function public.create_context_update_proposals(
  p_proposals jsonb
)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _prop jsonb;
  _id uuid;
  _fingerprint text;
  _path text;
  _operation text;
  _subject_id uuid;
begin
  for _prop in select * from jsonb_array_elements(p_proposals) loop
    _subject_id := (_prop->>'subject_id')::uuid;
    _path := _prop->>'path';
    _operation := _prop->>'operation';
    _fingerprint := _prop->>'semantic_fingerprint';

    -- Every new proposal must carry its evidence-linked semantic fingerprint.
    if _fingerprint is null or _fingerprint !~ '^[0-9a-f]{64}$' then
      raise exception 'semantic_fingerprint_required: proposal % is missing a 64-hex evidence-linked semantic fingerprint',
        coalesce(_prop->>'proposal_id', '<unknown>');
    end if;

    -- Bounded RFC 6901 path within the Living Brief proposal vocabulary.
    perform public.brief_path_tokens(_path);
    if (_prop->>'operation') not in ('add', 'replace', 'remove') then
      raise exception 'brief_operation_unsupported: % is not add/replace/remove', _operation;
    end if;

    -- Unchanged-evidence recurrence gate: a proposal whose semantic
    -- fingerprint was already rejected for this subject fails closed.  New
    -- evidence changes the fingerprint and becomes admissible.
    if exists (
      select 1 from public.rejected_context_proposals r
      where r.subject_id = _subject_id
        and r.semantic_fingerprint = _fingerprint
    ) then
      raise exception 'proposal_rejected_same_evidence: proposal % at path % was rejected without new evidence; add genuinely new evidence before proposing it again',
        coalesce(_prop->>'proposal_id', '<unknown>'), _path;
    end if;

    insert into public.context_update_proposals (
      subject_id, base_version, intelligence_run_id,
      path, operation, proposed_value, evidence_ids, reason, semantic_fingerprint
    ) values (
      _subject_id,
      (_prop->>'base_version')::integer,
      (_prop->>'intelligence_run_id')::uuid,
      _path,
      _operation,
      _prop->'proposed_value',
      coalesce(_prop->'evidence_ids', '[]'::jsonb),
      coalesce(_prop->>'reason', ''),
      _fingerprint
    )
    returning id into _id;
    return next _id;
  end loop;
  return;
end;
$$;

revoke all on function public.create_context_update_proposals(jsonb)
  from public, anon, authenticated;
grant execute on function public.create_context_update_proposals(jsonb)
  to service_role;

comment on function public.create_context_update_proposals(jsonb) is
  'Bulk-inserts model proposals after requiring a worker-computed semantic fingerprint, validating the bounded RFC 6901 path/operation, and rejecting unchanged-evidence recurrence. Raises stable exceptions; never partially inserts.';

-- 4b. resolve_context_update_proposal — atomic owner-confirmed resolution.
-- Existing 3-argument call site is preserved; p_explicit_confirmation is
-- optional (default false) and REQUIRED to be true when accepting a protected
-- field (identity incl. vision, positioning, goals, constraints).
--
-- accept : exact current base version required; one atomic transaction
--          appends the next confirmed Living Brief version derived from the
--          pinned base row, records a durable decision, and resolves the
--          proposal exactly once.
-- reject : records a durable decision and an evidence-linked rejection
--          fingerprint; never creates a brief version.
-- Any stale base, wrong-owner, invalid path/operation, duplicate resolution,
-- or missing confirmation raises and leaves all canonical state unchanged.
create or replace function public.resolve_context_update_proposal(
  p_proposal_id uuid,
  p_status text,
  p_user_id uuid,
  p_explicit_confirmation boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.context_update_proposals%rowtype;
  v_subject_user_id uuid;
  v_base public.living_brief_versions%rowtype;
  v_current_version integer;
  v_next_version integer;
  v_top text;
  v_tokens text[];
  v_new_identity jsonb;
  v_new_audience jsonb;
  v_new_positioning jsonb;
  v_new_offers jsonb;
  v_new_goals jsonb;
  v_new_constraints jsonb;
  v_new_experiments jsonb;
  v_new_decisions jsonb;
  v_new_version_id uuid;
  v_evidence_count integer;
begin
  if p_status not in ('accepted', 'rejected') then
    raise exception 'proposal_status_invalid: % is not accepted or rejected', p_status;
  end if;

  -- Owner scope + exactly-once: only 'proposed' rows are resolvable, and the
  -- row is locked so a concurrent resolution cannot double-apply.
  select cup.* into v_proposal
  from public.context_update_proposals cup
  where cup.id = p_proposal_id
    and cup.status = 'proposed'
  for update of cup;

  if not found then
    raise exception 'proposal % not found, not in proposed state, or not owned by user %', p_proposal_id, p_user_id;
  end if;

  select s.user_id into v_subject_user_id
  from public.subjects s
  where s.id = v_proposal.subject_id;
  if v_subject_user_id is distinct from p_user_id then
    raise exception 'proposal % is not owned by user %', p_proposal_id, p_user_id;
  end if;

  -- Bounded RFC 6901 path within the Living Brief proposal vocabulary.
  v_tokens := public.brief_path_tokens(v_proposal.path);
  v_top := v_tokens[1];
  if v_top not in ('identity', 'audience', 'positioning', 'offers', 'goals', 'constraints', 'experiments') then
    raise exception 'brief_path_outside_vocabulary: % is not a proposable Living Brief field', v_top;
  end if;

  -- Every evidence reference must be a well-formed UUID (the worker enforces
  -- subject scoping against the run evidence set; SQL enforces the format so
  -- malformed references can never ride a resolution).
  select count(*) into v_evidence_count
  from jsonb_array_elements_text(coalesce(v_proposal.evidence_ids, '[]'::jsonb)) e
  where e !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  if v_evidence_count > 0 then
    raise exception 'proposal_evidence_invalid: every evidence_id must be a valid UUID';
  end if;

  if p_status = 'rejected' then
    -- Durable decision, no brief version.
    insert into public.decisions (subject_id, user_id, target_type, target_id, decision, note)
    values (v_proposal.subject_id, p_user_id, 'proposal', p_proposal_id, 'rejected', '')
    on conflict do nothing;

    if v_proposal.semantic_fingerprint is not null then
      insert into public.rejected_context_proposals (
        subject_id, proposal_id, semantic_fingerprint, path, operation,
        proposed_value, evidence_ids, rejected_by
      ) values (
        v_proposal.subject_id, p_proposal_id, v_proposal.semantic_fingerprint,
        v_proposal.path, v_proposal.operation, v_proposal.proposed_value,
        v_proposal.evidence_ids, p_user_id
      )
      on conflict (subject_id, semantic_fingerprint) do nothing;
    end if;

    update public.context_update_proposals
    set status = 'rejected',
        decided_by = p_user_id,
        decided_at = now()
    where id = p_proposal_id;
    return;
  end if;

  -- Accepted: protected fields require the owner-scoped explicit
  -- confirmation input.  Missing confirmation fails closed before any write.
  if public.brief_path_is_protected(v_proposal.path) and not coalesce(p_explicit_confirmation, false) then
    raise exception 'protected_brief_path_requires_confirmation: % (identity incl. vision, positioning, goals, constraints) requires explicit owner confirmation', v_top;
  end if;

  -- Exact current base version: the proposal must be based on the current
  -- latest Living Brief version for the subject.
  select coalesce(max(version), 0) into v_current_version
  from public.living_brief_versions
  where subject_id = v_proposal.subject_id;
  if v_current_version <> v_proposal.base_version then
    raise exception 'stale_base_version: proposal % based on version % but current version is %',
      p_proposal_id, v_proposal.base_version, v_current_version;
  end if;

  select * into v_base
  from public.living_brief_versions
  where subject_id = v_proposal.subject_id
    and version = v_proposal.base_version;
  if not found then
    raise exception 'stale_base_version: base version % does not exist for proposal %',
      v_proposal.base_version, p_proposal_id;
  end if;

  -- Apply the bounded RFC 6901 diff to the pinned base row's target column.
  v_new_identity := v_base.identity;
  v_new_audience := v_base.audience;
  v_new_positioning := v_base.positioning;
  v_new_offers := v_base.offers;
  v_new_goals := v_base.goals;
  v_new_constraints := v_base.constraints;
  v_new_experiments := v_base.experiments;

  if v_top = 'identity' then
    v_new_identity := public.apply_brief_pointer(v_base.identity, v_proposal.path, v_proposal.operation, v_proposal.proposed_value);
  elsif v_top = 'audience' then
    v_new_audience := public.apply_brief_pointer(v_base.audience, v_proposal.path, v_proposal.operation, v_proposal.proposed_value);
  elsif v_top = 'positioning' then
    v_new_positioning := public.apply_brief_pointer(v_base.positioning, v_proposal.path, v_proposal.operation, v_proposal.proposed_value);
  elsif v_top = 'offers' then
    v_new_offers := public.apply_brief_pointer(v_base.offers, v_proposal.path, v_proposal.operation, v_proposal.proposed_value);
  elsif v_top = 'goals' then
    v_new_goals := public.apply_brief_pointer(v_base.goals, v_proposal.path, v_proposal.operation, v_proposal.proposed_value);
  elsif v_top = 'constraints' then
    v_new_constraints := public.apply_brief_pointer(v_base.constraints, v_proposal.path, v_proposal.operation, v_proposal.proposed_value);
  else
    v_new_experiments := public.apply_brief_pointer(v_base.experiments, v_proposal.path, v_proposal.operation, v_proposal.proposed_value);
  end if;

  v_next_version := v_proposal.base_version + 1;
  v_new_decisions := coalesce(v_base.decisions, '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
      'target_type', 'proposal',
      'target_id', p_proposal_id,
      'decision', 'accepted'
    )
  );

  -- One atomic append: next confirmed version derived from the pinned base.
  insert into public.living_brief_versions (
    subject_id, version, schema_version, identity, audience, positioning,
    offers, goals, constraints, experiments, decisions, confirmed, created_by
  ) values (
    v_proposal.subject_id, v_next_version, v_base.schema_version,
    v_new_identity, v_new_audience, v_new_positioning,
    v_new_offers, v_new_goals, v_new_constraints, v_new_experiments,
    v_new_decisions, true, p_user_id
  )
  returning id into v_new_version_id;

  -- Durable decision for the accepted proposal.
  insert into public.decisions (subject_id, user_id, target_type, target_id, decision, note)
  values (v_proposal.subject_id, p_user_id, 'proposal', p_proposal_id, 'accepted', '');

  -- Resolve the proposal exactly once.
  update public.context_update_proposals
  set status = 'accepted',
      decided_by = p_user_id,
      decided_at = now()
  where id = p_proposal_id
    and status = 'proposed';

  if not found then
    raise exception 'proposal % was already resolved', p_proposal_id;
  end if;
end;
$$;

revoke all on function public.resolve_context_update_proposal(uuid, text, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.resolve_context_update_proposal(uuid, text, uuid, boolean)
  to service_role;

-- Backward-compatible 3-argument wrapper preserving the existing product call
-- site.  It delegates to the canonical 4-argument implementation with
-- p_explicit_confirmation = false, so accepting a protected field (identity
-- incl. vision, positioning, goals, constraints) now fails closed unless the
-- caller explicitly confirms.
create or replace function public.resolve_context_update_proposal(
  p_proposal_id uuid,
  p_status text,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.resolve_context_update_proposal(
    p_proposal_id,
    p_status,
    p_user_id,
    false
  );
end;
$$;

revoke all on function public.resolve_context_update_proposal(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_context_update_proposal(uuid, text, uuid)
  to service_role;

comment on function public.resolve_context_update_proposal(uuid, text, uuid, boolean) is
  'Atomic owner-confirmed proposal resolution. Accept appends exactly one confirmed next Living Brief version plus a durable decision; reject records a decision and rejection fingerprint with no version. Protected fields require p_explicit_confirmation = true. Stale base, wrong owner, invalid path/operation, duplicate resolution, malformed evidence, and missing confirmation all raise and leave canonical state unchanged.';

-- ===========================================================================
-- 5. RLS on the rejection ledger.
-- ===========================================================================
alter table public.rejected_context_proposals enable row level security;

drop policy if exists rejected_context_proposals_select_own on public.rejected_context_proposals;
create policy rejected_context_proposals_select_own on public.rejected_context_proposals
  for select to authenticated
  using (public.owns_subject(subject_id));

drop policy if exists rejected_context_proposals_admin_all on public.rejected_context_proposals;
create policy rejected_context_proposals_admin_all on public.rejected_context_proposals
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.rejected_context_proposals from anon;
revoke insert, update, delete on public.rejected_context_proposals from authenticated;
grant select on public.rejected_context_proposals to authenticated;
grant all on public.rejected_context_proposals to service_role;

-- ===========================================================================
-- 6. Immutability note (kernel trigger preserved; nothing here mutates
--    living_brief_versions).
-- ===========================================================================
-- The kernel trigger reject_living_brief_mutation still rejects UPDATE and
-- DELETE on living_brief_versions.  This migration only INSERTs new versions
-- inside resolve_context_update_proposal; existing versions remain immutable.
