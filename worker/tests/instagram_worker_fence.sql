\set ON_ERROR_STOP on
begin;
do $$
declare u uuid:=gen_random_uuid(); c uuid; a uuid; au uuid; v uuid; v2 uuid; c2 uuid; action text;
begin
 insert into auth.users(id,email) values(u,'worker-fence@example.invalid');
 insert into public.profiles(id) values(u) on conflict do nothing;
 select connection_id,account_id into c,a from public.persist_instagram_connection(u,990001::bigint,'worker_fence','fixture',now()+interval '60 days','BUSINESS',1::bigint,1::bigint,'instagram');
 select credential_version into v from public.instagram_connections where id=c;
 if public.write_instagram_worker_state(gen_random_uuid(),c,v,'snapshot','{"followers_count":999}') is not null then raise exception 'foreign owner accepted'; end if;
 insert into public.audits(user_id,handle,platform,account_id) values(u,'worker_fence','instagram',a) returning id into au;
 if public.write_instagram_worker_state(u,c,v,'progression',jsonb_build_object('audit_id',au,'followers',123,'score',70,'research_snapshot','fresh','research_refreshed',true)) is null then raise exception 'valid write rejected'; end if;
 if not exists(select 1 from public.account_progression where audit_id=au and followers=123) then raise exception 'progression missing'; end if;
 if not exists(select 1 from public.accounts where id=a and cache_valid_until=now()+interval '24 hours') then raise exception 'wrong TTL'; end if;
 update public.accounts set cache_valid_until=now()+interval '1 hour' where id=a;
 perform public.write_instagram_worker_state(u,c,v,'progression',jsonb_build_object('audit_id',au,'research_refreshed',false,'followers',0));
 if not exists(select 1 from public.accounts where id=a and cache_valid_until=now()+interval '1 hour') then raise exception 'sliding TTL'; end if;
 if not exists(select 1 from public.account_progression where audit_id=au and followers=0) then raise exception 'zero lost'; end if;
 perform public.disconnect_instagram_connection(u,c);
 foreach action in array array['progression','cache','snapshot','token','reconnect'] loop
  if public.write_instagram_worker_state(u,c,v,action,jsonb_build_object('audit_id',au,'research_cache','stale','followers',999,'research_refreshed',true,'research_snapshot','stale')) is not null then raise exception 'stale action accepted: %',action; end if;
 end loop;
 if exists(select 1 from public.accounts where id=a and research_snapshot is not null) or exists(select 1 from public.account_progression where audit_id=au and followers is not null) then raise exception 'purged caches resurrected'; end if;
 select connection_id into c2 from public.persist_instagram_connection(u,990001::bigint,'worker_fence','fixture',now()+interval '60 days','BUSINESS',1::bigint,1::bigint,'instagram');
 select credential_version into v2 from public.instagram_connections where id=c2;
 if public.write_instagram_worker_state(u,c,v,'snapshot','{"followers_count":999}') is not null then raise exception 'old lifetime wrote reconnect'; end if;
 -- Even OAuth with the same token and row ID is a new lifetime.
 perform public.persist_instagram_connection(u,990001::bigint,'worker_fence','fixture',now()+interval '60 days','BUSINESS',1::bigint,1::bigint,'instagram');
 if public.write_instagram_worker_state(u,c2,v2,'snapshot','{"followers_count":999}') is not null then raise exception 'old OAuth version accepted'; end if;
 select credential_version into v2 from public.instagram_connections where id=c2;
 if public.write_instagram_worker_state(u,c2,v2,'cache',jsonb_build_object('audit_id',au,'research_cache','new')) is null then raise exception 'new lifetime rejected'; end if;
 if not exists(select 1 from public.audits where id=au and research_cache='new') then raise exception 'new cache missing'; end if;
 if has_function_privilege('anon','public.write_instagram_worker_state(uuid,uuid,uuid,text,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.write_instagram_worker_state(uuid,uuid,uuid,text,jsonb)','EXECUTE') then raise exception 'unsafe ACL'; end if;
 -- Production uses service_role, not postgres; exercise its actual grants.
 set local role service_role;
 v := public.write_instagram_worker_state(u,c2,v2,'token',jsonb_build_object('token','rotated','expires_at',now()+interval '60 days'));
 if v is null or v=v2 then raise exception 'refresh did not rotate fence'; end if;
 if public.write_instagram_worker_state(u,c2,v2,'snapshot','{}') is not null then raise exception 'pre-refresh version accepted'; end if;
 if public.write_instagram_worker_state(u,c2,v,'snapshot','{"followers_count":0}') is null then raise exception 'refreshed version rejected'; end if;
 reset role;
 -- Service invoker also exercises account/progression writes, not just credentials.
 set local role service_role;
 if public.write_instagram_worker_state(u,c2,v,'progression',jsonb_build_object('audit_id',au,'followers',456)) is null then raise exception 'service progression rejected'; end if;
 reset role;
 set local role anon;
 begin
  perform public.write_instagram_worker_state(u,c2,v,'snapshot','{}');
  raise exception 'anon unexpectedly executed worker RPC';
 exception when insufficient_privilege then null;
 end;
 reset role;
 set local role authenticated;
 begin
  perform public.write_instagram_worker_state(u,c2,v,'snapshot','{}');
  raise exception 'authenticated unexpectedly executed worker RPC';
 exception when insufficient_privilege then null;
 end;
 reset role;
 raise notice 'PASS: stale writes rejected, disconnect purge preserved, reconnect and same-token OAuth fenced, ACL restricted';
end $$;
rollback;
