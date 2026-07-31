-- ALM kernel wave: schema bug fixes + research-cache TTL reconciliation.
-- Idempotent. Does not apply production automatically (release gate owns push).

-- ===========================================================================
-- 1. accounts.updated_at — required by Instagram connection persistence.
-- ===========================================================================
alter table public.accounts
  add column if not exists updated_at timestamptz not null default now();

update public.accounts
   set updated_at = coalesce(created_at, now())
 where updated_at is null;

drop trigger if exists set_accounts_updated_at on public.accounts;
create trigger set_accounts_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

comment on column public.accounts.updated_at is
  'Mutation timestamp. Restored so persist_instagram_connection and future Subject bridge writers can bump it safely.';

-- Restore updated_at writes on the transactional Instagram RPC.
create or replace function public.persist_instagram_connection(
  p_user_id uuid,
  p_ig_user_id bigint,
  p_ig_username text,
  p_long_lived_token text,
  p_long_lived_expires_at timestamptz,
  p_account_type text,
  p_followers_count bigint,
  p_media_count bigint
)
returns table(connection_id uuid, account_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection_id uuid;
  v_account_id uuid;
  v_handle text := lower(trim(leading '@' from p_ig_username));
begin
  if p_user_id is null or p_ig_user_id is null or v_handle = '' then
    raise exception 'invalid_instagram_connection';
  end if;

  insert into public.instagram_connections (
    user_id,
    ig_user_id,
    ig_username,
    long_lived_token,
    long_lived_expires_at,
    account_type,
    followers_count,
    media_count,
    is_active,
    last_refreshed_at,
    updated_at
  ) values (
    p_user_id,
    p_ig_user_id,
    v_handle,
    p_long_lived_token,
    p_long_lived_expires_at,
    p_account_type,
    p_followers_count,
    p_media_count,
    true,
    now(),
    now()
  )
  on conflict (user_id, ig_user_id) do update set
    ig_username = excluded.ig_username,
    long_lived_token = excluded.long_lived_token,
    long_lived_expires_at = excluded.long_lived_expires_at,
    account_type = excluded.account_type,
    followers_count = excluded.followers_count,
    media_count = excluded.media_count,
    is_active = true,
    last_refreshed_at = now(),
    updated_at = now()
  returning id into v_connection_id;

  select id
    into v_account_id
    from public.accounts
   where user_id = p_user_id
     and ig_connection_id = v_connection_id
   for update;

  if v_account_id is not null then
    update public.accounts
       set handle = v_handle,
           platform = 'instagram',
           ownership_status = 'connected',
           updated_at = now()
     where id = v_account_id;
  else
    insert into public.accounts (
      user_id,
      handle,
      platform,
      ownership_status,
      ig_connection_id,
      updated_at
    ) values (
      p_user_id,
      v_handle,
      'instagram',
      'connected',
      v_connection_id,
      now()
    )
    on conflict (user_id, handle, platform) do update set
      ownership_status = 'connected',
      ig_connection_id = excluded.ig_connection_id,
      updated_at = now()
    returning id into v_account_id;
  end if;

  return query select v_connection_id, v_account_id;
end;
$$;

revoke all on function public.persist_instagram_connection(
  uuid, bigint, text, text, timestamptz, text, bigint, bigint
) from public, anon, authenticated;
grant execute on function public.persist_instagram_connection(
  uuid, bigint, text, text, timestamptz, text, bigint, bigint
) to service_role;

-- ===========================================================================
-- 2. share_links.updated_at — trigger existed without the column.
-- ===========================================================================
alter table public.share_links
  add column if not exists updated_at timestamptz not null default now();

update public.share_links
   set updated_at = coalesce(created_at, now())
 where updated_at is null;

drop trigger if exists set_share_links_updated_at on public.share_links;
create trigger set_share_links_updated_at
  before update on public.share_links
  for each row execute function public.set_updated_at();

comment on column public.share_links.updated_at is
  'Auto-maintained by set_share_links_updated_at. Fixes the trigger/column mismatch from 0006_share_links.sql.';

-- ===========================================================================
-- 3. Research-cache TTL reconciliation (docs/comments only; worker unchanged).
--    Authoritative TTL written by the worker today: 24 hours for web research
--    snapshots on accounts.cache_valid_until. Migration 0027's 7-day comment
--    was aspirational and is superseded. Instagram metrics are not covered by
--    this TTL (fetched live for connected accounts).
-- ===========================================================================
comment on column public.accounts.cache_valid_until is
  'Expiry for accounts.research_snapshot reuse. Authoritative product TTL is 24 hours (worker write path). Not a Living Brief / evidence ledger; never renews observed_at on evidence rows.';

comment on column public.accounts.research_snapshot is
  'Truncated web-research TEXT cache for resume/cost control. Not the ALM evidence SoR — prefer public.evidence + evidence_snapshots.';

comment on column public.accounts.last_researched_at is
  'When the last account-scoped research sweep completed. Companion to cache_valid_until (24h TTL).';

comment on column public.audits.research_cache is
  'Per-audit truncated research blob for generation resume. Compatibility only; longitudinal truth lives in evidence ledgers.';

comment on column public.audits.force_refresh is
  'When true, worker skips accounts.research_snapshot even if cache_valid_until is in the future.';
