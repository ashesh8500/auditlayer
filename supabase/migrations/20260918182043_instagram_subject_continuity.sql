-- Additive continuity repair. No existing account/subject/report is backfilled.
-- Run classification read-only, review the manifest, then call reconciliation
-- with that expected classification/channel. OAuth invokes the same transaction.
begin;
alter table public.accounts add column if not exists instagram_user_id bigint;
create unique index if not exists accounts_owner_instagram_identity_uidx
  on public.accounts(user_id, instagram_user_id) where instagram_user_id is not null;
comment on column public.accounts.instagram_user_id is
  'Durable non-credential Instagram identity retained across disconnect. Set only by verified OAuth or owner-checked reconciliation; never inferred from observed reports.';

create or replace function public.instagram_locator_key(p_locator text)
returns text language sql immutable set search_path = '' as $$
  select lower(trim(leading '@' from regexp_replace(
    regexp_replace(btrim(p_locator), '^https?://(www\.)?instagram\.com/', '', 'i'),
    '[/\?#].*$', '')));
$$;
revoke all on function public.instagram_locator_key(text) from public, anon, authenticated;
grant execute on function public.instagram_locator_key(text) to service_role;

create or replace function public.classify_instagram_subject_link(p_user_id uuid, p_account_id uuid)
returns table(classification text, subject_id uuid, channel_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare a public.accounts%rowtype; n integer; ch public.subject_channels%rowtype;
begin
  select * into a from public.accounts where id=p_account_id and user_id=p_user_id;
  if not found then return query select 'cross_owner_conflict'::text,null::uuid,null::uuid; return; end if;
  if a.platform <> 'instagram' or a.ownership_status not in ('connected','managed') then
    return query select 'observed_only'::text,null::uuid,null::uuid; return;
  end if;
  if (a.ig_connection_id is not null and not exists (
       select 1 from public.instagram_connections c where c.id=a.ig_connection_id and c.user_id=p_user_id
       and (a.instagram_user_id is null or a.instagram_user_id=c.ig_user_id)))
     or exists(select 1 from public.subject_channels sc join public.subjects s on s.id=sc.subject_id
       where sc.account_id=a.id and s.user_id<>p_user_id) then
    return query select 'cross_owner_conflict'::text,null::uuid,null::uuid; return;
  end if;
  select count(*) into n from public.subject_channels where account_id=a.id;
  if n>1 then return query select 'ambiguous_identity'::text,null::uuid,null::uuid; return; end if;
  if n=1 then
    select * into ch from public.subject_channels where account_id=a.id;
    if ch.channel_type<>'instagram' or not ch.managed then
      return query select 'ambiguous_identity'::text,null::uuid,null::uuid; return;
    end if;
    return query select 'already_linked'::text,ch.subject_id,ch.id; return;
  end if;
  select count(*) into n from public.subject_channels sc join public.subjects s on s.id=sc.subject_id
    where s.user_id=p_user_id and sc.channel_type='instagram' and sc.managed
      and public.instagram_locator_key(sc.locator)=public.instagram_locator_key(a.handle);
  if n>1 then return query select 'ambiguous_identity'::text,null::uuid,null::uuid; return; end if;
  if n=1 then
    select sc.* into ch from public.subject_channels sc join public.subjects s on s.id=sc.subject_id
      where s.user_id=p_user_id and sc.channel_type='instagram' and sc.managed
        and public.instagram_locator_key(sc.locator)=public.instagram_locator_key(a.handle);
    if ch.account_id is not null or exists(select 1 from public.subjects where id=ch.subject_id and name like 'Archived · %') then
      return query select 'ambiguous_identity'::text,null::uuid,null::uuid; return;
    end if;
    return query select 'safe_same_owner_relink'::text,ch.subject_id,ch.id; return;
  end if;
  return query select 'new_unassigned_connection'::text,null::uuid,null::uuid;
end $$;
revoke all on function public.classify_instagram_subject_link(uuid,uuid) from public, anon, authenticated;
grant execute on function public.classify_instagram_subject_link(uuid,uuid) to service_role;

create or replace function public.reconcile_instagram_subject_link(
  p_user_id uuid, p_account_id uuid, p_expected_classification text, p_expected_channel_id uuid default null
) returns table(subject_id uuid, channel_id uuid)
language plpgsql security definer set search_path = '' as $$
declare a public.accounts%rowtype; r record; sid uuid; cid uuid;
begin
  -- Shared lock order with OAuth and disconnect, serializing all identities per owner.
  perform 1 from public.profiles where id=p_user_id for update;
  if not found then raise exception 'instagram_owner_not_found'; end if;
  select * into a from public.accounts where id=p_account_id and user_id=p_user_id for update;
  if not found then raise exception 'instagram_account_not_found'; end if;
  -- Lock ownership and matching channels before rechecking the dry-run decision.
  perform 1 from public.subjects where user_id=p_user_id order by id for update;
  perform 1 from public.subject_channels sc where sc.account_id=a.id or sc.subject_id in
    (select id from public.subjects where user_id=p_user_id) order by sc.id for update;
  select * into r from public.classify_instagram_subject_link(p_user_id,p_account_id);
  if r.classification is distinct from p_expected_classification or r.channel_id is distinct from p_expected_channel_id then
    raise exception 'instagram_reconciliation_changed';
  end if;
  if r.classification not in ('already_linked','safe_same_owner_relink','new_unassigned_connection') then
    raise exception 'instagram_subject_identity_conflict';
  end if;
  sid := r.subject_id; cid := r.channel_id;
  if r.classification='new_unassigned_connection' then
    insert into public.subjects(user_id,name) values(p_user_id,'@'||a.handle) returning id into sid;
    insert into public.subject_channels(subject_id,channel_type,locator,managed,account_id)
      values(sid,'instagram',a.handle,true,a.id) returning id into cid;
  else
    update public.subject_channels set account_id=a.id, locator=a.handle where id=cid;
  end if;
  -- Establish stable identity for a reviewed legacy connection without touching history.
  update public.accounts ac set instagram_user_id=c.ig_user_id
    from public.instagram_connections c where ac.id=a.id and c.id=ac.ig_connection_id and c.user_id=p_user_id;
  return query select sid,cid;
end $$;
revoke all on function public.reconcile_instagram_subject_link(uuid,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.reconcile_instagram_subject_link(uuid,uuid,text,uuid) to service_role;

-- Keep the original output contract (no DROP or changed return type).
create or replace function public.persist_instagram_connection(
  p_user_id uuid, p_ig_user_id bigint, p_ig_username text, p_long_lived_token text,
  p_long_lived_expires_at timestamptz, p_account_type text,
  p_followers_count bigint, p_media_count bigint, p_graph_api_family text
) returns table(connection_id uuid, account_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_connection_id uuid; v_account_id uuid; a public.accounts%rowtype; r record;
  v_handle text := lower(trim(leading '@' from btrim(p_ig_username)));
  n integer;
begin
  if p_user_id is null or p_ig_user_id is null or p_ig_user_id<=0 or v_handle is null
     or v_handle !~ '^[a-z0-9_.]+$' or nullif(btrim(p_long_lived_token),'') is null
     or p_long_lived_expires_at is null then raise exception 'invalid_instagram_connection'; end if;
  if p_graph_api_family is null or p_graph_api_family not in ('instagram','facebook') then
    raise exception 'invalid_instagram_graph_api_family'; end if;
  perform 1 from public.profiles where id=p_user_id for update;
  if not found then raise exception 'instagram_owner_not_found'; end if;
  select id into v_connection_id from public.instagram_connections
    where user_id=p_user_id and ig_user_id=p_ig_user_id for update;
  if exists(select 1 from public.accounts where ig_connection_id=v_connection_id and user_id<>p_user_id) then
    raise exception 'instagram_account_owner_conflict'; end if;
  select count(*) into n from public.accounts where user_id=p_user_id
    and (instagram_user_id=p_ig_user_id or ig_connection_id=v_connection_id);
  if n>1 then raise exception 'instagram_account_identity_conflict'; end if;
  select * into a from public.accounts where user_id=p_user_id
    and (instagram_user_id=p_ig_user_id or ig_connection_id=v_connection_id) for update;
  if a.id is null then
    select count(*) into n from public.accounts where user_id=p_user_id and platform='instagram'
      and public.instagram_locator_key(handle)=v_handle;
    if n>1 then raise exception 'instagram_account_identity_conflict'; end if;
    select * into a from public.accounts where user_id=p_user_id and platform='instagram'
      and public.instagram_locator_key(handle)=v_handle for update;
  end if;
  if a.id is not null and (a.platform<>'instagram' or
      (a.instagram_user_id is not null and a.instagram_user_id<>p_ig_user_id) or
      (a.ig_connection_id is not null and a.ig_connection_id is distinct from v_connection_id)) then
    raise exception 'instagram_account_identity_conflict';
  end if;
  if exists(select 1 from public.accounts ac where ac.user_id=p_user_id and ac.platform='instagram'
      and public.instagram_locator_key(ac.handle)=v_handle and ac.id is distinct from a.id) then
    raise exception 'instagram_username_collision'; end if;
  insert into public.instagram_connections(user_id,ig_user_id,ig_username,long_lived_token,
    long_lived_expires_at,account_type,followers_count,media_count,graph_api_family,
    connection_status,reconnect_required_at,reconnect_reason,is_active,last_refreshed_at,updated_at)
  values(p_user_id,p_ig_user_id,v_handle,p_long_lived_token,p_long_lived_expires_at,p_account_type,
    p_followers_count,p_media_count,p_graph_api_family,'connected',null,null,true,now(),now())
  on conflict(user_id,ig_user_id) do update set ig_username=excluded.ig_username,
    access_token=null,long_lived_token=excluded.long_lived_token,long_lived_expires_at=excluded.long_lived_expires_at,
    account_type=excluded.account_type,followers_count=excluded.followers_count,media_count=excluded.media_count,
    graph_api_family=excluded.graph_api_family,connection_status='connected',reconnect_required_at=null,
    reconnect_reason=null,is_active=true,last_refreshed_at=now(),updated_at=now()
  returning id into v_connection_id;
  if a.id is null then
    insert into public.accounts(user_id,handle,platform,ownership_status,ig_connection_id,instagram_user_id)
      values(p_user_id,v_handle,'instagram','connected',v_connection_id,p_ig_user_id) returning id into v_account_id;
  else
    v_account_id:=a.id;
    -- Classify against the previous locator before rename, so an orphaned managed
    -- channel with that old locator can still be deterministically recovered.
    select * into r from public.classify_instagram_subject_link(p_user_id,v_account_id);
    perform public.reconcile_instagram_subject_link(p_user_id,v_account_id,r.classification,r.channel_id);
    update public.accounts set handle=v_handle,ownership_status='connected',ig_connection_id=v_connection_id,
      instagram_user_id=p_ig_user_id,updated_at=now() where id=v_account_id;
  end if;
  select * into r from public.classify_instagram_subject_link(p_user_id,v_account_id);
  perform public.reconcile_instagram_subject_link(p_user_id,v_account_id,r.classification,r.channel_id);
  return query select v_connection_id,v_account_id;
end $$;
revoke all on function public.persist_instagram_connection(uuid,bigint,text,text,timestamptz,text,bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.persist_instagram_connection(uuid,bigint,text,text,timestamptz,text,bigint,bigint,text) to service_role;

-- Compatibility callers still cannot establish a usable Insights connection.
create or replace function public.persist_instagram_connection(
  p_user_id uuid, p_ig_user_id bigint, p_ig_username text, p_long_lived_token text,
  p_long_lived_expires_at timestamptz, p_account_type text, p_followers_count bigint, p_media_count bigint
) returns table(connection_id uuid, account_id uuid)
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select * into r from public.persist_instagram_connection(p_user_id,p_ig_user_id,p_ig_username,
    p_long_lived_token,p_long_lived_expires_at,p_account_type,p_followers_count,p_media_count,'instagram');
  update public.instagram_connections set graph_api_family=null, connection_status='reconnect_required',
    reconnect_required_at=now(),reconnect_reason='legacy_connection',is_active=false where id=r.connection_id;
  return query select r.connection_id,r.account_id;
end $$;
revoke all on function public.persist_instagram_connection(uuid,bigint,text,text,timestamptz,text,bigint,bigint) from public,anon,authenticated;
grant execute on function public.persist_instagram_connection(uuid,bigint,text,text,timestamptz,text,bigint,bigint) to service_role;
create or replace function public.disconnect_instagram_connection(p_user_id uuid,p_connection_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.instagram_connections%rowtype;
begin
  perform 1 from public.profiles where id=p_user_id for update;
  select * into c from public.instagram_connections where id=p_connection_id and user_id=p_user_id for update;
  if not found then raise exception 'instagram_connection_not_found'; end if;
  if exists(select 1 from public.accounts where ig_connection_id=c.id and user_id<>p_user_id)
     or exists(select 1 from public.accounts a join public.subject_channels sc on sc.account_id=a.id
       join public.subjects s on s.id=sc.subject_id where a.ig_connection_id=c.id and s.user_id<>p_user_id) then
    raise exception 'instagram_account_owner_conflict'; end if;
  perform 1 from public.accounts where ig_connection_id=c.id order by id for update;
  if exists(select 1 from public.accounts where ig_connection_id=c.id and
      (platform<>'instagram' or (instagram_user_id is not null and instagram_user_id<>c.ig_user_id))) then
    raise exception 'instagram_account_identity_conflict'; end if;
  -- Retain durable report and progression rows, remove reusable platform caches.
  update public.audits set research_cache='' where user_id=p_user_id and
    (account_id in(select id from public.accounts where ig_connection_id=c.id and user_id=p_user_id)
     or (platform='instagram' and public.instagram_locator_key(handle)=public.instagram_locator_key(c.ig_username)));
  update public.account_progression set followers=null,engagement=null,avg_likes=null,avg_comments=null
    where account_id in(select id from public.accounts where ig_connection_id=c.id and user_id=p_user_id);
  update public.accounts set instagram_user_id=c.ig_user_id,ig_connection_id=null,
    ig_metrics_snapshot=null,research_snapshot=null,last_researched_at=null,cache_valid_until=null,
    avatar_url=null,display_name=null,updated_at=now()
    where ig_connection_id=c.id and user_id=p_user_id;
  -- Keep ownership_status='connected': a managed channel without usable credentials
  -- is reconnect-required, NOT an observed/public fallback. No history FK is deleted.
  delete from public.instagram_connections where id=c.id and user_id=p_user_id;
end $$;
revoke all on function public.disconnect_instagram_connection(uuid,uuid) from public,anon,authenticated;
grant execute on function public.disconnect_instagram_connection(uuid,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
