-- ALM Intelligence v1 — AI storage, evidence snapshot membership, customer
-- progress projection, and append-only evidence enforcement.
-- Additive. Empty embedding tables are intentional until the runtime writer lands.
-- Idempotent: safe to re-run.

-- ===========================================================================
-- 1. pgvector extension (public schema — Supabase local/default)
-- ===========================================================================
create extension if not exists vector;

-- ===========================================================================
-- 2. embedding_models — registry (model id → dims → distance metric)
-- ===========================================================================
create table if not exists public.embedding_models (
  id               text primary key,
  provider         text not null default '',
  dims             integer not null check (dims > 0 and dims <= 8192),
  distance_metric  text not null default 'cosine'
    check (distance_metric in ('cosine', 'l2', 'inner_product')),
  notes            text not null default '',
  created_at       timestamptz not null default now()
);

comment on table public.embedding_models is
  'Registry of embedding models. Prevents silent cross-model cosine similarity.';

alter table public.embedding_models enable row level security;

drop policy if exists embedding_models_admin_select on public.embedding_models;
create policy embedding_models_admin_select on public.embedding_models
  for select to authenticated
  using (public.is_admin());

drop policy if exists embedding_models_admin_all on public.embedding_models;
create policy embedding_models_admin_all on public.embedding_models
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.embedding_models from anon;
grant select on public.embedding_models to authenticated, service_role;
grant insert, update, delete on public.embedding_models to service_role;

-- ===========================================================================
-- 3. evidence_embeddings — secondary ANN index over evidence (not SoR)
-- ===========================================================================
create table if not exists public.evidence_embeddings (
  id            uuid primary key default gen_random_uuid(),
  evidence_id   uuid not null references public.evidence(id) on delete cascade,
  subject_id    uuid not null references public.subjects(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  model_id      text not null references public.embedding_models(id) on delete restrict,
  dims          integer not null check (dims > 0 and dims <= 8192),
  content_hash  text not null check (char_length(content_hash) >= 16),
  embedding     vector,
  created_at    timestamptz not null default now(),
  unique (evidence_id, model_id, content_hash)
);

create index if not exists idx_evidence_embeddings_subject
  on public.evidence_embeddings(subject_id, model_id);
create index if not exists idx_evidence_embeddings_user
  on public.evidence_embeddings(user_id, model_id);
create index if not exists idx_evidence_embeddings_evidence
  on public.evidence_embeddings(evidence_id);

comment on table public.evidence_embeddings is
  'pgvector secondary index over evidence ledger text. Never the system of record. Empty tables OK until runtime writer lands.';
comment on column public.evidence_embeddings.user_id is
  'Denormalized tenant owner for RLS without joining subjects on every ANN probe.';
comment on column public.evidence_embeddings.dims is
  'Must match embedding_models.dims for model_id. Enforced by attach_evidence_embedding.';

alter table public.evidence_embeddings enable row level security;

drop policy if exists evidence_embeddings_select_own on public.evidence_embeddings;
create policy evidence_embeddings_select_own on public.evidence_embeddings
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists evidence_embeddings_admin_all on public.evidence_embeddings;
create policy evidence_embeddings_admin_all on public.evidence_embeddings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.evidence_embeddings from anon;
grant select on public.evidence_embeddings to authenticated, service_role;
grant insert, update, delete on public.evidence_embeddings to service_role;

-- ===========================================================================
-- 4. evidence_snapshot_members — immutable membership sets
-- ===========================================================================
create table if not exists public.evidence_snapshot_members (
  snapshot_id  uuid not null references public.evidence_snapshots(id) on delete restrict,
  evidence_id  uuid not null references public.evidence(id) on delete restrict,
  added_at     timestamptz not null default now(),
  primary key (snapshot_id, evidence_id)
);

create index if not exists idx_evidence_snapshot_members_evidence
  on public.evidence_snapshot_members(evidence_id);

comment on table public.evidence_snapshot_members is
  'Append-only membership of evidence items in an immutable snapshot. Reuse never mutates evidence rows or renews observed_at.';

alter table public.evidence_snapshot_members enable row level security;

drop policy if exists evidence_snapshot_members_select_own on public.evidence_snapshot_members;
create policy evidence_snapshot_members_select_own on public.evidence_snapshot_members
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.evidence_snapshots es
      join public.subjects s on s.id = es.subject_id
      where es.id = evidence_snapshot_members.snapshot_id
        and s.user_id = auth.uid()
    )
  );

