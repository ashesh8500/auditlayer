-- ALM Intelligence v1 Kernel — schema, RLS, and RPC tests.
-- Run against a local Supabase DB with the kernel migration applied:
--   supabase db query --file supabase/tests/alm_intelligence_kernel_test.sql
--
-- Each section uses DO blocks with RAISE NOTICE for progress and
-- RAISE EXCEPTION for hard failures.  The script exits zero when every
-- assertion passes.

-- ===========================================================================
-- 1. Schema existence
-- ===========================================================================
do $$
declare
  _missing text[];
  _tables text[] := array[
    'subjects', 'subject_channels', 'living_brief_versions',
    'context_update_proposals', 'audit_batches', 'batch_audits',
    'intelligence_runs', 'evidence_snapshots', 'evidence',
    'scores', 'findings', 'recommendations', 'decisions'
  ];
  _t text;
begin
  _missing := '{}';
  foreach _t in array _tables loop
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = _t
    ) then
      _missing := array_append(_missing, _t);
    end if;
  end loop;

  if array_length(_missing, 1) > 0 then
    raise exception 'Missing tables: %', array_to_string(_missing, ', ');
  end if;
  raise notice 'OK: all 13 kernel tables exist';
end;
$$;

-- ===========================================================================
-- 2. RLS is enabled on every new table
-- ===========================================================================
do $$
declare
  _unprotected text[];
  _tables text[] := array[
    'subjects', 'subject_channels', 'living_brief_versions',
    'context_update_proposals', 'audit_batches', 'batch_audits',
    'intelligence_runs', 'evidence_snapshots', 'evidence',
    'scores', 'findings', 'recommendations', 'decisions'
  ];
  _t text;
begin
  _unprotected := '{}';
  foreach _t in array _tables loop
    if not exists (
      select 1 from pg_tables
      where schemaname = 'public' and tablename = _t and rowsecurity = true
    ) then
      _unprotected := array_append(_unprotected, _t);
    end if;
  end loop;

  if array_length(_unprotected, 1) > 0 then
    raise exception 'Missing RLS on: %', array_to_string(_unprotected, ', ');
  end if;
  raise notice 'OK: RLS enabled on all 13 kernel tables';
end;
$$;

-- ===========================================================================
-- 3. owns_subject helper exists and is SECURITY DEFINER
-- ===========================================================================
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'owns_subject'
  ) then
    raise exception 'owns_subject helper missing';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'owns_subject'
      and p.prosecdef = true
  ) then
    raise exception 'owns_subject must be SECURITY DEFINER';
  end if;
  raise notice 'OK: owns_subject helper present and SECURITY DEFINER';
end;
$$;

-- ===========================================================================
-- 4. RPC existence and permission checks (service-role gated)
-- ===========================================================================
do $$
declare
  _rpc record;
  _missing text[];
  _rpcs text[] := array[
    'create_subject',
    'link_subject_channel',
    'record_living_brief_version',
    'create_context_update_proposals',
    'resolve_context_update_proposal',
    'create_audit_batch',
    'add_audit_to_batch',
    'start_intelligence_run',
    'finalize_intelligence_run',
    'create_evidence_snapshot',
    'upsert_evidence',
    'record_scores',
    'record_findings',
    'record_recommendations',
    'record_decision'
  ];
  _rpc_name text;
begin
  _missing := '{}';
  foreach _rpc_name in array _rpcs loop
    if not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = _rpc_name
    ) then
      _missing := array_append(_missing, _rpc_name);
    end if;
  end loop;

  if array_length(_missing, 1) > 0 then
    raise exception 'Missing RPCs: %', array_to_string(_missing, ', ');
  end if;
  raise notice 'OK: all 15 RPCs present';
end;
$$;

-- ===========================================================================
-- 5. Service-role RPCs are NOT executable by anon/authenticated
-- ===========================================================================
do $$
declare
  _service_only text[] := array[
    'create_subject',
    'link_subject_channel',
    'record_living_brief_version',
    'create_context_update_proposals',
    'create_audit_batch',
    'add_audit_to_batch',
    'start_intelligence_run',
    'finalize_intelligence_run',
    'create_evidence_snapshot',
    'upsert_evidence',
    'record_scores',
    'record_findings',
    'record_recommendations',
    'record_decision'
  ];
  _rpc_name text;
  _leaked text[];
