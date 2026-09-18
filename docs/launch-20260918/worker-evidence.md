# Worker loop and health evidence — 2026-09-18

## Result and scope

Implemented locally against base `0ca79eadc84c89bca31d05dc4fdbb9122bd3439b` in `/home/asheshkaji/projects/alm-launch-20260918`. **Not deployed; full-suite release gate remains blocked by three pre-existing date-sensitive tests.**

Changed only:

- `worker/auditlayer_worker/worker.py`
- `worker/auditlayer_worker/observability.py`
- new `worker/tests/test_worker_recovery.py`
- new `worker/tests/test_worker_active_health.py`
- new `worker/tests/test_worker_job_health.py`
- this evidence document

No commits, deployment, service restarts, configuration changes, schema changes, or paid inference. DeepSeek V4 Flash, tool-free inference, provider settings, generation/correction architecture, database claim RPCs, and audit finalization reconciliation remain unchanged. Other agents' web/schema edits were left untouched.

## Behavior

### Transient recovery

The long-running loop records an unhealthy heartbeat on an escaping failure, then retries only classified transient errors:

- HTTPX network errors, timeouts, and remote protocol disconnects;
- HTTP 408, 429, 500, 502, 503, 504;
- PostgREST APIError numeric/string equivalents and `PGRST003` (pool acquisition timeout).

Local protocol/unsupported URL errors, programming/configuration exceptions, auth/schema/permission errors, and unknown APIError codes remain fatal. Classification uses types/codes, never exception-message matching. Logs contain the exception class, consecutive-failure count, delay, and recovery event—not response bodies or credentials.

Equal-jitter exponential delay has ceilings 1, 2, 4, 8, 16, then 30 seconds; delay is between half the ceiling and the ceiling. Exponent and sleep are capped; the service keeps probing indefinitely while unhealthy rather than exhausting systemd's restart limit. A successful loop resets the backoff. `once=True` reports the first failure without retrying. Runtime shutdown still executes on exit.

Retries start a **fresh atomic claim**, not a replay of the last pipeline invocation or write. Deterministic committed-before-disconnect simulations verify that lost claim, finalization, and reaper responses do not rerun the same claimed job. Database-owned bounded job retries remain separate from daemon control-plane recovery.

Refinement completion now propagates errors after entering finalization instead of marking a possibly committed `done` row `failed`. This includes a failed success-event write. No generation replay or new unsafe finalization retry was introduced. Uncertain refinement rows may require operator reconciliation; see limitations below.

### Health semantics

Idle health retains the existing `max(60 seconds, 4 × poll interval)` freshness rule. A fresh failure now returns 503 rather than 200.

After a successful audit/refinement claim, the worker grants a fixed **900-second active-job observation budget**, covering processing through finalization. Health remains 200 after 61 seconds of synchronous work if there is no known error. At the budget boundary it returns 503, even if heartbeat calls continue. A second `start_job` cannot renew an active budget. Health exposes only job kind, age, and budget-exceeded state—no customer identifiers/content.

The budget is a conservative operational threshold, **not evidence of enforced runtime cancellation or progress**. A hung job can look healthy until it expires; it cannot look healthy forever. No new heartbeat thread, inference thread timeout, process kill, or interruption of finalization was added. An expired health budget is an alert, not authorization to blindly restart a worker during finalization.

Successful completion clears active state; exceptions also clear it and remain unhealthy through the loop failure boundary. Returned failed/blocked/unresolved audit summaries and failed refinements are unhealthy for that loop. A subsequent successful idle poll or completed job can recover process health; `/healthz` is not an aggregate historical job-success metric. `needs_review` is a valid completed workflow state, not a process failure.

## Verification

Canonical interpreter reused without modifying its environment:

`/home/asheshkaji/projects/auditlayer/worker/.venv/bin/python`

