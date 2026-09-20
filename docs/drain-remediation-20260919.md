# Fleet drain remediation — 2026-09-19

## Contract and scope

The smallest control is a durable **database claim fence**, not a new worker coordinator. Migration `20260919211532_worker_fleet_drain.sql` (created with Supabase CLI 2.117.0) adds one service-private singleton and changes the **existing canonical** audit/refinement claim RPCs. Each claim holds a shared row lock until its transaction ends. Pause takes the conflicting update lock: once pause commits, all earlier claim transactions are visible and subsequent claims return NULL. Existing active work, finalization, queue contents, billing, and model calls are not modified. Missing control state fails closed.

Read-only inspection found exactly local `auditlayer-worker@1.service` and `@2.service` active, `/opt/auditlayer/worker` as their working directory, health endpoints on 8788/8789 exposing `active_job_kind`, and deployed code using the canonical RPCs without a legacy raw-claim fallback. No reusable graceful signal/pause handler exists. Production still has the older `uv run` ExecStart; the parent release changes that separately.

**Inventory precondition:** this executable stop hook targets the reviewed two-process, single-host production fleet only. The DB fence prevents canonical claims on every host, and active DB counts are global; the hook does not discover remote machines or prove a remote process has exited after a stale reaper clears its row. Before release, confirm there are no remote/legacy workers or direct database claim writers. Additional hosts require their own active-process health/drain verification before this hook may authorize overwrite. This is not permission to assume an unknown fleet is empty.

`worker/infra/drain.sh` is executable and uses the existing production venv to run standalone `drain.py`, loading `/opt/auditlayer/worker/.env` without printing credentials. It:

1. Rejects extra local template instances and enabled/active legacy singleton/PDF services.
2. Pauses both canonical queues under an operator-retained UUID (`DRAIN_TOKEN`). Another UUID cannot steal or release the fence; retrying pause with the same UUID is safe.
3. Waits for **both** global running-row counts to reach zero **and** each active local process's health to say `status=ok, active_job_kind=null`. Health is necessary because reapers can clear running rows while an old process is still working; health alone is never sufficient.
4. Rechecks the fence/counts, stops exactly @1/@2, reads their inactive states back, and rechecks the DB fence/counts.
5. Leaves claims paused. Timeout, malformed/missing health, DB/HTTP/systemd error, process busy, or token mismatch never auto-resumes and never authorizes overwrite. No expired running claim is silently discarded by this hook.

`deploy.sh` compares both hook files to the reviewed archive, runs the archive's copy, verifies drain again before snapshots/overwrites, and resumes with the same token only after deployed-source/preflight/unit/start/health checks succeed. A failure after pause leaves the fence held, including failures after workers start. The old generic `/bin/true` hook escape is closed.

### Final capability signatures

All are in `public`; EXECUTE is revoked from PUBLIC/anon/authenticated and granted to service_role only. Table access is revoked even from service_role; RLS is enabled. SECURITY DEFINER functions have an empty search_path and qualified table names.

| Function | Arguments | Result |
| --- | --- | --- |
| `pause_worker_claims` | `p_drain_token uuid` | `void` |
| `resume_worker_claims` | `p_drain_token uuid` | `void` |
| `worker_drain_status` | none | `jsonb` with paused, drain_token, paused_at, active_audits, active_refinements |
| `claim_next_queued` | `worker_id text` | `jsonb` or NULL; existing API preserved |
| `claim_next_refinement` | `worker_id text` | `jsonb` or NULL; current serialized/versioned refinement contract preserved |

Release preflight includes these exact three added RPC signatures using OpenAPI GET only. Its migration-signature test also verifies all pre-existing required capabilities against the final combined migration tree. No generated web types were edited in this lane.

## Release procedure — parent/operator only, NOT executed here