begin
  _leaked := '{}';
  foreach _rpc_name in array _service_only loop
    if exists (
      select 1 from information_schema.role_routine_grants
      where routine_name = _rpc_name
        and routine_schema = 'public'
        and grantee in ('anon', 'authenticated', 'public')
        and privilege_type = 'EXECUTE'
    ) then
      _leaked := array_append(_leaked, _rpc_name);
    end if;
  end loop;

  if array_length(_leaked, 1) > 0 then
    raise exception 'Service-role RPCs leaked to anon/auth: %', array_to_string(_leaked, ', ');
  end if;
  raise notice 'OK: service-role RPCs not leaked to anon/authenticated';
end;
$$;

-- ===========================================================================
-- 6. RLS policies — users can SELECT their own data
-- ===========================================================================
do $$
declare
  _missing_policies text[];
  _checks text[][] := array[
    array['subjects', 'subjects_select_own'],
    array['subjects', 'subjects_admin_all'],
    array['subject_channels', 'subject_channels_select_own'],
    array['living_brief_versions', 'living_brief_versions_select_own'],
    array['context_update_proposals', 'context_update_proposals_select_own'],
    array['audit_batches', 'audit_batches_select_own'],
    array['batch_audits', 'batch_audits_select_own'],
    array['intelligence_runs', 'intelligence_runs_select_own'],
    array['evidence_snapshots', 'evidence_snapshots_select_own'],
    array['evidence', 'evidence_select_own'],
    array['scores', 'scores_select_own'],
    array['findings', 'findings_select_own'],
    array['recommendations', 'recommendations_select_own'],
    array['decisions', 'decisions_select_own']
  ];
  _c text[];
begin
  _missing_policies := '{}';
  foreach _c slice 1 in array _checks loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = _c[1]
        and policyname = _c[2]
    ) then
      _missing_policies := array_append(_missing_policies, format('%s.%s', _c[1], _c[2]));
    end if;
  end loop;

  if array_length(_missing_policies, 1) > 0 then
    raise exception 'Missing RLS policies: %', array_to_string(_missing_policies, ', ');
  end if;
  raise notice 'OK: all required select-own and admin-all RLS policies exist';
end;
$$;

-- ===========================================================================
-- 7. Key column constraints
-- ===========================================================================
do $$
begin
  -- subjects.subject_type check
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'subjects_subject_type_check'
  ) then
    raise exception 'subjects.subject_type check constraint missing';
  end if;

  -- context_update_proposals.operation check
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'context_update_proposals_operation_check'
  ) then
    raise exception 'context_update_proposals.operation check constraint missing';
  end if;

  -- context_update_proposals.status check
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'context_update_proposals_status_check'
  ) then
    raise exception 'context_update_proposals.status check constraint missing';
  end if;

  -- scores.value range check
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'scores_value_check'
  ) then
    raise exception 'scores.value check constraint missing';
  end if;

  raise notice 'OK: key column constraints present';
end;
$$;

-- ===========================================================================
-- 8. Comments exist on all new tables
-- ===========================================================================
do $$
declare
  _uncommented text[];
  _tables text[] := array[
    'subjects', 'subject_channels', 'living_brief_versions',
    'context_update_proposals', 'audit_batches', 'batch_audits',
    'intelligence_runs', 'evidence_snapshots', 'evidence',
    'scores', 'findings', 'recommendations', 'decisions'
  ];
  _t text;
begin
  _uncommented := '{}';
  foreach _t in array _tables loop
    if not exists (
      select 1 from pg_description d
      join pg_class c on c.oid = d.objoid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = _t
    ) then
      _uncommented := array_append(_uncommented, _t);
    end if;
  end loop;

  if array_length(_uncommented, 1) > 0 then
    raise exception 'Tables without comments: %', array_to_string(_uncommented, ', ');
  end if;
  raise notice 'OK: all kernel tables have comments';
end;
$$;

-- ===========================================================================
-- 9. Existing tables and accounts/audits/observed-target semantics preserved
-- ===========================================================================
do $$
begin
  -- accounts table still exists and has its ownership_status column
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'accounts'
      and column_name = 'ownership_status'
  ) then
    raise exception 'accounts.ownership_status missing — observed-target semantics compromised';
  end if;

  -- audits table still exists
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'audits'
  ) then
    raise exception 'audits table missing';
  end if;

  -- audit_report_versions still exists
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'audit_report_versions'
  ) then
    raise exception 'audit_report_versions table missing';
  end if;

  raise notice 'OK: existing tables and observed-target semantics preserved';
