# Instagram continuity kernel — implementation evidence

## Scope and coordination contract

Worktree: `/home/asheshkaji/projects/alm-launch-20260918`, baseline `0ca79ea`.
Only the new migration, two new database tests, and this file were authored by this lane. No web/worker edits, commit, deployment, production query, live DB mutation, OAuth request, or customer credential use.

Migration created with `npx --yes supabase migration new instagram_subject_continuity` (CLI 2.117.0):

`supabase/migrations/20260918182043_instagram_subject_continuity.sql`

Preserved signatures and exact return columns:

- `persist_instagram_connection(uuid,bigint,text,text,timestamptz,text,bigint,bigint,text)` → `table(connection_id uuid, account_id uuid)`.
- Eight-argument overload (same parameters without final Graph family) → same output. Calls the safe bridge but persists `reconnect_required`, null Graph family, and `is_active=false`.
- `disconnect_instagram_connection(uuid,uuid)` → void.

Additional **service-only** APIs:

- `classify_instagram_subject_link(p_user_id uuid,p_account_id uuid)` → `classification text,subject_id uuid,channel_id uuid`. STABLE/read-only.
- `reconcile_instagram_subject_link(p_user_id uuid,p_account_id uuid,p_expected_classification text,p_expected_channel_id uuid default null)` → `subject_id uuid,channel_id uuid`.
- `instagram_locator_key(text)` is a restricted pure normalization helper.

All functions explicitly revoke PUBLIC/anon/authenticated execution; service_role alone receives execution. Privileged functions pin an empty search path and qualify table/helper references. No new exposed table or RLS relaxation.

## Behavior

- Add nullable `accounts.instagram_user_id` and owner+identity unique partial index, **without data backfill**. This non-credential identity survives credential deletion.
- OAuth serializes on the owner profile row. Existing same-owner account/Instagram identity wins, including a renamed account after disconnect. Conflicting identity/username/tenant mappings raise and roll back the credential write too.
- Reuse an existing exact account-linked managed Instagram channel; otherwise relink one uniquely matching owned managed channel (case/@/Instagram URL normalization); otherwise create a minimal Subject plus channel. Never choose an unrelated earliest Subject. Ambiguous and archived locator matches fail closed. An observed-only channel/report is never promoted or reassigned.
- Rename updates the durable account and linked current channel locator, not historical audit locators, Subject name, briefs, report versions, shares, or batches.
- Disconnect deletes the credential row, detaches its FK, and retains account/channel/audit/progression IDs and non-secret history. Clears account research/Instagram snapshots and cache timestamps, cached display/avatar metadata, audit research caches associated by account (plus current owner/handle), and progression platform metric values. Progression row IDs and report-derived score remain.
- Immutable report/brief/evidence provenance is not treated as a reusable platform credential cache and is not rewritten. Full account/report deletion remains a separate operation.
- Web must treat managed channels without usable credentials as reconnect-required, not public fallback. Callback remains nine-argument; it can resolve Subject via returned account ID. Targeted expected-IG validation remains the web lane's pre-persistence responsibility.
- Worker must not repopulate purged caches from an in-flight stale connection after disconnect. The SQL transaction cannot prevent an independent later service-role write that ignores connection validity.

## Reviewed repair workflow (not executed against production)

Do **not** call the legacy `backfill_connected_subjects()` routine: it retains the old earliest-Subject behavior for historical compatibility. This migration neither calls it nor automatically runs repair.

After migration, produce a service-only read-only manifest in one repeatable-read transaction:

```sql
begin isolation level repeatable read read only;
select a.user_id,a.id as account_id,r.*
from public.accounts a
cross join lateral public.classify_instagram_subject_link(a.user_id,a.id) r
order by a.user_id,a.id;
-- Connections with no account need verified OAuth (not a guessed handle import).
select c.user_id,c.id as connection_id,'connection_without_account' as classification
from public.instagram_connections c
where not exists(select 1 from public.accounts a where a.ig_connection_id=c.id)
order by c.user_id,c.id;
-- Historical observed/unassigned reports remain reports, not managed Subjects.
select user_id,count(*) as observed_or_unassigned_reports
from public.audits where account_id is null group by user_id order by user_id;
rollback;
```

Classifier outputs: `already_linked`, `safe_same_owner_relink`, `new_unassigned_connection`, `ambiguous_identity`, `observed_only`, `cross_owner_conflict`. Keep identifiers private in the operator manifest; publish aggregate classifications only.

