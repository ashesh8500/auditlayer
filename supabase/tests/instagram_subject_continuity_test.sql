-- Real PostgreSQL behavioral integration test; rollback all fixtures.
\set ON_ERROR_STOP on
begin;
do $$
declare u uuid := gen_random_uuid(); c uuid; a uuid; s uuid;
begin
 insert into auth.users(id,email) values(u,'continuity-test@example.invalid');
 insert into public.profiles(id) values(u) on conflict do nothing;
 insert into public.subjects(user_id,name) values(u,'Unrelated existing subject');
 select connection_id,account_id into c,a from public.persist_instagram_connection(u,900001::bigint,'fresh_identity','test-fixture',now()+interval '60 days','BUSINESS',1::bigint,1::bigint,'instagram');
 select sc.subject_id into s from public.subject_channels sc where sc.account_id=a;
 if s is null then raise exception 'FAIL: OAuth did not atomically create subject/channel'; end if;
 if (select name from public.subjects where id=s)='Unrelated existing subject' then raise exception 'FAIL: attached unrelated subject'; end if;
 perform public.persist_instagram_connection(u,900001::bigint,'renamed_identity','test-fixture',now()+interval '60 days','BUSINESS',1::bigint,1::bigint,'instagram');
 if not exists(select 1 from public.subject_channels where subject_id=s and account_id=a and locator='renamed_identity') then raise exception 'FAIL: rename lost durable channel'; end if;
 if (select count(*) from public.subjects where user_id=u)<>2 then raise exception 'FAIL: retry created extra subject'; end if;
 raise notice 'PASS: atomic subject creation, unrelated subject exclusion, rename and retry continuity';
end $$;
do $$
declare u uuid:=gen_random_uuid(); c uuid; a uuid; s uuid; ch uuid; au uuid; pr uuid; a2 uuid;
 rv uuid; sl uuid; brief uuid; batch uuid; history_before jsonb; history_after jsonb;
begin
 insert into auth.users(id,email) values(u,'disconnect-test@example.invalid');
 insert into public.profiles(id) values(u) on conflict do nothing;
 select connection_id,account_id into c,a from public.persist_instagram_connection(u,900002::bigint,'disconnect_identity','test-fixture',now()+interval '60 days','BUSINESS',1::bigint,1::bigint,'instagram');
 select id,subject_id into ch,s from public.subject_channels where account_id=a;
 insert into public.audits(user_id,handle,account_id,report_path,research_cache) values(u,'disconnect_identity',a,'retained/report.html','sensitive cache') returning id into au;
 insert into public.account_progression(account_id,audit_id,followers,score) values(a,au,100,70) returning id into pr;
 insert into public.audit_report_versions(audit_id,version,report_path) values(au,1,'retained/report-v1.html') returning id into rv;
 insert into public.share_links(audit_id,token,mode,created_by) values(au,gen_random_uuid()::text,'public',u) returning id into sl;
 insert into public.living_brief_versions(subject_id,version,identity) values(s,1,'{"label":"confirmed identity"}'::jsonb) returning id into brief;
 insert into public.audit_batches(user_id,subject_id,idempotency_key) values(u,s,'retained-batch') returning id into batch;
 insert into public.batch_audits(batch_id,audit_id) values(batch,au);
 select jsonb_build_array((select to_jsonb(x) from public.audit_report_versions x where id=rv),
   (select to_jsonb(x) from public.share_links x where id=sl),
   (select to_jsonb(x) from public.living_brief_versions x where id=brief),
   (select to_jsonb(x) from public.audit_batches x where id=batch),
   (select to_jsonb(x) from public.batch_audits x where batch_id=batch and audit_id=au)) into history_before;
 update public.accounts set ig_metrics_snapshot='sensitive',research_snapshot='sensitive',cache_valid_until=now()+interval '7 days' where id=a;
 perform public.disconnect_instagram_connection(u,c);
 if not exists(select 1 from public.accounts where id=a and ig_connection_id is null and instagram_user_id=900002) then raise exception 'FAIL: disconnect destroyed durable account identity'; end if;
 if exists(select 1 from public.instagram_connections where id=c) then raise exception 'FAIL: credential retained'; end if;
 if not exists(select 1 from public.audits where id=au and account_id=a and report_path='retained/report.html' and research_cache='') then raise exception 'FAIL: audit continuity/purge'; end if;
 if not exists(select 1 from public.account_progression where id=pr and account_id=a and followers is null and score=70) then raise exception 'FAIL: progression identity/purge'; end if;
 if exists(select 1 from public.accounts where id=a and (ig_metrics_snapshot is not null or research_snapshot is not null or cache_valid_until is not null)) then raise exception 'FAIL: account cache not purged'; end if;
 select account_id into a2 from public.persist_instagram_connection(u,900002::bigint,'renamed_after_disconnect','test-fixture',now()+interval '60 days','BUSINESS',1::bigint,1::bigint,'instagram');
 if a2<>a or not exists(select 1 from public.subject_channels where id=ch and subject_id=s and account_id=a and locator='renamed_after_disconnect') then raise exception 'FAIL: disconnect/reconnect lost history'; end if;
 select jsonb_build_array((select to_jsonb(x) from public.audit_report_versions x where id=rv),
   (select to_jsonb(x) from public.share_links x where id=sl),
   (select to_jsonb(x) from public.living_brief_versions x where id=brief),
   (select to_jsonb(x) from public.audit_batches x where id=batch),
   (select to_jsonb(x) from public.batch_audits x where batch_id=batch and audit_id=au)) into history_after;
 if history_before is distinct from history_after then raise exception 'FAIL: report versions/share/brief/batch history changed'; end if;
 if (select handle from public.audits where id=au)<>'disconnect_identity' then raise exception 'FAIL: historical report locator rewritten'; end if;
 raise notice 'PASS: disconnect purge, durable account/channel/audit/progression, immutable versions/share/brief/batch, renamed reconnect';
