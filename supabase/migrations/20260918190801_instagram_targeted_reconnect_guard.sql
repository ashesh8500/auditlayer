-- Targeted OAuth intents cannot recreate credentials after disconnect.
-- Keep the nine/eight-argument Add/compatibility APIs unchanged.
begin;
create or replace function public.persist_targeted_instagram_connection(
  p_user_id uuid, p_ig_user_id bigint, p_ig_username text, p_long_lived_token text,
  p_long_lived_expires_at timestamptz, p_account_type text,
  p_followers_count bigint, p_media_count bigint, p_graph_api_family text,
  p_expected_connection_id uuid
) returns table(connection_id uuid, account_id uuid)
language plpgsql security invoker set search_path = '' as $$
begin
  -- Same owner-first order as disconnect, persistence and the worker fence.
  -- READ COMMITTED rechecks the target after waiting for a disconnect commit.
  perform 1 from public.profiles where id=p_user_id for update;
  if not found then
    raise exception using errcode='PIG01', message='instagram_connection_unavailable';
  end if;
  perform 1 from public.instagram_connections
    where id=p_expected_connection_id and user_id=p_user_id and ig_user_id=p_ig_user_id
    for update;
  if not found then
    raise exception using errcode='PIG01', message='instagram_connection_unavailable';
  end if;
  -- Nested call shares this transaction/locks. Its token UPDATE still rotates
  -- credential_version via the existing worker-fence trigger.
  return query select * from public.persist_instagram_connection(
    p_user_id,p_ig_user_id,p_ig_username,p_long_lived_token,p_long_lived_expires_at,
    p_account_type,p_followers_count,p_media_count,p_graph_api_family);
end $$;
revoke all on function public.persist_targeted_instagram_connection(uuid,bigint,text,text,timestamptz,text,bigint,bigint,text,uuid) from public,anon,authenticated;
grant execute on function public.persist_targeted_instagram_connection(uuid,bigint,text,text,timestamptz,text,bigint,bigint,text,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
