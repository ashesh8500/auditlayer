-- Accounts are workspace properties the user connected or explicitly manages.
-- Public audit targets belong in audits/reports and must never become Accounts.

alter table public.accounts
  add column if not exists ownership_status text,
  add column if not exists ig_connection_id uuid
    references public.instagram_connections(id) on delete set null;

-- Backfill only accounts with real active Instagram connections.
update public.accounts as account
set ownership_status = 'connected',
    ig_connection_id = connection.id
from public.instagram_connections as connection
where connection.user_id = account.user_id
  and account.platform = 'instagram'
  and lower(connection.ig_username) = lower(account.handle)
  and connection.is_active = true;

-- Before this migration there was no manual managed-account creation path:
-- rows came only from the audit worker's automatic target upsert or from an
-- Instagram connection. Therefore every remaining unlinked row is an audit
-- target, not a user-managed property. Preserve the audits themselves; the FK
-- intentionally becomes null.
update public.audits
set account_id = null
where account_id in (
  select id from public.accounts where ownership_status is null
);

delete from public.accounts
where ownership_status is null;

alter table public.accounts
  alter column ownership_status set default 'managed',
  alter column ownership_status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'accounts_ownership_status_check'
  ) then
    alter table public.accounts
      add constraint accounts_ownership_status_check
      check (ownership_status in ('connected', 'managed'));
  end if;
end $$;

create index if not exists idx_accounts_user_ownership
  on public.accounts(user_id, ownership_status, created_at desc);

create unique index if not exists idx_accounts_ig_connection_unique
  on public.accounts(ig_connection_id)
  where ig_connection_id is not null;

comment on table public.accounts is
  'User workspace properties: Instagram-connected or explicitly managed accounts only. Public audit targets remain in audits.';
comment on column public.accounts.ownership_status is
  'connected = OAuth-backed; managed = explicitly configured without OAuth';