1. Finish review/commit and full combined release verification. Work from a clean checkout of the approved full SHA. Confirm the fleet inventory above, rollback storage, and the current production environment/provider settings. Do not insert customer jobs or perform inference as a drain test.
2. Rehearse the migrations on an isolated database first. The drain migration follows `20260919204102_refinement_lifecycle.sql`; do not apply it out of order or replace that lifecycle with the historical refinement function.
3. With the explicitly verified Supabase project linkage and approved credentials, inspect and apply the **reviewed pending set** using the CLI. These commands affect the linked project; the parent owns approval and execution. No SQL editor/pasted DDL is necessary:

   ```bash
   npx --yes supabase@2.117.0 migration list --linked
   npx --yes supabase@2.117.0 db push --linked --dry-run --skip-vault
   # Stop if the dry-run includes anything not reviewed.
   npx --yes supabase@2.117.0 db push --linked --skip-vault
   npx --yes supabase@2.117.0 migration list --linked
   ```

4. Keep a release-specific UUID in the release incident record before invoking anything. Do not generate a different UUID when retrying an interrupted drain. From the reviewed checkout on the actual worker host:

   ```bash
   export AUDITLAYER_REPO_DIR=/absolute/path/to/reviewed-clean-checkout
   export REVIEWED_REVISION=<reviewed-full-40-character-SHA>
   export DRAIN_HOOK="$AUDITLAYER_REPO_DIR/worker/infra/drain.sh"
   export DRAIN_TOKEN=<retained-release-UUID>
   "$DRAIN_HOOK" status
   bash "$AUDITLAYER_REPO_DIR/worker/infra/deploy.sh"
   "$DRAIN_HOOK" status
   ```

   `status` must show the expected project state; post-success status must show `paused:false`. The deploy retains existing web/worker tests, preflight and rollback snapshots. This lane did not run the privileged full deployment.

### Explicit interrupted-drain recovery

```bash
# Set DRAIN_TOKEN to the ORIGINAL retained release UUID first.
"$DRAIN_HOOK" status
"$DRAIN_HOOK" drain --timeout 1800   # retry same-token drain; no new claims
"$DRAIN_HOOK" verify               # requires paused + empty + inactive
```

If active work remains, wait or investigate; **do not** mark it failed/clear it simply to force a deploy. A timeout or lost pause response may leave the DB paused: read status and retry with the same token. Resume is deliberately not automatic. If abandoning a deploy before overwriting, verify the existing source/environment/unit and start the unchanged @1/@2 if they were stopped, verify both health endpoints, then explicitly `"$DRAIN_HOOK" resume`. An already-resumed/lost resume response is reconciled via `status`; do not blindly repeat the deployment. No lease/TTL silently releases a forgotten drain.

The executable `resume` command now enforces recovery readiness itself: same-token pause, zero outstanding global claims, exactly the reviewed topology, both units active, two distinct health URLs, and JSON identifying a healthy idle `auditlayer-worker`. It rechecks unit activity and fenced counts before releasing the token, then reads the released state back. Stopped/unhealthy/wrong-service/malformed/missing endpoint, unexpected topology, busy process and outstanding-claim cases fail without calling resume. No force bypass was added. This does not attest source hashes, remote fleets or escaped children; those remain release-inventory responsibilities.

Parent regression evidence: the added negative cases failed against the previous actual CLI (10 failing assertions across parameterized cases), then the corrected hook passed the combined drain/release/preflight/job-health/lifecycle run: **49 tests and 5 subtests**, plus shell syntax and whitespace checks. These process tests use isolated loopback HTTP and fake systemd only. Independent re-review is pending; no live pause/resume was performed.

### Rollback

1. Drain again (same retained token if still paused; a newly retained token if the prior release resumed). Run `verify`; never restore files over active jobs.
2. Preserve failed-release evidence. Restore the saved worker **including its dependency environment**, versioned profile bundle, and template unit from the deploy's printed snapshot. Preserve subsequently rotated `.env` and runtime `var/` state deliberately; do not blindly overwrite them with old secrets/state.
3. Keep the additive database fence migration in place. Old canonical claim clients work with it. Do not drop the control table while canonical functions reference it, and do not reverse the sibling refinement lifecycle blindly.
4. Run daemon-reload, validate source identity and schema compatibility/read-only preflight and effective unit paths, start @1/@2, verify health, then explicitly resume. If any step fails, remain paused and investigate. `drain.sh`/`drain.py` in the reviewed checkout remain usable even when restoring an older worker tree.

