\set ON_ERROR_STOP on
-- Existing disposable local database only; never applies schema or commits fixtures.
begin;
do $$
declare
  u uuid := gen_random_uuid(); c uuid; a uuid; au uuid; captured text; n integer;
begin
  insert into auth.users(id,email) values(u,'worker-remediation@example.invalid');
  insert into public.profiles(id) values(u) on conflict do nothing;
  select connection_id,account_id into c,a from public.persist_instagram_connection(
    u,990009::bigint,'remediation_old','fixture',now()+interval '60 days',
    'BUSINESS',1::bigint,1::bigint,'instagram');
  insert into public.audits(user_id,handle,platform,account_id,status,research_cache)
    values(u,'remediation_old','instagram',a,'running','captured-before-disconnect') returning id into au;
  select research_cache into captured from public.audits where id=au;
  perform public.disconnect_instagram_connection(u,c);
  update public.accounts set handle='remediation_renamed' where id=a;
  if captured <> 'captured-before-disconnect' then raise exception 'claim fixture missing'; end if;
  if exists(select 1 from public.instagram_connections where user_id=u and ig_username='remediation_old') then
    raise exception 'credential lookup unexpectedly nonempty';
  end if;
  if not exists(select 1 from public.audits audit join public.accounts account on account.id=audit.account_id
      where audit.id=au and audit.user_id=u and account.user_id=u and account.platform='instagram'
        and account.ownership_status in ('connected','managed') and account.ig_connection_id is null
        and account.instagram_user_id=990009 and audit.research_cache='') then
    raise exception 'durable lookup cannot distinguish disconnected managed identity';
  end if;
  -- The exact immutable readback predicate used after a lost initial RPC response.
  set local role service_role;
  n := public.finalize_initial_report(au,'ready','remediation/unique.html','1.8','master-skeleton-v1','fixture',null);
  if n<>1 then raise exception 'unexpected initial version'; end if;
  if not exists(select 1 from public.audit_report_versions where audit_id=au and report_path='remediation/unique.html'
      and version=1 and prompt_version='1.8' and template_version='master-skeleton-v1'
      and agent_bundle_version='fixture' and intelligence_run_id is null) then
    raise exception 'immutable reconciliation row missing';
  end if;
  if not exists(select 1 from public.audits where id=au and status='ready') then
    raise exception 'finalized row not ready';
  end if;
  reset role;
  raise notice 'PASS: claim/disconnect retained identity, stable owner mapping, initial finalization immutable readback';
end $$;
rollback;
