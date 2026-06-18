-- Admin audit trail for user management actions.
create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id),
  target_user_id uuid references public.profiles(id),
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists admin_actions_target_idx on public.admin_actions (target_user_id);
create index if not exists admin_actions_created_at_idx on public.admin_actions (created_at desc);