Observed: Python 3.11.15, HTTPX 0.28.1, Supabase/PostgREST 2.31.0. `PYTHONPATH=.` from this worktree's `worker/` verified imports resolve to the **launch worktree**, not the original checkout. Production baseline is Python 3.12.3; production-version execution was not performed.

TDD failures were observed before each behavior change: disconnect retry, broader HTTPX classification, PostgREST classification, fixed active budget, loop integration past 60 seconds, returned failure health, unresolved finalization health, non-renewable budget, and refinement completion protection. Clocks, sleeps, jitter, queue boundaries, and generation are injected; focused tests make no external calls or paid inference.

Final focused command:

```sh
cd /home/asheshkaji/projects/alm-launch-20260918/worker
PYTHONPATH=. /home/asheshkaji/projects/auditlayer/worker/.venv/bin/python -m pytest \
  tests/test_worker_recovery.py tests/test_worker_active_health.py \
  tests/test_worker_job_health.py tests/test_observability.py \
  tests/test_refinement_bundle_lineage.py tests/test_claim_rpc.py -q
```

**94 passed.** `git diff --check -- worker` passed. A repository-wide whitespace check at an earlier point found an unrelated concurrent web test edit; it was not changed by this lane.

Full suite was exercised twice:

1. Initial ordinary run: **657 passed, 3 failed, 11 skipped** (before additional classifier/edge tests). The existing signal-freshness fixtures unexpectedly reached Instagram token refresh using a fake token; no paid inference was invoked.
2. Full run after production-code completion, with a Python audit hook blocking non-loopback `socket.connect`: **683 passed, 3 failed, 11 skipped in 14.74 seconds**. Four external socket attempts were blocked. No external network connection was permitted by that run.

The same three tests fail:

- `test_connected_instagram_failure_refuses_stale_fallback`
- `test_live_instagram_snapshot_refreshes_connection_health`
- `test_snapshot_persistence_failure_is_captured_without_blocking_live_metrics`

All are in `tests/test_signal_freshness.py`, with fixed `expires_at="2026-09-18T00:00:00+00:00"`. The current date triggers an unmocked `refresh_long_lived_token` before their mocked metrics operation. With network blocked, extra token-refresh failure capture breaks their single-capture assertions. An isolated `git archive HEAD worker` baseline reproduced all three failures with HTTPX sending explicitly blocked. This is not caused by the loop/health patch. The release owner should make fixture time relative/frozen and mock the refresh boundary, then rerun the full suite; this lane did not edit those unrelated tests.

## Residual risks / integration follow-up

1. **Important pre-existing swallowed error outside ownership:** `SupabaseGateway.sweep_retryable()` catches every exception and returns zero (`supabase_client.py`, approximately lines 271–281). The outer loop cannot classify or mark unhealthy an error it never receives. Fault-injection tests cover an *escaping* sweep error, not this hidden path. Remove that swallow in the gateway with a dedicated regression test before claiming complete sweep observability/recovery. This lane was explicitly restricted to worker.py/observability.py and focused tests.
2. Provider hard wall-clock cancellation remains an architectural follow-up. The active budget detects a stall but does not stop it; `HERMES_TIMEOUT_SECONDS` alone does not enforce in-process cancellation. No unsafe thread timeout or mid-finalization kill was introduced.
3. A claim response lost after commit can leave a running row unprocessed. Main-audit stale recovery remains database-owned. Uncertain refinement finalization/claim outcomes require reconciliation; this patch does not add a refinement reaper or prove live database exactly-once execution. The safer choice here is not to overwrite/replay uncertain work.
4. The 900-second observation threshold is explicit and finite, not a measured production SLO. Existing audit/attempt stale-reaper thresholds and provider settings were not changed. Deployment drift and monitoring policy still need the release owner's verification.
5. No live OAuth, Supabase fault injection, paid model call, live load test, service rollout, or post-deploy health verification was performed. Local deterministic tests prove the code boundary, not production end-to-end readiness.
