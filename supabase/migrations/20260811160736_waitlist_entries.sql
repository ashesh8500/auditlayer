create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  email text not null unique check (
    char_length(email) <= 254
    and email = lower(email)
    and position('@' in email) > 1
  ),
  organization text not null default '' check (char_length(organization) <= 160),
  social_handle text not null default '' check (char_length(social_handle) <= 160),
  primary_interest text not null check (
    primary_interest in (
      'brand-strategy',
      'competitive-intelligence',
      'content-planning',
      'account-growth',
      'ongoing-management',
      'team-enterprise'
    )
  ),
  notes text not null default '' check (char_length(notes) <= 2000),
  marketing_updates boolean not null default false,
  source text not null default 'website' check (source in ('website')),
  status text not null default 'new' check (
    status in ('new', 'contacted', 'invited', 'closed')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.waitlist_entries is
  'Founder-managed early-access leads submitted through the public AuditLayerMedia website.';

alter table public.waitlist_entries enable row level security;
alter table public.waitlist_entries force row level security;

-- Public submissions are accepted only through the validated server action.
-- No browser role can read, insert, update, or delete waitlist records directly.
revoke all on table public.waitlist_entries from anon, authenticated;
grant all on table public.waitlist_entries to service_role;