drop policy if exists evidence_snapshot_members_admin_all on public.evidence_snapshot_members;
create policy evidence_snapshot_members_admin_all on public.evidence_snapshot_members
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.evidence_snapshot_members from anon;
grant select on public.evidence_snapshot_members to authenticated, service_role;
grant insert, update, delete on public.evidence_snapshot_members to service_role;

-- Backfill membership from legacy evidence.snapshot_id column when present.
insert into public.evidence_snapshot_members (snapshot_id, evidence_id)
select e.snapshot_id, e.id
from public.evidence e
where e.snapshot_id is not null
on conflict do nothing;

-- ===========================================================================
-- 5. Customer progress projection (allowlisted states only)
-- ===========================================================================
create table if not exists public.intelligence_run_progress (
  intelligence_run_id uuid primary key
    references public.intelligence_runs(id) on delete cascade,
  subject_id     uuid not null references public.subjects(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  customer_state text not null default 'preparing'
    check (customer_state in (
      'preparing', 'analyzing', 'finalizing', 'delayed', 'succeeded', 'failed'
    )),
  detail         text not null default '',
  updated_at     timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index if not exists idx_intelligence_run_progress_user
  on public.intelligence_run_progress(user_id, updated_at desc);
create index if not exists idx_intelligence_run_progress_subject
  on public.intelligence_run_progress(subject_id, updated_at desc);

comment on table public.intelligence_run_progress is
  'Customer-safe progress projection. Allowlisted states only — never internal phases, workers, cache hits, or tracebacks.';

alter table public.intelligence_run_progress enable row level security;

drop policy if exists intelligence_run_progress_select_own on public.intelligence_run_progress;
create policy intelligence_run_progress_select_own on public.intelligence_run_progress
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists intelligence_run_progress_admin_all on public.intelligence_run_progress;
create policy intelligence_run_progress_admin_all on public.intelligence_run_progress
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists set_intelligence_run_progress_updated_at
  on public.intelligence_run_progress;
create trigger set_intelligence_run_progress_updated_at
  before update on public.intelligence_run_progress
  for each row execute function public.set_updated_at();

revoke all on public.intelligence_run_progress from anon;
grant select on public.intelligence_run_progress to authenticated, service_role;
grant insert, update, delete on public.intelligence_run_progress to service_role;

-- ===========================================================================
-- 6. Append-only / immutability triggers
-- ===========================================================================
create or replace function public.reject_evidence_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'evidence is append-only — UPDATE and DELETE are rejected';
end;
$$;

drop trigger if exists reject_evidence_mutation on public.evidence;
create trigger reject_evidence_mutation
  before update or delete on public.evidence
  for each row execute function public.reject_evidence_mutation();

create or replace function public.reject_evidence_snapshot_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'evidence_snapshots is immutable — UPDATE and DELETE are rejected';
end;
$$;

drop trigger if exists reject_evidence_snapshot_mutation on public.evidence_snapshots;
create trigger reject_evidence_snapshot_mutation
  before update or delete on public.evidence_snapshots
  for each row execute function public.reject_evidence_snapshot_mutation();

create or replace function public.reject_evidence_snapshot_member_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'evidence_snapshot_members is append-only — UPDATE is rejected';
  elsif tg_op = 'DELETE' then
    raise exception 'evidence_snapshot_members is append-only — DELETE is rejected';
  end if;
  return null;
end;
$$;

drop trigger if exists reject_evidence_snapshot_member_mutation
  on public.evidence_snapshot_members;
create trigger reject_evidence_snapshot_member_mutation
  before update or delete on public.evidence_snapshot_members
  for each row execute function public.reject_evidence_snapshot_member_mutation();

-- ===========================================================================
-- 7. RPCs — membership pin, improved upsert, progress, embeddings
-- ===========================================================================

-- 7a. pin_evidence_to_snapshot — same-subject integrity
create or replace function public.pin_evidence_to_snapshot(
  p_snapshot_id uuid,
  p_evidence_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject_id uuid;
  v_evidence_id uuid;
  v_count integer := 0;
begin
  select subject_id into v_subject_id
  from public.evidence_snapshots
  where id = p_snapshot_id;
  if v_subject_id is null then
    raise exception 'evidence snapshot % not found', p_snapshot_id;
  end if;

  foreach v_evidence_id in array p_evidence_ids loop
    if not exists (
      select 1 from public.evidence
      where id = v_evidence_id and subject_id = v_subject_id
    ) then
      raise exception 'evidence % does not belong to subject %',
        v_evidence_id, v_subject_id;
    end if;

    insert into public.evidence_snapshot_members (snapshot_id, evidence_id)
    values (p_snapshot_id, v_evidence_id)
    on conflict do nothing;

    if found then
      v_count := v_count + 1;
    else
      -- ON CONFLICT DO NOTHING does not set FOUND reliably across PG versions;
      -- count membership presence instead after attempt.
      null;
    end if;
  end loop;

  select count(*)::integer into v_count
  from public.evidence_snapshot_members
  where snapshot_id = p_snapshot_id
    and evidence_id = any(p_evidence_ids);

  return v_count;
end;
$$;

revoke all on function public.pin_evidence_to_snapshot(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.pin_evidence_to_snapshot(uuid, uuid[])
  to service_role;

comment on function public.pin_evidence_to_snapshot(uuid, uuid[]) is
  'Append membership of evidence IDs to a snapshot. Enforces same-subject integrity. Idempotent.';

-- 7b. upsert_evidence — append-only insert + optional snapshot membership
create or replace function public.upsert_evidence(
  p_items jsonb
)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _item jsonb;
  _id uuid;
  _snapshot_id uuid;
begin
  for _item in select * from jsonb_array_elements(p_items) loop
    _snapshot_id := nullif(_item->>'snapshot_id', '')::uuid;

    insert into public.evidence (
      subject_id, channel_id, snapshot_id,
      source_type, source_url, observed_at, expires_at,
      content_hash, confidence, coverage, payload
    ) values (
      (_item->>'subject_id')::uuid,
      nullif(_item->>'channel_id', '')::uuid,
      _snapshot_id,
      _item->>'source_type',
      nullif(_item->>'source_url', ''),
      (_item->>'observed_at')::timestamptz,
      case when _item ? 'expires_at' and nullif(_item->>'expires_at', '') is not null
           then (_item->>'expires_at')::timestamptz else null end,
      _item->>'content_hash',
      _item->>'confidence',
      coalesce(_item->'coverage', '{}'::jsonb),
      coalesce(_item->'payload', '{}'::jsonb)
    )
    on conflict (subject_id, content_hash) do nothing
    returning id into _id;

    if _id is null then
      select id into _id
      from public.evidence
      where subject_id = (_item->>'subject_id')::uuid
        and content_hash = _item->>'content_hash';
    end if;

    if _id is not null and _snapshot_id is not null then
      perform public.pin_evidence_to_snapshot(_snapshot_id, array[_id]);
    end if;

    return next _id;
  end loop;
  return;
end;
$$;

revoke all on function public.upsert_evidence(jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_evidence(jsonb)
  to service_role;

-- 7c. set_intelligence_run_progress — customer-safe projection writer
create or replace function public.set_intelligence_run_progress(
  p_run_id uuid,
  p_customer_state text,
  p_detail text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject_id uuid;
  v_user_id uuid;
begin
  if p_customer_state not in (
    'preparing', 'analyzing', 'finalizing', 'delayed', 'succeeded', 'failed'
  ) then
    raise exception 'invalid customer_state %', p_customer_state;
  end if;

  select ir.subject_id, s.user_id
    into v_subject_id, v_user_id
  from public.intelligence_runs ir
  join public.subjects s on s.id = ir.subject_id
  where ir.id = p_run_id;

  if v_subject_id is null then
    raise exception 'intelligence run % not found', p_run_id;
  end if;

  insert into public.intelligence_run_progress (
    intelligence_run_id, subject_id, user_id, customer_state, detail
  ) values (
    p_run_id, v_subject_id, v_user_id, p_customer_state, coalesce(p_detail, '')
  )
  on conflict (intelligence_run_id) do update set
    customer_state = excluded.customer_state,
    detail = excluded.detail,
    updated_at = now();
end;
$$;

revoke all on function public.set_intelligence_run_progress(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.set_intelligence_run_progress(uuid, text, text)
  to service_role;

-- 7d. register_embedding_model
create or replace function public.register_embedding_model(
  p_id text,
  p_dims integer,
  p_provider text default '',
  p_distance_metric text default 'cosine',
  p_notes text default ''
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.embedding_models (id, provider, dims, distance_metric, notes)
  values (p_id, coalesce(p_provider, ''), p_dims, coalesce(p_distance_metric, 'cosine'), coalesce(p_notes, ''))
  on conflict (id) do update set
    provider = excluded.provider,
    dims = excluded.dims,
    distance_metric = excluded.distance_metric,
    notes = excluded.notes;
  return p_id;
end;
$$;

revoke all on function public.register_embedding_model(text, integer, text, text, text)
  from public, anon, authenticated;
grant execute on function public.register_embedding_model(text, integer, text, text, text)
  to service_role;

-- 7e. attach_evidence_embedding — empty-capable writer for later runtime use
create or replace function public.attach_evidence_embedding(
  p_evidence_id uuid,
  p_model_id text,
  p_embedding vector,
  p_content_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject_id uuid;
  v_user_id uuid;
  v_dims integer;
  v_model_dims integer;
  v_id uuid;
begin
  select e.subject_id, s.user_id
    into v_subject_id, v_user_id
  from public.evidence e
  join public.subjects s on s.id = e.subject_id
  where e.id = p_evidence_id;

  if v_subject_id is null then
    raise exception 'evidence % not found', p_evidence_id;
  end if;

  select dims into v_model_dims
  from public.embedding_models
  where id = p_model_id;
  if v_model_dims is null then
    raise exception 'embedding model % not registered', p_model_id;
  end if;

  v_dims := vector_dims(p_embedding);
  if v_dims <> v_model_dims then
    raise exception 'embedding dims % does not match model % dims %',
      v_dims, p_model_id, v_model_dims;
  end if;

  insert into public.evidence_embeddings (
    evidence_id, subject_id, user_id, model_id, dims, content_hash, embedding
  ) values (
    p_evidence_id, v_subject_id, v_user_id, p_model_id, v_dims, p_content_hash, p_embedding
  )
  on conflict (evidence_id, model_id, content_hash) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from public.evidence_embeddings
    where evidence_id = p_evidence_id
      and model_id = p_model_id
      and content_hash = p_content_hash;
  end if;

  return v_id;
end;
$$;

revoke all on function public.attach_evidence_embedding(uuid, text, vector, text)
  from public, anon, authenticated;
grant execute on function public.attach_evidence_embedding(uuid, text, vector, text)
  to service_role;

comment on function public.attach_evidence_embedding(uuid, text, vector, text) is
  'Optional writer for evidence embeddings. Validates model dims. Idempotent on (evidence, model, content_hash).';
