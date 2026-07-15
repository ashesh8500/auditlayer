-- Account ownership: users track handles they care about across multiple audits.
-- One account row per (user_id, handle, platform). Auto-created on first audit
-- submission for that handle. Progression data is accumulated per audit.

create table if not exists public.accounts (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references public.profiles(id) on delete cascade,
    handle        text not null,
    platform      text not null default 'instagram',
    display_name  text,
    avatar_url    text,
    created_at    timestamptz not null default now(),
    unique (user_id, handle, platform)
);

alter table public.audits add column if not exists account_id uuid
    references public.accounts(id) on delete set null;

create index if not exists idx_accounts_user on accounts(user_id);
create index if not exists idx_audits_account on audits(account_id);

-- Progression: per-account metrics extracted after each successful audit.
-- Populated by the worker so the dashboard can show follower growth, engagement
-- trends, and score progression without parsing old reports.
create table if not exists public.account_progression (
    id            uuid primary key default gen_random_uuid(),
    account_id    uuid not null references public.accounts(id) on delete cascade,
    audit_id      uuid not null references public.audits(id) on delete cascade,
    recorded_at   timestamptz not null default now(),
    followers     integer,
    engagement    numeric(5,2),
    avg_likes     numeric(8,1),
    avg_comments  numeric(8,1),
    score         integer,
    unique (audit_id)
);

create index if not exists idx_progression_account
    on account_progression(account_id, recorded_at desc);

-- RLS: users can read their own accounts and progression.
alter table public.accounts enable row level security;
alter table public.account_progression enable row level security;

create policy "Users can read own accounts"
    on public.accounts for select
    using (auth.uid() = user_id);

create policy "Users can read own account progression"
    on public.account_progression for select
    using (exists (
        select 1 from public.accounts
        where accounts.id = account_progression.account_id
        and accounts.user_id = auth.uid()
    ));
