-- Add account_type, gifted_audits, and trial_link_id to profiles.
alter table public.profiles
  add column if not exists account_type text not null default 'standard'
    check (account_type in ('standard', 'trial', 'comp'));

alter table public.profiles
  add column if not exists gifted_audits int not null default 0;

alter table public.profiles
  add column if not exists trial_link_id uuid;
