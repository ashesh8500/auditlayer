-- Persist an explicit Instagram connection lifecycle.
-- This migration must run after 20260827203000_instagram_connection_graph_family.sql.
-- Existing legacy, family-null, and inactive rows fail closed until OAuth reconnects.

alter table public.instagram_connections
  add column if not exists connection_status text not null default 'connected',
  add column if not exists reconnect_required_at timestamptz,
  add column if not exists reconnect_reason text;

alter table public.instagram_connections
  drop constraint if exists instagram_connections_connection_status_check;
alter table public.instagram_connections
  add constraint instagram_connections_connection_status_check
  check (connection_status in ('connected', 'reconnect_required'));

alter table public.instagram_connections
  drop constraint if exists instagram_connections_reconnect_reason_check;
alter table public.instagram_connections
  add constraint instagram_connections_reconnect_reason_check
  check (
    reconnect_reason is null
    or reconnect_reason in ('auth_permission', 'legacy_connection')
  );

update public.instagram_connections
set connection_status = 'reconnect_required',
    reconnect_required_at = coalesce(reconnect_required_at, now()),
    reconnect_reason = coalesce(reconnect_reason, 'legacy_connection')
where graph_api_family is null or is_active = false;

comment on column public.instagram_connections.connection_status is
  'Durable owner-scoped lifecycle: connected or reconnect_required. Disconnect deletes the row.';
comment on column public.instagram_connections.reconnect_reason is
  'Bounded internal reason only; never stores Graph responses, credentials, handles, or customer content.';

-- Successful owner-scoped OAuth persistence is the only operation that clears
-- reconnect-required state. Metric and token refresh writes do not touch it.
drop function if exists public.persist_instagram_connection(
  uuid, bigint, text, text, timestamptz, text, bigint, bigint, text
);

create function public.persist_instagram_connection(
  p_user_id uuid,
  p_ig_user_id bigint,
  p_ig_username text,
  p_long_lived_token text,
  p_long_lived_expires_at timestamptz,
  p_account_type text,
  p_followers_count bigint,
  p_media_count bigint,
  p_graph_api_family text
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
  if p_graph_api_family is null
     or p_graph_api_family not in ('instagram', 'facebook') then
    raise exception 'invalid_instagram_graph_api_family';
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
    graph_api_family,
    connection_status,
    reconnect_required_at,
    reconnect_reason,
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
    p_graph_api_family,
    'connected',
    null,
    null,
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
    graph_api_family = excluded.graph_api_family,
    connection_status = 'connected',
    reconnect_required_at = null,
    reconnect_reason = null,
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
  uuid, bigint, text, text, timestamptz, text, bigint, bigint, text
) from public, anon, authenticated;
grant execute on function public.persist_instagram_connection(
  uuid, bigint, text, text, timestamptz, text, bigint, bigint, text
) to service_role;

drop function if exists public.mark_instagram_connection_reconnect_required(uuid, uuid);
create function public.mark_instagram_connection_reconnect_required(
  p_user_id uuid,
  p_connection_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.instagram_connections
     set connection_status = 'reconnect_required',
         is_active = false,
         reconnect_required_at = coalesce(reconnect_required_at, now()),
         reconnect_reason = 'auth_permission',
         updated_at = now()
   where id = p_connection_id
     and user_id = p_user_id;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.mark_instagram_connection_reconnect_required(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_instagram_connection_reconnect_required(uuid, uuid) to service_role;

grant select (
  connection_status,
  reconnect_required_at,
  reconnect_reason
) on table public.instagram_connections to authenticated;
