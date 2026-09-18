# Worker release-blocker follow-up — 2026-09-18

## Result

Implemented in `/home/asheshkaji/projects/alm-launch-20260918`; **full worker suite: 696 passed, 11 skipped**. The skips are the existing `tests/test_sweeps.py` class whose retry eligibility moved into PostgreSQL. The date-sensitive failures and swallowed gateway sweep failures are closed. Connected reusable cache writes now have a genuine database-transaction lifetime fence, including disconnect/reconnect races.

No commit, production write, service restart, deploy, live OAuth, paid inference, provider cancellation, or new queue. Existing worker.py/observability.py changes were retained, not edited by this follow-up. The continuity migration under review was not modified.

## Changes and exact write paths

- `worker/auditlayer_worker/supabase_client.py`: token lookup also retrieves `credential_version`; token refresh, connection snapshot refresh, and reconnect-required transition call the restricted `write_instagram_worker_state` RPC with owner, connection ID, and credential version. Missing fence context skips writes, with no direct-table fallback. `sweep_retryable()` no longer catches every exception and reports a false zero; typed HTTPX/PostgREST errors reach the existing outer classifier/backoff/health boundary.
- `worker/auditlayer_worker/instagram_api.py`: metrics carry a private, non-repr credential fence (IDs only, not token material).
- `worker/auditlayer_worker/pipeline.py`: carries the lookup fence through metrics acquisition; successful token refresh carries the RPC's **new** version into subsequent writes. `_link_account_and_progression` no longer upserts an account by handle or writes progression directly. Account research TTL, audit-account linkage, and progression metrics are one fenced RPC transaction against the existing durable account. Failure-stage audit research checkpoints also use that RPC when connected; incomplete/failed/unfenced metrics never fall back to a raw checkpoint write. Non-connected public research retains its existing checkpoint behavior. Clearing research during finalization is not a sensitive-cache resurrection.
- `worker/tests/test_signal_freshness.py`: relative 60-day expiry replaces the expired fixed fixture; explicit refresh tests still use the one-day boundary and mocked refresh. An autouse HTTP send guard records attempts and fails teardown even if application code swallowed the guard exception. Assertions now verify fenced RPC payloads; actual 24-hour/non-sliding TTL is tested in PostgreSQL.
- `worker/tests/test_instagram_api.py`: credential persistence and reconnect tests assert the new lifetime-fenced RPC contract, not obsolete direct writes.
- New `worker/tests/test_worker_cache_fence.py`: transport failure propagation, missing-fence rejection, connected checkpoint routing, unresolved/failed metrics, public checkpoint compatibility, and refresh-version propagation.
- New `worker/tests/instagram_worker_fence.sql`: rollback-only real PostgreSQL behavior/ACL/TTL tests.
- New `worker/tests/instagram_worker_fence_concurrency.py`: explicit local integration runner with separate PostgreSQL sessions and observed lock waits.
- New `supabase/migrations/20260918184915_instagram_worker_write_fence.sql`, created using `npx --yes supabase migration new instagram_worker_write_fence`.

## Why the fence is atomic

The additive migration adds a non-null UUID `credential_version` to connections. A trigger rotates it whenever `long_lived_token` is updated, **including same-token OAuth on the same row**. Disconnect deletes the old connection; reconnect gets a new connection ID/version. Worker refresh rotates the version and returns the new one. `updated_at` and pre-read checks are not used as the security/concurrency guarantee.

Every RPC mutation first locks the owning `profiles` row, matching the existing OAuth/disconnect lock order. It then locks and validates the exact owner + connection ID + version + connected/active state. Account/progression/checkpoint actions additionally validate the current account FK, stable Instagram identity, audit ownership, platform, and existing account link (or matching unlinked locator). Only then are writes performed while retaining the locks until transaction end.

Thus, either a worker write commits first and disconnect subsequently purges it, or disconnect commits first and the waiting worker rejects its stale fence. Reconnect cannot authorize old work merely because it has the same owner/Instagram ID/token. Existing account/Subject/channel IDs remain untouched. There is no account creation fallback.

The RPC is `SECURITY INVOKER`, has an empty search path and qualified table references, revokes PUBLIC/anon/authenticated execution, and grants execution only to service_role. Real local tests execute valid writes as service_role and attempt forbidden calls as anon/authenticated.

## Evidence