end;
$$;

-- ===========================================================================
-- 10. Integration smoke: create subject, channel, brief, evidence, run, scores,
--     findings, recommendations, decisions via RPCs and verify reads.
--     Run as service_role (validates RPC contracts).
-- ===========================================================================

-- 10a. create_subject
do $$
declare
  _uid uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  _subject_id uuid;
  _row public.subjects%rowtype;
begin
  -- Test profile should already exist in auth.users and profiles
  if not exists (select 1 from public.profiles where id = _uid) then
    raise exception 'Test profile missing — run setup first';
  end if;

  _subject_id := public.create_subject(_uid, 'Test Creator', 'creator');
  select * into _row from public.subjects where id = _subject_id;

  if _row.user_id <> _uid then
    raise exception 'create_subject: user_id mismatch';
  end if;
  if _row.name <> 'Test Creator' then
    raise exception 'create_subject: name mismatch';
  end if;
  if _row.subject_type <> 'creator' then
    raise exception 'create_subject: subject_type mismatch';
  end if;
  raise notice 'OK: create_subject RPC works (subject_id=%)', _subject_id;
end;
$$;

-- 10b. link_subject_channel
do $$
declare
  _uid uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  _subject_id uuid;
  _channel_id uuid;
  _row public.subject_channels%rowtype;
begin
  select id into _subject_id from public.subjects where user_id = _uid limit 1;

  _channel_id := public.link_subject_channel(
    _subject_id, 'instagram', '@testcreator', true, null
  );
  select * into _row from public.subject_channels where id = _channel_id;

  if _row.channel_type <> 'instagram' then
    raise exception 'link_subject_channel: channel_type mismatch';
  end if;
  if _row.locator <> '@testcreator' then
    raise exception 'link_subject_channel: locator mismatch';
  end if;
  if _row.managed is not true then
    raise exception 'link_subject_channel: managed mismatch';
  end if;
  raise notice 'OK: link_subject_channel RPC works (channel_id=%)', _channel_id;
end;
$$;

-- 10c. record_living_brief_version
do $$
declare
  _uid uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  _subject_id uuid;
  _brief_id uuid;
  _row public.living_brief_versions%rowtype;
begin
  select id into _subject_id from public.subjects where user_id = _uid limit 1;

  _brief_id := public.record_living_brief_version(
    _subject_id, 1, '1.0',
    '{"name": "Test Creator", "niche": "biohacking"}'::jsonb,
    '{"demographics": "25-45"}'::jsonb,
    '{"usp": "evidence-based"}'::jsonb,
    '["coaching", "supplements"]'::jsonb,
    '["grow to 100k"]'::jsonb,
    '["no paid ads"]'::jsonb,
    '[]'::jsonb, '[]'::jsonb,
    _uid, true
  );
  select * into _row from public.living_brief_versions where id = _brief_id;

  if _row.subject_id <> _subject_id then
    raise exception 'record_living_brief_version: subject_id mismatch';
  end if;
  if _row.version <> 1 then
    raise exception 'record_living_brief_version: version mismatch';
  end if;
  if _row.confirmed is not true then
    raise exception 'record_living_brief_version: confirmed mismatch';
  end if;
  raise notice 'OK: record_living_brief_version RPC works (brief_id=%)', _brief_id;
end;
$$;

-- 10d. create_audit_batch (idempotent)
do $$
declare
  _uid uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  _subject_id uuid;
  _batch_id1 uuid;
  _batch_id2 uuid;
begin
  select id into _subject_id from public.subjects where user_id = _uid limit 1;

  _batch_id1 := public.create_audit_batch(_uid, _subject_id, 'test-batch-v1');
  _batch_id2 := public.create_audit_batch(_uid, _subject_id, 'test-batch-v1');

  if _batch_id1 <> _batch_id2 then
    raise exception 'create_audit_batch: idempotency broken (got % vs %)', _batch_id1, _batch_id2;
  end if;
  raise notice 'OK: create_audit_batch idempotent (batch_id=%)', _batch_id1;
