-- Focused tests for ALM schema bugfixes + AI storage / membership / progress.
-- Run against local Supabase after applying kernel + bugfix + ai_storage migrations:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/alm_intelligence_ai_storage_test.sql

\set ON_ERROR_STOP on

do $$
declare
  v_user uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid;
  v_subject uuid;
  v_channel uuid;
  v_snap1 uuid;
  v_snap2 uuid;
  v_ev uuid;
  v_ev2 uuid;
  v_run uuid;
  v_audit uuid;
  v_model text;
  v_emb uuid;
  v_state text;
  v_observed timestamptz;
begin
  raise notice '=== AI STORAGE / BUGFIX TESTS ===';

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='accounts' and column_name='updated_at'
  ) then
    raise exception 'FAIL accounts.updated_at missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='share_links' and column_name='updated_at'
  ) then
    raise exception 'FAIL share_links.updated_at missing';
  end if;
  raise notice 'PASS columns updated_at on accounts and share_links';

  if to_regclass('public.embedding_models') is null
     or to_regclass('public.evidence_embeddings') is null
     or to_regclass('public.evidence_snapshot_members') is null
     or to_regclass('public.intelligence_run_progress') is null then
    raise exception 'FAIL missing AI storage / membership / progress tables';
  end if;

  if not exists (select 1 from pg_extension where extname = 'vector') then
    raise exception 'FAIL vector extension missing';
  end if;
  raise notice 'PASS new tables + vector extension';

  insert into auth.users (id, email, instance_id, role, aud, raw_app_meta_data)
  values (
    v_user, 'ai-storage@test.local',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', '{}'
  )
  on conflict (id) do nothing;

  insert into public.profiles (id, email, full_name, role, plan)
  values (v_user, 'ai-storage@test.local', 'AI Storage Test', 'client', 'pro')
  on conflict (id) do nothing;

  v_subject := public.create_subject(v_user, 'AI Storage Subject', 'creator');
  v_channel := public.link_subject_channel(
    v_subject, 'instagram', 'ai_storage_handle', true, null
  );

  perform public.record_living_brief_version(
    v_subject, 1, '1.0',
    '{"name":"AI Storage Subject"}'::jsonb,
    '{}'::jsonb, '{}'::jsonb, '[]'::jsonb,
    '["grow"]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
    v_user, true
  );

  v_snap1 := public.create_evidence_snapshot(v_subject);
  v_snap2 := public.create_evidence_snapshot(v_subject);

  select e into v_ev
  from public.upsert_evidence(jsonb_build_array(
    jsonb_build_object(
      'subject_id', v_subject,
      'channel_id', v_channel,
      'snapshot_id', v_snap1,
      'source_type', 'public_web',
      'observed_at', '2026-07-01T00:00:00Z',
      'content_hash', 'ai_storage_hash_001234567890',
      'confidence', 'high',
      'payload', '{"k":1}'::jsonb
    )
  )) as e;

  if v_ev is null then
    raise exception 'FAIL upsert_evidence returned null';
  end if;

  if not exists (
    select 1 from public.evidence_snapshot_members
    where snapshot_id = v_snap1 and evidence_id = v_ev
  ) then
    raise exception 'FAIL membership missing for snap1';
  end if;

  select e into v_ev2
  from public.upsert_evidence(jsonb_build_array(
    jsonb_build_object(
      'subject_id', v_subject,
      'channel_id', v_channel,
      'snapshot_id', v_snap2,
      'source_type', 'public_web',
      'observed_at', '2026-07-15T00:00:00Z',
      'content_hash', 'ai_storage_hash_001234567890',
      'confidence', 'high',
      'payload', '{"k":1}'::jsonb
    )
  )) as e;

  if v_ev2 is distinct from v_ev then
    raise exception 'FAIL evidence reuse created a new row';
  end if;

  select observed_at into v_observed from public.evidence where id = v_ev;
  if v_observed <> '2026-07-01T00:00:00Z'::timestamptz then
    raise exception 'FAIL observed_at renewed on reuse: %', v_observed;
  end if;

  if not exists (
    select 1 from public.evidence_snapshot_members
    where snapshot_id = v_snap2 and evidence_id = v_ev
  ) then
    raise exception 'FAIL membership missing for snap2 reuse';
  end if;
  raise notice 'PASS evidence reuse + membership across snapshots';

  begin
    update public.evidence set confidence = 'low' where id = v_ev;
    raise exception 'FAIL evidence UPDATE should have been rejected';
  exception when others then
    if sqlerrm not like '%append-only%' and sqlerrm not like '%rejected%' then
      raise;
    end if;
  end;

  begin
    delete from public.evidence_snapshot_members
    where snapshot_id = v_snap1 and evidence_id = v_ev;
    raise exception 'FAIL membership DELETE should have been rejected';
  exception when others then
    if sqlerrm not like '%append-only%' and sqlerrm not like '%rejected%' then
      raise;
    end if;
  end;
  raise notice 'PASS append-only triggers';

  begin
    perform public.pin_evidence_to_snapshot(v_snap1, array[gen_random_uuid()]);
    raise exception 'FAIL cross/missing evidence pin should fail';
  exception when others then
    if sqlerrm not like '%does not belong to subject%' then
      raise;
    end if;
  end;
  raise notice 'PASS same-subject pin integrity';

  v_run := public.start_intelligence_run(
    v_subject, 1, v_snap1,
    'meth-1', 'exp-1', 'prompt-1', 'modelcfg-1', '1.0', null
  );
  perform public.set_intelligence_run_progress(v_run, 'analyzing', 'channel analysis');
  select customer_state into v_state
  from public.intelligence_run_progress where intelligence_run_id = v_run;
  if v_state <> 'analyzing' then
    raise exception 'FAIL progress state %', v_state;
  end if;

  begin
    perform public.set_intelligence_run_progress(v_run, 'researching', 'bad');
    raise exception 'FAIL invalid customer state accepted';
  exception when others then
    if sqlerrm not like '%invalid customer_state%' then
      raise;
    end if;
  end;
  raise notice 'PASS customer progress projection';

  v_model := public.register_embedding_model('test-mini', 3, 'fixture', 'cosine', 'ci');
  v_emb := public.attach_evidence_embedding(
    v_ev, v_model, '[0.1, 0.2, 0.3]'::vector, 'ai_storage_hash_001234567890'
  );
  if v_emb is null then
    raise exception 'FAIL attach_evidence_embedding returned null';
  end if;

  begin
    perform public.attach_evidence_embedding(
      v_ev, v_model, '[0.1, 0.2]'::vector, 'ai_storage_hash_001234567890_b'
    );
    raise exception 'FAIL dim mismatch accepted';
  exception when others then
    if sqlerrm not like '%dims%' then
      raise;
    end if;
  end;
  raise notice 'PASS embedding model registry + attach + dim guard';

  insert into public.audits (user_id, handle, platform, goal, status)
  values (v_user, 'ai_storage_handle', 'instagram', 'growth', 'ready')
  returning id into v_audit;

  insert into public.share_links (audit_id, token, mode, created_by)
  values (v_audit, 'ai-storage-share-' || replace(gen_random_uuid()::text, '-', ''), 'public', v_user)
  returning token into v_state;

  update public.share_links
     set view_count = view_count + 1
   where token = v_state;

  if not exists (
    select 1 from public.share_links
    where token = v_state and updated_at is not null
  ) then
    raise exception 'FAIL share_links.updated_at not set after update';
  end if;
  raise notice 'PASS share_links update with updated_at';

  -- cleanup soft: leave fixtures; release gate owns DB reset
  raise notice 'ALL AI STORAGE / BUGFIX TESTS PASSED';
end $$;