For each explicitly reviewed account mapping, call `reconcile_instagram_subject_link` with manifest owner/account/classification/channel. It locks and reclassifies before mutation and rejects changed manifests. Resolve ambiguous/conflicting mappings manually rather than guessing. After a successful repair, reclassify to `already_linked`; replay of that current classification returns the same IDs. Stale classification replay is intentionally rejected. No old audit is reassigned to manufacture continuity.

## Actual PostgreSQL verification

Disposable local Docker container `alm-kernel-test-20260918`, PostgreSQL 17, pgvector package installed. No host port published. All pre-existing repository migrations applied in filename order, followed by the new migration. Plain PostgreSQL required local test-only Supabase `auth.users`, `auth.uid`, `auth.role`, storage bucket/object schemas, roles/grants, and realtime publication scaffolding. This is real PostgreSQL execution, not a mocked SQL evaluator; it is **not** hosted Supabase/PostgREST or live OAuth validation.

TDD failures observed before fixes:

1. Existing persistence: `FAIL: OAuth did not atomically create subject/channel`.
2. Existing disconnect: `FAIL: disconnect destroyed durable account identity`.
3. Inconsistent legacy identity: `FAIL: disconnect overwrote conflicting durable identity`.

All then passed after implementation. New migration was reapplied successfully (idempotent DDL/function replacement).

Executed:

```sh
docker exec -i alm-kernel-test-20260918 psql -U postgres -v ON_ERROR_STOP=1 \
  < supabase/migrations/20260918182043_instagram_subject_continuity.sql
docker exec -i alm-kernel-test-20260918 psql -U postgres -v ON_ERROR_STOP=1 \
  < supabase/tests/instagram_subject_continuity_test.sql
ALM_TEST_PSQL='docker exec -i alm-kernel-test-20260918 psql -U postgres' \
  python supabase/tests/instagram_subject_concurrency_test.py
docker exec -i alm-kernel-test-20260918 psql -U postgres -v ON_ERROR_STOP=1 \
  < supabase/tests/alm_intelligence_kernel_test.sql
docker exec -i alm-kernel-test-20260918 psql -U postgres -v ON_ERROR_STOP=1 \
  < supabase/tests/alm_intelligence_ai_storage_test.sql
```

Results:

- New SQL suite: all five behavioral blocks passed, transaction rolled back. Covers creation, unrelated/observed isolation, normalized relink, rename/retry, disconnect/reconnect with identical durable IDs, immutable versions/shares/briefs/batches, cache purge, same IG identity across tenants, foreign disconnect, identity/rename conflicts, ambiguity rollback, legacy overload, dry-run/stale-manifest/idempotency, explicit ACLs, and corrupt identity rejection.
- New Python suite: **2 tests passed**, including **8 simultaneous service-role callbacks across separate PostgreSQL sessions**, one durable account/Subject/channel, then disconnect/reconnect; real anon/authenticated execution attempts denied.
- Existing kernel SQL suite: `ALL KERNEL TESTS PASSED`, including behavioral owner RLS tests under local auth scaffolding.
- Existing AI storage SQL suite: `ALL AI STORAGE / BUGFIX TESTS PASSED`.
- Supabase CLI advisors against this container's private Docker IP, `--type security --level error`: `No issues found`. This is an error-level check, not a claim of zero baseline warnings.
- Owned-path whitespace check passed. An earlier whole-worktree `git diff --check` identified trailing whitespace in another lane's `web/src/app/api/auth/instagram/callback/route.test.ts:35`; not edited by this lane.

Initial regression-suite scaffolding failures (missing auth columns and JWT-claims parsing) were fixed only inside the disposable database; then both existing SQL suites passed. No repository schema was altered to accommodate the scaffolding.

## Remaining release gates

- Parent release lane must review/apply migration before dependent web/worker deploy; inspect hosted function signatures/ACLs and run read-only classification before any explicitly reviewed repair.
- Genuine user-controlled OAuth, targeted reconnect, hosted RLS/PostgREST, browser journeys, and worker cache-write race protection are not proved by these database tests.
- Rollback application code must not restore the old destructive disconnect function. Keep additive identity column/index and preservation RPCs; do not delete newly created Subjects/accounts to roll back UI.
- Disposable local container remains available for parent review. Remove with `docker rm -f alm-kernel-test-20260918` when finished; it is unrelated to the pre-existing Buzz containers.