end $$;
do $$
declare u uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); s uuid; ch uuid; obs uuid; a uuid; c uuid; r record; a2 uuid; caught boolean; n integer;
begin
 insert into auth.users(id,email) values(u,'relink-test@example.invalid'),(v,'other-owner@example.invalid');
 insert into public.profiles(id) values(u),(v) on conflict do nothing;
 insert into public.subjects(user_id,name) values(u,'Managed match') returning id into s;
 insert into public.subject_channels(subject_id,channel_type,locator,managed) values(s,'instagram','https://www.instagram.com/Relink_Target/',true) returning id into ch;
 insert into public.subject_channels(subject_id,channel_type,locator,managed) values(s,'instagram','observed_only',false) returning id into obs;
 select connection_id,account_id into c,a from public.persist_instagram_connection(u,900003::bigint,'relink_target','test-fixture',now()+interval '60 days','BUSINESS',1::bigint,1::bigint,'instagram');
 if not exists(select 1 from public.subject_channels where id=ch and account_id=a and subject_id=s) then raise exception 'FAIL: managed normalized locator not relinked'; end if;
 select account_id into a2 from public.persist_instagram_connection(u,900004::bigint,'observed_only','test-fixture',now()+interval '60 days','BUSINESS',1::bigint,1::bigint,'instagram');
 if exists(select 1 from public.subject_channels where id=obs and (managed or account_id is not null)) then raise exception 'FAIL: observed target promoted'; end if;
 if (select subject_id from public.subject_channels where account_id=a2)=s then raise exception 'FAIL: observed match reused subject'; end if;
 select account_id into a2 from public.persist_instagram_connection(v,900003::bigint,'relink_target','test-fixture',now()+interval '60 days','BUSINESS',1::bigint,1::bigint,'instagram');
 if a2=a then raise exception 'FAIL: same IG identity shared across tenants'; end if;
 select * into r from public.classify_instagram_subject_link(v,a);
 if r.classification<>'cross_owner_conflict' then raise exception 'FAIL: foreign account classification'; end if;
 caught:=false;
 begin perform public.disconnect_instagram_connection(v,c); exception when others then caught:=sqlerrm='instagram_connection_not_found'; end;
 if not caught or not exists(select 1 from public.instagram_connections where id=c) then raise exception 'FAIL: foreign disconnect'; end if;
 -- Same owner, same username, different durable IG identity must not hijack.
 caught:=false;
 begin perform public.persist_instagram_connection(u,900005::bigint,'relink_target','test-fixture',now()+interval '60 days','BUSINESS',1::bigint,1::bigint,'instagram'); exception when others then caught:=sqlerrm='instagram_account_identity_conflict'; end;
 if not caught or exists(select 1 from public.instagram_connections where user_id=u and ig_user_id=900005) then raise exception 'FAIL: different IG identity hijacked account'; end if;
 caught:=false;
 begin perform public.persist_instagram_connection(u,900003::bigint,'observed_only','test-fixture',now()+interval '60 days','BUSINESS',1::bigint,1::bigint,'instagram'); exception when others then caught:=sqlerrm='instagram_username_collision'; end;
 if not caught or (select ig_username from public.instagram_connections where id=c)<>'relink_target' then raise exception 'FAIL: rename collision not atomic'; end if;
 -- Compatibility overload follows the same bridge but deliberately fails closed.
 select connection_id,account_id into c,a from public.persist_instagram_connection(u,900006::bigint,'compatibility','test-fixture',now()+interval '60 days','BUSINESS',1::bigint,1::bigint);
 if not exists(select 1 from public.instagram_connections where id=c and connection_status='reconnect_required' and graph_api_family is null and not is_active) or not exists(select 1 from public.subject_channels where account_id=a) then raise exception 'FAIL: unsafe legacy overload'; end if;
 -- Ambiguity is a transaction failure, never earliest-subject selection.
 insert into public.subject_channels(subject_id,channel_type,locator,managed) values(s,'instagram','ambiguous',true);
 insert into public.subjects(user_id,name) values(u,'Another match') returning id into s;
 insert into public.subject_channels(subject_id,channel_type,locator,managed) values(s,'instagram','@ambiguous',true);
 select count(*) into n from public.accounts where user_id=u;
 caught:=false;
 begin perform public.persist_instagram_connection(u,900007::bigint,'ambiguous','test-fixture',now()+interval '60 days','BUSINESS',1::bigint,1::bigint,'instagram'); exception when others then caught:=sqlerrm='instagram_subject_identity_conflict'; end;
 if not caught or (select count(*) from public.accounts where user_id=u)<>n or exists(select 1 from public.instagram_connections where user_id=u and ig_user_id=900007) then raise exception 'FAIL: ambiguous bridge not rolled back'; end if;
 -- Deliberately inconsistent legacy bridge must fail closed, including disconnect.
 update public.subject_channels set account_id=a where id=obs;
 update public.subjects set user_id=v where id=(select subject_id from public.subject_channels where id=obs);
 caught:=false;
 begin perform public.persist_instagram_connection(u,900006::bigint,'compatibility','test-fixture',now()+interval '60 days','BUSINESS',1::bigint,1::bigint,'instagram'); exception when others then caught:=sqlerrm='instagram_subject_identity_conflict'; end;
 if not caught then raise exception 'FAIL: cross-owner channel accepted'; end if;
 raise notice 'PASS: normalized managed relink, observed isolation, tenants, identity/rename conflicts, compatibility, ambiguity rollback';
