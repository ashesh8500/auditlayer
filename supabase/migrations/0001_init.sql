-- AuditLayer initial schema.
-- Authoritative contract: docs/architecture-contract.md
-- Idempotent: safe to re-run.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user. Mirrors auth.users (1:1).
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text not null default '',
  role text not null default 'client' check (role in ('client', 'admin')),
  plan text not null default 'free',
  subscription_status text not null default 'trial',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  onboarding_status text not null default 'lead',
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- audits: one row per requested audit, owned by a profile.
-- ---------------------------------------------------------------------------
create table if not exists public.audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  handle text not null,
  platform text not null default 'unknown',
  goal text not null default 'growth',
  context text not null default '',
  status text not null default 'queued',
  limitations jsonb not null default '[]'::jsonb,
  admin_notes text not null default '',
  milestone_label text,
  model text,
  report_path text,
  report_url text,
  pdf_url text,
  cost_usd numeric not null default 0,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists audits_user_id_idx on public.audits (user_id);
create index if not exists audits_status_idx on public.audits (status);
create index if not exists audits_created_at_idx on public.audits (created_at desc);

-- ---------------------------------------------------------------------------
-- audit_events: append-only event trail powering the live generation stream.
-- ---------------------------------------------------------------------------
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits (id) on delete cascade,
  actor text not null default 'system',
  event_type text not null,
  phase text,
  detail text not null default '',
  created_at timestamptz default now()
);

create index if not exists audit_events_audit_id_idx on public.audit_events (audit_id);
create index if not exists audit_events_created_at_idx on public.audit_events (created_at);

-- ---------------------------------------------------------------------------
-- refinements: section-scoped refinement requests against a generated report.
-- ---------------------------------------------------------------------------
create table if not exists public.refinements (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits (id) on delete cascade,
  user_id uuid,
  section text not null,
  instruction text not null,
  status text not null default 'queued',
  error text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists refinements_audit_id_idx on public.refinements (audit_id);
create index if not exists refinements_status_idx on public.refinements (status);

-- ---------------------------------------------------------------------------
-- app_settings: single-row admin configuration for the Hermes worker.
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  hermes_model text not null default 'deepseek-v4-pro',
  hermes_api_base text not null default 'http://127.0.0.1:8642/v1',
  enabled_toolsets jsonb not null default '["web","browser","x_search"]'::jsonb,
  token_cap int not null default 32000,
  cost_cap_usd numeric not null default 3,
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance trigger for tables that track mutation time.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_audits_updated_at on public.audits;
create trigger set_audits_updated_at
  before update on public.audits
  for each row execute function public.set_updated_at();

drop trigger if exists set_refinements_updated_at on public.refinements;
create trigger set_refinements_updated_at
  before update on public.refinements
  for each row execute function public.set_updated_at();

drop trigger if exists set_app_settings_updated_at on public.app_settings;
create trigger set_app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-provision a profile row when a new auth user is created.
-- The auth agent owns admin allowlisting; new users default to role 'client'.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
