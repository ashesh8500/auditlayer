-- AuditLayer share links — Google Docs-style sharing for reports.
-- Authoritative contract: docs/architecture-contract.md
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- share_links: one row per generated share link, owned by a profile.
-- ---------------------------------------------------------------------------
create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits (id) on delete cascade,
  token text not null unique,
  mode text not null check (mode in ('public', 'email')),
  email text,
  verified_at timestamptz,
  verification_code text,
  verification_code_expires timestamptz,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  view_count int not null default 0
);

-- Indexes
create index if not exists share_links_token_idx on public.share_links (token);
create index if not exists share_links_audit_id_idx on public.share_links (audit_id);
create index if not exists share_links_created_by_idx on public.share_links (created_by);

-- updated_at trigger
drop trigger if exists set_share_links_updated_at on public.share_links;
create trigger set_share_links_updated_at
  before update on public.share_links
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helper: validate a share link without revealing whether it exists.
-- Returns the audit_id if the link is valid (not revoked, not expired,
-- audit is ready), or null otherwise.
-- ---------------------------------------------------------------------------
create or replace function public.is_share_link_valid(p_token text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select sl.audit_id
  from public.share_links sl
  join public.audits a on a.id = sl.audit_id
  where sl.token = p_token
    and sl.revoked_at is null
    and (sl.expires_at is null or sl.expires_at > now())
    and a.status = 'ready'
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- RLS: owners manage their own links; admins have full access.
-- ---------------------------------------------------------------------------
alter table public.share_links enable row level security;

-- Public/anonymous: anyone can read an active share link (needed for the /s/ page).
-- The server-side code also validates revocation, expiry, and audit readiness.
drop policy if exists share_links_public_read on public.share_links;
create policy share_links_public_read on public.share_links
  for select to anon, authenticated
  using (true);

-- Owners: manage their own links.
create policy share_links_select_own on public.share_links
  for select to authenticated
  using (created_by = auth.uid() or public.is_admin());

drop policy if exists share_links_insert_own on public.share_links;
create policy share_links_insert_own on public.share_links
  for insert to authenticated
  with check (created_by = auth.uid() or public.is_admin());

drop policy if exists share_links_delete_own on public.share_links;
create policy share_links_delete_own on public.share_links
  for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

drop policy if exists share_links_admin_all on public.share_links;
create policy share_links_admin_all on public.share_links
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Helper: increment view count for a share link (called by the report API).
-- ---------------------------------------------------------------------------
create or replace function public.increment_share_view(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.share_links
  set view_count = view_count + 1
  where token = p_token;
$$;