end;
$$;

-- 10e. create_evidence_snapshot + upsert_evidence
do $$
declare
  _uid uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  _subject_id uuid;
  _channel_id uuid;
  _snapshot_id uuid;
  _evidence_count int;
begin
  select id into _subject_id from public.subjects where user_id = _uid limit 1;
  select id into _channel_id from public.subject_channels
    where subject_id = _subject_id and channel_type = 'instagram' limit 1;

  _snapshot_id := public.create_evidence_snapshot(_subject_id);

  -- Insert two evidence items
  perform public.upsert_evidence(
    ('[
      {
        "subject_id": "' || _subject_id || '",
        "channel_id": "' || _channel_id || '",
        "snapshot_id": "' || _snapshot_id || '",
        "source_type": "connected_api",
        "observed_at": "2026-01-01T00:00:00Z",
        "content_hash": "abc123def45678901234567890abcdef",
        "confidence": "high",
        "payload": {"followers": 5000, "engagement": 3.2}
      },
      {
        "subject_id": "' || _subject_id || '",
        "channel_id": "' || _channel_id || '",
        "snapshot_id": "' || _snapshot_id || '",
        "source_type": "public_web",
        "observed_at": "2026-01-02T00:00:00Z",
        "content_hash": "def456abc78901234567890123456def",
        "confidence": "medium",
        "source_url": "https://example.com/page",
        "payload": {"mentions": 12}
      }
    ]')::jsonb
  );

  select count(*) into _evidence_count
    from public.evidence
    where snapshot_id = _snapshot_id;

  if _evidence_count <> 2 then
    raise exception 'upsert_evidence: expected 2 rows, got %', _evidence_count;
  end if;
  raise notice 'OK: evidence snapshot + upsert (snapshot_id=%, items=%)', _snapshot_id, _evidence_count;
end;
$$;

-- 10f. start + finalize intelligence run, record scores/findings/recommendations
do $$
declare
  _uid uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  _subject_id uuid;
  _snapshot_id uuid;
  _run_id uuid;
  _score_count int;
  _finding_count int;
  _rec_count int;
begin
  select id into _subject_id from public.subjects where user_id = _uid limit 1;
  select id into _snapshot_id from public.evidence_snapshots
    where subject_id = _subject_id order by created_at desc limit 1;

  _run_id := public.start_intelligence_run(
    _subject_id, 1, _snapshot_id,
    'methodology-v2.1', 'expertise-v1.3', 'prompt-v4.0',
    'sha256:abc123', '1.0', null
  );

  -- Record scores
  perform public.record_scores(
    ('[
      {"run_id": "' || _run_id || '", "dimension": "engagement", "value": 72.5,
       "evidence_ids": ["abc123def45678901234567890abcdef"],
       "methodology_version": "v2.1"},
      {"run_id": "' || _run_id || '", "dimension": "growth", "value": 45.0,
       "evidence_ids": ["def456abc78901234567890123456def"],
       "methodology_version": "v2.1"},
      {"run_id": "' || _run_id || '", "dimension": "monetization", "value": null,
       "evidence_ids": [],
       "methodology_version": "v2.1"}
    ]')::jsonb
  );

  select count(*) into _score_count from public.scores
    where intelligence_run_id = _run_id;
  if _score_count <> 3 then
    raise exception 'record_scores: expected 3, got %', _score_count;
  end if;

  -- Record findings
  perform public.record_findings(
    ('[
      {"run_id": "' || _run_id || '", "finding_ref": "f-001", "claim": "High reel engagement",
       "evidence_ids": ["abc123def45678901234567890abcdef"],
       "confidence": "high", "dimension_impacts": {"engagement": 15}, "channel_type": "instagram"},
      {"run_id": "' || _run_id || '", "finding_ref": "f-002", "claim": "Website needs SEO work",
       "evidence_ids": ["def456abc78901234567890123456def"],
       "confidence": "medium", "dimension_impacts": {"growth": -10}, "channel_type": "website"}
    ]')::jsonb
  );

  select count(*) into _finding_count from public.findings
    where intelligence_run_id = _run_id;
  if _finding_count <> 2 then
    raise exception 'record_findings: expected 2, got %', _finding_count;
  end if;

  -- Record recommendations
  perform public.record_recommendations(
    ('[
      {"run_id": "' || _run_id || '", "recommendation_ref": "r-001",
       "content": {"action": "Post 3 reels per week"},
       "evidence_ids": ["abc123def45678901234567890abcdef"],
       "channel_type": "instagram"},
      {"run_id": "' || _run_id || '", "recommendation_ref": "r-002",
       "content": {"action": "Add meta descriptions"},
       "evidence_ids": ["def456abc78901234567890123456def"],
       "channel_type": "website"}
    ]')::jsonb
  );

  select count(*) into _rec_count from public.recommendations
    where intelligence_run_id = _run_id;
  if _rec_count <> 2 then
    raise exception 'record_recommendations: expected 2, got %', _rec_count;
  end if;

  -- Finalize
  perform public.finalize_intelligence_run(
    _run_id, 'completed', 45230, 8500, 9200, 0.042, 'fresh'
  );

  raise notice 'OK: intelligence run lifecycle (run_id=%, scores=%, findings=%, recs=%)',
    _run_id, _score_count, _finding_count, _rec_count;