end $$;

do $$
declare u uuid:=gen_random_uuid(); a uuid; s uuid; ch uuid; r record; caught boolean; sig text;
begin
 insert into auth.users(id,email) values(u,'classification-test@example.invalid');
 insert into public.profiles(id) values(u) on conflict do nothing;
 insert into public.accounts(user_id,handle) values(u,'legacy_managed') returning id into a;
 select * into r from public.classify_instagram_subject_link(u,a);
 if r.classification<>'new_unassigned_connection' or exists(select 1 from public.subjects where user_id=u) then raise exception 'FAIL: dry run mutated state'; end if;
 insert into public.subjects(user_id,name) values(u,'Review match') returning id into s;
 insert into public.subject_channels(subject_id,channel_type,locator,managed) values(s,'instagram','@legacy_managed',true) returning id into ch;
 caught:=false;
 begin perform public.reconcile_instagram_subject_link(u,a,r.classification,r.channel_id); exception when others then caught:=sqlerrm='instagram_reconciliation_changed'; end;
 if not caught then raise exception 'FAIL: stale manifest accepted'; end if;
 select * into r from public.classify_instagram_subject_link(u,a);
 if r.classification<>'safe_same_owner_relink' or r.channel_id<>ch then raise exception 'FAIL: dry-run relink classification'; end if;
 perform public.reconcile_instagram_subject_link(u,a,r.classification,r.channel_id);
 select * into r from public.classify_instagram_subject_link(u,a);
 perform public.reconcile_instagram_subject_link(u,a,r.classification,r.channel_id);
 if r.classification<>'already_linked' or (select count(*) from public.subjects where user_id=u)<>1 then raise exception 'FAIL: reconciliation not idempotent'; end if;
 foreach sig in array array[
 'public.classify_instagram_subject_link(uuid,uuid)',
 'public.reconcile_instagram_subject_link(uuid,uuid,text,uuid)',
 'public.persist_instagram_connection(uuid,bigint,text,text,timestamptz,text,bigint,bigint,text)',
 'public.persist_instagram_connection(uuid,bigint,text,text,timestamptz,text,bigint,bigint)',
 'public.disconnect_instagram_connection(uuid,uuid)'] loop
 if has_function_privilege('anon',sig,'EXECUTE') or has_function_privilege('authenticated',sig,'EXECUTE') or not has_function_privilege('service_role',sig,'EXECUTE') then raise exception 'FAIL: RPC grant boundary %',sig; end if;
 end loop;
 raise notice 'PASS: dry-run classification, stale manifest rejection, idempotent service repair, RPC grant boundaries';
end $$;
do $$
declare u uuid:=gen_random_uuid(); c uuid; a uuid; caught boolean;
begin
 insert into auth.users(id,email) values(u,'corrupt-identity@example.invalid');
 insert into public.profiles(id) values(u) on conflict do nothing;
 select connection_id,account_id into c,a from public.persist_instagram_connection(u,900008::bigint,'corrupt_identity','test-fixture',now()+interval '60 days','BUSINESS',1::bigint,1::bigint,'instagram');
 update public.accounts set instagram_user_id=900009 where id=a;
 caught:=false;
 begin perform public.disconnect_instagram_connection(u,c); exception when others then caught:=sqlerrm='instagram_account_identity_conflict'; end;
 if not caught or not exists(select 1 from public.instagram_connections where id=c) then raise exception 'FAIL: disconnect overwrote conflicting durable identity'; end if;
 raise notice 'PASS: inconsistent durable identity rejects disconnect atomically';
end $$;
rollback;
