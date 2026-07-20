-- Accounts do not carry updated_at; keep the transactional persistence RPC
-- aligned with the canonical account schema.

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
           ownership_status = 'connected'
     where id = v_account_id;
  else
    insert into public.accounts (
      user_id,
      handle,
      platform,
      ownership_status,
      ig_connection_id
    ) values (
      p_user_id,
      v_handle,
      'instagram',
      'connected',
      v_connection_id
    )
    on conflict (user_id, handle, platform) do update set
      ownership_status = 'connected',
      ig_connection_id = excluded.ig_connection_id
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
