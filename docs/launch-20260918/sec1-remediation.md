# SEC-1 remediation — targeted reconnect/disconnect ordering

## Outcome

Targeted reconnect now validates the expected connection inside the persistence transaction, after acquiring the same owner-profile lock as disconnect and worker writes. A deleted/replaced target fails with SQLSTATE `PIG01` (`instagram_connection_unavailable`), mapped by the callback to recoverable `connection_unavailable`. An explicit Add still uses the unchanged nine-argument API and can restore access after disconnect. The eight-argument compatibility API remains unchanged and inactive/reconnect-required.

No commit, deployment, remote migration, real OAuth, or real credentials. Only the disposable PostgreSQL container `alm-kernel-test-20260918` was changed. Existing migrations, worker code, and SEC-2 parser files were not edited by this lane.

## Implementation / lock proof

New CLI-generated migration: `supabase/migrations/20260918190801_instagram_targeted_reconnect_guard.sql`.

`persist_targeted_instagram_connection` accepts the existing nine arguments plus `p_expected_connection_id`. `p_ig_user_id` is the exact expected/provider identity (callback first checks provider identity against the intent). The wrapper:

1. Locks `profiles(id=p_user_id) FOR UPDATE`.
2. Locks/rechecks the connection by **ID + owner + exact bigint identity**; absent or mismatched targets raise `PIG01` before any nested write.
3. Calls the existing nine-argument persistence function within the same transaction, retaining both locks until commit/rollback.

The wrapper is `SECURITY INVOKER`, empty `search_path`, executable only by `service_role` and its owner; PUBLIC/anon/authenticated grants are revoked. Actual catalog readback: `prosecdef=false`, `search_path=""`, ACL `{postgres=X/postgres,service_role=X/postgres}`.

At READ COMMITTED, if disconnect wins the owner lock, the waiting callback sees the deleted target after disconnect commits and rejects. If targeted persistence wins, disconnect waits, then deletes the refreshed credential after persistence commits. No credential row survives either completed sequence. A replacement made by fresh Add has a new connection ID and cannot be overwritten by the stale targeted intent. The existing token-update trigger still rotates `credential_version`, including same-token reconnect; old worker credentials fail their fence.

The route retains its SELECT as an early UX check only, not as the security boundary. It chooses the targeted RPC only when `intent.connectionId` exists. Expected conflict redirects clear the state cookie and do not send raw DB messages/details, owner IDs, or tokens to logs/Sentry. Unexpected persistence errors retain the existing sanitized `instagram_connection_store_failed` behavior.

## Test-first evidence

Executed in this order:

- Wrote the real-PostgreSQL disconnect-between-preflight-and-write regression. Running it against the old nine-argument path (`ALM_SEC1_LEGACY=1`) failed: `stale callback restored credentials after disconnect`. Running the intended targeted path before implementation failed because the function did not exist.
- Added the callback targeted-RPC expectation; observed failure because the route still called `persist_instagram_connection`.
- Added the migration and targeted route dispatch; both tests became green.
- Added the callback conflict recovery/privacy test; observed `instagram_connection_store_failed` instead of `connection_unavailable`. Added the specific SQLSTATE mapping; green.
- Expanded real-DB coverage with deterministic two-session lock barriers, compatibility, owner/identity checks, replacement, and worker fencing. Also ran blocked-disconnect and replacement tests using the legacy path as negative controls: both failed because the old writer succeeded.

No production implementation preceded its corresponding failing regression. Additional invariants characterize preservation of existing contracts.

## Actual validation results

- New PostgreSQL suite: **8/8 passed**, including both commit orders. Concurrent tests leave the first transaction open, wait for an explicit psql output barrier, observe the second session's `pg_stat_activity.wait_event_type='Lock'`, then release the first transaction. They do not infer ordering from sleeps.
- Deleted target after successful preflight: rejected; zero credential rows, account's durable bigint retained and connection FK null.
- Replaced target: rejected; replacement credential row byte-for-byte JSON unchanged, same durable account, one subject/channel.
- Wrong owner, wrong exact bigint, nonexistent connection: rejected before mutation.
- Valid targeted reconnect: same connection/account, active again, credential version rotated, old worker fence denied.
- `anon` and `authenticated`: actual RPC executions denied with permission errors; `service_role`: execute privilege and successful persistence verified.
- Existing subject concurrency suite: **2/2 passed**.
- Existing continuity SQL suite: all five PASS notices, transaction rolled back.
- Callback Vitest suite: **19/19 passed**.
- Full web unit suite in the shared worktree: **68 files / 719 tests passed**.
- `pnpm typecheck`, ESLint on both owned callback files, and `git diff --check`: passed.
- Fixture cleanup readback: **0** auth users with `sec1@example.invalid` / `sec1-other@example.invalid`.

Expected sanitized stderr is emitted by pre-existing OAuth failure-path unit tests. No failing tests remain in the non-legacy runs. The deliberate legacy negative controls are expected to fail.

## Reproduction commands

From repository root, with the existing continuity and worker-fence migrations installed in the disposable container:

```sh
docker exec -i alm-kernel-test-20260918 psql -U postgres -X -v ON_ERROR_STOP=1 \
  < supabase/migrations/20260918190801_instagram_targeted_reconnect_guard.sql
ALM_TEST_PSQL='docker exec -i alm-kernel-test-20260918 psql -U postgres' \
  python3 supabase/tests/instagram_targeted_reconnect_test.py
ALM_TEST_PSQL='docker exec -i alm-kernel-test-20260918 psql -U postgres' \
  python3 supabase/tests/instagram_subject_concurrency_test.py
docker exec -i alm-kernel-test-20260918 psql -U postgres -X -v ON_ERROR_STOP=1 \
  < supabase/tests/instagram_subject_continuity_test.sql
```

To reproduce the original failure (expected nonzero exit), add `ALM_SEC1_LEGACY=1` and run only `TargetedReconnectTest.test_disconnect_between_preflight_and_write_rejects`.

From `web/`: `pnpm exec vitest run src/app/api/auth/instagram/callback/route.test.ts`, `pnpm test`, `pnpm typecheck`.

## Files / remaining gate

Created the migration above, `supabase/tests/instagram_targeted_reconnect_test.py`, and this document. Modified only `web/src/app/api/auth/instagram/callback/route.ts` and its `route.test.ts` on top of their pre-existing mission changes.

Independent security review remains required. This is local SQL-boundary and route-unit evidence, not a live HTTP/Meta race or production rollout claim. The migration must be applied before deploying the changed callback; absent RPC fails closed. Do not roll back only the route to the vulnerable targeted nine-argument dispatch.
