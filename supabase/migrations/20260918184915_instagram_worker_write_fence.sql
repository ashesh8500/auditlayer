-- Apply after instagram_subject_continuity, before deploying the fenced worker.
-- A credential lifetime changes even when OAuth reuses the same token/row.
alter table public.instagram_connections add column if not exists credential_version uuid not null default gen_random_uuid();

create or replace function public.rotate_instagram_credential_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.credential_version := gen_random_uuid();
  return new;
end $$;
drop trigger if exists instagram_credential_version on public.instagram_connections;
create trigger instagram_credential_version before update of long_lived_token on public.instagram_connections
for each row execute function public.rotate_instagram_credential_version();
revoke all on function public.rotate_instagram_credential_version() from public, anon, authenticated;

-- Single transaction, same owner-first lock order as OAuth/disconnect. No
-- pre-read validity check in the worker can substitute for this lock/fence.
create or replace function public.write_instagram_worker_state(
  p_user_id uuid, p_connection_id uuid, p_credential_version uuid,
  p_action text, p_payload jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare c public.instagram_connections%rowtype; a public.accounts%rowtype; au uuid;
begin
  perform 1 from public.profiles where id=p_user_id for update;
  if not found then return null; end if;
  select * into c from public.instagram_connections
    where id=p_connection_id and user_id=p_user_id and credential_version=p_credential_version
      and is_active and connection_status='connected' for update;
  if not found then return null; end if;
  if p_action='token' then
    update public.instagram_connections set long_lived_token=p_payload->>'token',
      long_lived_expires_at=(p_payload->>'expires_at')::timestamptz, updated_at=now()
      where id=c.id returning credential_version into c.credential_version;
  elsif p_action='snapshot' then
    update public.instagram_connections set account_type=p_payload->>'account_type',
      followers_count=(p_payload->>'followers_count')::integer,
      media_count=(p_payload->>'media_count')::integer,
      last_refreshed_at=(p_payload->>'observed_at')::timestamptz, updated_at=now() where id=c.id;
  elsif p_action='reconnect' then
    update public.instagram_connections set connection_status='reconnect_required', is_active=false,
      reconnect_required_at=now(), reconnect_reason='auth_permission', updated_at=now() where id=c.id;
  elsif p_action in ('cache','progression') then
    select * into a from public.accounts where user_id=p_user_id and ig_connection_id=c.id
      and platform='instagram' and instagram_user_id=c.ig_user_id for update;
    if not found then return null; end if;
    au := (p_payload->>'audit_id')::uuid;
    perform 1 from public.audits where id=au and user_id=p_user_id and platform='instagram'
      and (account_id=a.id or (account_id is null and public.instagram_locator_key(handle)=public.instagram_locator_key(a.handle))) for update;
    if not found then return null; end if;
    if p_action='cache' then
      update public.audits set research_cache=coalesce(p_payload->>'research_cache','') where id=au;
    else
      if coalesce((p_payload->>'research_refreshed')::boolean,false) then
        update public.accounts set research_snapshot=p_payload->>'research_snapshot',
          last_researched_at=now(), cache_valid_until=now()+interval '24 hours' where id=a.id;
      end if;
      update public.audits set account_id=a.id where id=au;
      insert into public.account_progression(account_id,audit_id,followers,engagement,avg_likes,avg_comments,score)
      values(a.id,au,(p_payload->>'followers')::integer,(p_payload->>'engagement')::numeric,
        (p_payload->>'avg_likes')::numeric,(p_payload->>'avg_comments')::numeric,(p_payload->>'score')::integer)
      on conflict(audit_id) do update set followers=excluded.followers,engagement=excluded.engagement,
        avg_likes=excluded.avg_likes,avg_comments=excluded.avg_comments,score=excluded.score;
    end if;
  else
    raise exception 'invalid_instagram_worker_action';
  end if;
  return c.credential_version;
end $$;
revoke all on function public.write_instagram_worker_state(uuid,uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.write_instagram_worker_state(uuid,uuid,uuid,text,jsonb) to service_role;
