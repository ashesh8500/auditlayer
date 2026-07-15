-- Trial links for gifted-audit signup flow.
create table if not exists public.trial_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  audits_granted int not null default 3 check (audits_granted >= 1 and audits_granted <= 50),
  created_by uuid not null references public.profiles(id),
  label text,
  max_uses int,
  used_count int not null default 0,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists trial_links_token_idx on public.trial_links (token);
create index if not exists trial_links_created_at_idx on public.trial_links (created_at desc);

-- FK for profiles.trial_link_id
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_trial_link_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_trial_link_id_fkey
      foreign key (trial_link_id) references public.trial_links(id) on delete set null;
  end if;
end
$$;