TDD red observations before the relevant implementation:

1. `test_retry_sweep_propagates_transport_failure`: `DID NOT RAISE httpx.ReadError` with the old blanket catch.
2. `test_metrics_without_credential_fence_cannot_write_caches`: old code issued three direct table writes (account upsert, audit link, progression upsert).
3. Connected checkpoint regression initially failed because `_checkpoint_cache` did not exist.
4. PostgreSQL fence test initially failed because `credential_version` did not exist; the subsequent migration and behavior tests passed.

Canonical full command, from this worktree's `worker/`:

```sh
PYTHONPATH=. /home/asheshkaji/projects/auditlayer/worker/.venv/bin/python -m pytest -q -rs
```

**696 passed, 11 skipped in 13.52 seconds.** Interpreter is the existing Python 3.11 environment; imports were explicitly read back as `/home/asheshkaji/projects/alm-launch-20260918/worker/auditlayer_worker/pipeline.py`.

A separate complete run used `pytest.main(['-q'])` with a Python audit hook rejecting non-loopback `socket.connect` events and counting attempts. It passed the same suite with **zero external socket attempts**. This is a test harness guard, not a production network configuration change. Full outputs are in `/tmp/alm-worker-followup-final.txt` and `/tmp/alm-worker-followup-offline.txt` on this host.

Real PostgreSQL commands from the worktree root:

```sh
docker exec -i alm-kernel-test-20260918 psql -U postgres -v ON_ERROR_STOP=1 \
  < supabase/migrations/20260918184915_instagram_worker_write_fence.sql
docker exec -i alm-kernel-test-20260918 psql -U postgres -v ON_ERROR_STOP=1 \
  < worker/tests/instagram_worker_fence.sql
ALM_TEST_PSQL='docker exec -i alm-kernel-test-20260918 psql -U postgres' \
  /home/asheshkaji/projects/auditlayer/worker/.venv/bin/python \
  worker/tests/instagram_worker_fence_concurrency.py
docker exec -i alm-kernel-test-20260918 psql -U postgres -v ON_ERROR_STOP=1 \
  < supabase/tests/instagram_subject_continuity_test.sql
```

Results:

- Additive migration applied and reapplied successfully on the existing disposable PostgreSQL 17 container; no host port exposed.
- SQL regression passed: stale progression/research/checkpoint/snapshot/token/reconnect actions rejected; purged metrics stayed purged; reconnect and same-token OAuth rejected old versions; fresh lifetimes and refreshed-token versions accepted; 24-hour TTL and non-sliding reuse verified; zero retained as zero; wrong owner rejected; service-role writes succeeded; anon/authenticated execution denied. SQL fixtures rolled back.
- **Two concurrency tests passed**, exercising both commit orders. Tests checked `pg_stat_activity.wait_event_type='Lock'` before releasing the first transaction, rather than relying on a sleep to assume overlap. Final accounts/progression/audit cache rows were read and checked after commits; fixture owners were deleted afterward.
- All five existing continuity SQL behavioral blocks passed unchanged after the new migration.
- `git diff --check -- worker supabase/migrations/20260918184915_instagram_worker_write_fence.sql` passed.

## Residual limitations / release conditions

1. Apply continuity migration first, then this additive migration, **before deploying the new worker**. Drain/retire old worker binaries: service-role direct table writes from old code do not participate in this RPC fence. This is not a blanket database ban on every privileged raw write.
2. The fence protects reusable connection/account/audit research caches and progression metrics, not cancellation of an in-flight provider call or rewriting immutable reports/evidence. An already-running report may finish using its captured snapshot; that is separate from resurrecting reusable caches.
3. Pending/failed metrics and missing/changed versions skip best-effort checkpoints/progression. Concurrent token refresh/OAuth can conservatively discard another worker's cache update. This trades cache completeness for safety; it does not replay generation or invalidate a legitimate later reconnect.
4. Tests used the existing disposable local PostgreSQL/Supabase scaffolding, not hosted PostgREST, production Python 3.12, live customer credentials, or real OAuth. Hosted migration/ACL/schema-cache verification and deployment smoke tests remain release-owner work.
5. Existing active-job health budgets remain observation-only; uncertain finalization/refinement recovery limitations documented in `worker-evidence.md` are unchanged. This follow-up closes its gateway sweep-swallow and dated-fixture blockers, not those broader operational limits.