Exact restore sequence after choosing the verified snapshot (run interactively with `set -e`, not as an unchecked paste):

```bash
set -e
export DRAIN_TOKEN=<retained-rollback-drain-UUID>
BACKUP=/opt/auditlayer/rollback-<actual-snapshot-suffix>
test -n "$DRAIN_HOOK" && sudo test -d "$BACKUP/worker/.venv"
"$DRAIN_HOOK" drain
"$DRAIN_HOOK" verify
FAILED=$(sudo mktemp -d /opt/auditlayer/failed-XXXXXXXX)
sudo cp -a /opt/auditlayer/worker "$FAILED/worker"
sudo cp -a /opt/auditlayer/hermes-profile "$FAILED/hermes-profile"
sudo cp -a /etc/systemd/system/auditlayer-worker@.service "$FAILED/"
# Restore code AND .venv; retain current secrets and runtime state.
sudo rsync -a --delete --exclude .env --exclude var/ "$BACKUP/worker/" /opt/auditlayer/worker/
sudo rsync -a --delete "$BACKUP/hermes-profile/" /opt/auditlayer/hermes-profile/
sudo install -m 644 "$BACKUP/auditlayer-worker@.service" /etc/systemd/system/auditlayer-worker@.service
sudo systemctl daemon-reload
sudo diff -qr -x .env -x var -x __pycache__ -x '*.pyc' "$BACKUP/worker" /opt/auditlayer/worker
sudo diff -qr "$BACKUP/hermes-profile" /opt/auditlayer/hermes-profile
sudo -u auditlayer bash -c 'cd /opt/auditlayer/worker && .venv/bin/python -m auditlayer_worker release-preflight'
systemctl show auditlayer-worker@1.service auditlayer-worker@2.service -p User -p WorkingDirectory -p ExecStart
# STOP here unless these match the deliberately restored reviewed unit.
"$DRAIN_HOOK" verify
sudo systemctl start auditlayer-worker@1.service auditlayer-worker@2.service
systemctl is-active --quiet auditlayer-worker@1.service
systemctl is-active --quiet auditlayer-worker@2.service
curl --fail http://127.0.0.1:8788/healthz
curl --fail http://127.0.0.1:8789/healthz
# Confirm both JSON bodies say status=ok before releasing the fence.
"$DRAIN_HOOK" resume
"$DRAIN_HOOK" status
```

## Local evidence / limitations

- RED: SQL fixture failed because `pause_worker_claims` did not exist; process test failed because the hook did not exist; preflight/deploy tests failed for missing capabilities/resume gates; credential-alias test failed before implementation.
- Real Postgres fixture uses a unique database in dedicated, unpublished `alm-drain-test-20260919` (`postgres:16`), explicit minimal table prerequisites, the actual historical claim migration, actual final refinement migration, and actual drain migration. It is not a complete Supabase/JWT/PostgREST migration-chain rehearsal.
- Four real SQL tests cover both queues, preserved work/resume, token ownership and grants, missing-row fail-closed behavior, and deterministic concurrency in both lock orderings. Concurrency waits on observed `pg_stat_activity.wait_event_type='Lock'`, not race-prone fixed sleeps.
- Process tests run the real CLI in a subprocess with loopback HTTP and fake systemctl/sudo executables. They cover database completion before stop, busy-process/reaper disagreement, missing health evidence, DB failure, explicit resume, verify-without-stop, and the production service-key alias. They never invoke the live control plane or systemd.
- **38 targeted worker/preflight/claim/deploy/process tests passed; 4 real SQL tests passed.** Migration checker passed with 71 files and latest `20260919211532`. Shell syntax and owned-file whitespace checks passed.
- No production DDL, pause/resume, customer mutation, service change, build, commit, deployment, payment, or model call was performed. Production observations were read-only. The dedicated fixture container was removed after testing.
