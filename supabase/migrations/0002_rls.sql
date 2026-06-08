-- AuditLayer Row Level Security.
-- Authoritative contract: docs/architecture-contract.md
-- Idempotent: safe to re-run.
--
-- The Python Hermes worker and trusted server actions use the service_role key,
-- which BYPASSES RLS entirely. These policies govern the anon/authenticated
-- (browser) roles only.

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER to avoid RLS recursion).
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

create or replace function public.owns_audit(target_audit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.audits a
    where a.id = target_audit_id
      and a.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS on every table.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.audits enable row level security;
alter table public.audit_events enable row level security;
alter table public.refinements enable row level security;
alter table public.app_settings enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select to authenticated
  using (public.is_admin());

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- audits
-- ---------------------------------------------------------------------------
drop policy if exists audits_select_own on public.audits;
create policy audits_select_own on public.audits
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists audits_insert_own on public.audits;
create policy audits_insert_own on public.audits
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists audits_admin_all on public.audits;
create policy audits_admin_all on public.audits
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- audit_events (read-only for clients; worker writes via service_role)
-- ---------------------------------------------------------------------------
drop policy if exists audit_events_select_own on public.audit_events;
create policy audit_events_select_own on public.audit_events
  for select to authenticated
  using (public.owns_audit(audit_id));

drop policy if exists audit_events_admin_all on public.audit_events;
create policy audit_events_admin_all on public.audit_events
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- refinements (clients read their own via audit ownership; admin full access).
-- Refinement enqueue happens through a trusted server action / service_role.
-- ---------------------------------------------------------------------------
drop policy if exists refinements_select_own on public.refinements;
create policy refinements_select_own on public.refinements
  for select to authenticated
  using (public.owns_audit(audit_id));

drop policy if exists refinements_admin_all on public.refinements;
create policy refinements_admin_all on public.refinements
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- app_settings (admin-only; worker reads via service_role)
-- ---------------------------------------------------------------------------
drop policy if exists app_settings_select_admin on public.app_settings;
create policy app_settings_select_admin on public.app_settings
  for select to authenticated
  using (public.is_admin());

drop policy if exists app_settings_update_admin on public.app_settings;
create policy app_settings_update_admin on public.app_settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
