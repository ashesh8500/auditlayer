-- Add account_type, gifted_audits, and trial_link_id to profiles.
alter table public.profiles
  add column if not exists account_type text not null default 'standard';

alter table public.profiles
  add column if not exists gifted_audits int not null default 0;

alter table public.profiles
  add column if not exists trial_link_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_account_type_check'
  ) then
    alter table public.profiles
      add constraint profiles_account_type_check
      check (account_type in ('standard', 'trial', 'comp'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_gifted_audits_check'
  ) then
    alter table public.profiles
      add constraint profiles_gifted_audits_check check (gifted_audits >= 0);
  end if;
end
$$;