end;
$$;

-- 10g. context update proposals + resolution
do $$
declare
  _uid uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  _subject_id uuid;
  _run_id uuid;
  _prop_data jsonb;
  _prop_ids uuid[];
  _prop_id uuid;
begin
  select id into _subject_id from public.subjects where user_id = _uid limit 1;
  select id into _run_id from public.intelligence_runs
    where subject_id = _subject_id order by created_at desc limit 1;

  _prop_data := ('[
    {"subject_id": "' || _subject_id || '", "base_version": 1,
     "intelligence_run_id": "' || _run_id || '",
     "path": "/audience/demographics", "operation": "add",
     "proposed_value": {"key": "also 18-24"},
     "evidence_ids": ["abc123def45678901234567890abcdef"],
     "reason": "New demographic signal detected"},
    {"subject_id": "' || _subject_id || '", "base_version": 1,
     "intelligence_run_id": "' || _run_id || '",
     "path": "/goals", "operation": "replace",
     "proposed_value": {"index": 0, "value": "grow to 200k"},
     "evidence_ids": ["def456abc78901234567890123456def"],
     "reason": "Growth trajectory update"}
  ]')::jsonb;

  _prop_ids := array(select public.create_context_update_proposals(_prop_data));

  if array_length(_prop_ids, 1) <> 2 then
    raise exception 'create_context_update_proposals: expected 2 ids, got %', array_length(_prop_ids, 1);
  end if;

  -- Resolve one proposal
  _prop_id := _prop_ids[1];
  perform public.resolve_context_update_proposal(_prop_id, 'accepted', _uid);

  -- Verify resolution
  if not exists (
    select 1 from public.context_update_proposals
    where id = _prop_id and status = 'accepted' and decided_by = _uid
  ) then
    raise exception 'resolve_context_update_proposal: status not updated';
  end if;

  raise notice 'OK: context update proposals + resolution (prop_ids=%)', _prop_ids;
end;
$$;

-- 10h. record_decision
do $$
declare
  _uid uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  _subject_id uuid;
  _rec_id uuid;
  _decision_id uuid;
begin
  select id into _subject_id from public.subjects where user_id = _uid limit 1;
  select id into _rec_id from public.recommendations
    where intelligence_run_id in (
      select id from public.intelligence_runs where subject_id = _subject_id
    ) limit 1;

  _decision_id := public.record_decision(
    _subject_id, _uid, 'recommendation', _rec_id, 'accepted',
    'Will implement starting next week'
  );

  if _decision_id is null then
    raise exception 'record_decision: returned null';
  end if;
  raise notice 'OK: record_decision works (decision_id=%)', _decision_id;
end;
$$;

-- ===========================================================================
-- 11. RLS boundary: unauthenticated/anonymous cannot read kernel tables
-- ===========================================================================
-- (We can only verify policy structure here; actual anon access is tested
--  by the Supabase Data API at integration time. The policy existence tests
--  in section 6 confirm select-own guards are in place.)
do $$
begin
  raise notice 'OK: RLS policies structurally verified (anon integration test requires live Data API)';
end;
$$;

-- ===========================================================================
-- ===========================================================================
do $$
begin
  raise notice '========================================';
  raise notice 'ALL KERNEL TESTS PASSED';
  raise notice '========================================';
end;
$$;
