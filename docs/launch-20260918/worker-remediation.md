# Worker HOLD remediation — ready for independent re-review

Scope: minimal worker-only remediation of the two reproduced findings in `security-review-worker.md`, plus connected benchmark eligibility. No commit, deploy, migration application, production access, external network, or paid model invocation.

## Changes

- **HIGH1:** A missing credential row no longer alone establishes that a target is public. `get_instagram_token` accepts the audit ID and resolves the durable `audits.account_id` association, checking `user_id` on both audit and account reads and `platform='instagram'`. When no stable mapping is present it uses the existing owner/platform/handle account lookup. A retained connected/managed account or durable Instagram identity requires reconnection. Lookup failures continue to fail closed. `_start_instagram_fetch` supplies the audit ID. No new RPC/schema is required.
- The exact claim-before-disconnect / lookup-after-disconnect test starts with captured audit research, purges the simulated stored checkpoint and credential row, retains a renamed managed account, then invokes the real pipeline, asynchronous lookup, gateway and checkpoint policy. Its generator throws a retryable stage error carrying the captured cache. The worker emits reconnect-required, not public fallback, and never adds `research_cache` to the raw audit update. Existing public checkpoint and usable connection tests remain green.
- **HIGH2:** Initial finalization now reconciles through the existing immutable-version helper after an RPC exception. It checks the same audit/path and prompt/template/bundle/intelligence provenance. A matching version completes normally. Empty readback, unavailable transport, or conflicting provenance leaves the outcome unknown; the existing pipeline unknown branch does not mark the audit failed. Initial finalization is invoked only once: no reupload, replay or second finalization attempt.
- **Benchmark:** The own-company connection query requires active, connected, explicit `instagram` family, and expiry strictly later than current UTC, all before `LIMIT 1`. It returns no case when none qualifies. No quality/scoring change.

Files changed by this remediation:
- `worker/auditlayer_worker/supabase_client.py`
- `worker/auditlayer_worker/pipeline.py`
- `worker/auditlayer_worker/benchmark.py`
- New `worker/tests/test_worker_remediation.py`
- New `worker/tests/worker_remediation_boundary.sql`
- This report. Pre-existing unrelated dirty worktree changes were preserved.

## TDD and verification

Observed RED before each production fix:
1. Captured-cache regression failed because the raw failed-audit update contained `research_cache`; output explicitly showed `instagram_public_fallback`.
2. Initial-report success control passed; committed-timeout, empty-version, unavailable-readback and conflicting-provenance scenarios failed because the real pipeline wrote `status='failed'` after `httpx.ReadTimeout`.
3. Benchmark selection returned the expired first fixture and falsely returned a case when no eligible connection existed.

After fixes:
- **709 passed, 11 skipped in 13.96s** using `/home/asheshkaji/projects/auditlayer/worker/.venv/bin/python`, `PYTHONPATH=.`, from this worktree's `worker/`. The 11 existing `test_sweeps.py` skips state that eligibility moved into the atomic Postgres RPC.
- Entire suite executed under a Python audit hook rejecting every non-loopback socket connection: **`EXTERNAL_SOCKET_ATTEMPTS []`**. Loopback is necessary for the existing local TCP-reachability test. An earlier overly restrictive guard blocked that test; the corrected guard reran the entire suite successfully.
- New regression file: 13 passing cases. Includes actual PostgREST query construction over `httpx.MockTransport` for stable renamed identity, handle fallback, genuinely public account, foreign account, and foreign audit ownership boundaries. No hosted PostgREST was contacted.
- Actual pipeline + actual initial gateway finalizer tested with deterministic transport response loss after simulated commit, successful response, empty/unavailable readback and immutable provenance conflict. These are simulated lost HTTP responses, not claims of inducing production response loss.
- **Actual local PostgreSQL**, existing `alm-kernel-test-20260918`: ran `worker/tests/instagram_worker_fence.sql` successfully (stale writes rejected, purge preserved, reconnect/same-token OAuth fenced, service/anon/authenticated ACL boundaries).
- Ran new `worker/tests/worker_remediation_boundary.sql` successfully against that same database: actual persist/disconnect calls, pre-disconnect captured research, empty credentials, retained renamed managed identity linked by owner/audit/account, and actual service-role initial-finalization RPC followed by exact immutable-version readback and ready-state verification. Both SQL scripts are transaction/rollback-only; no fixtures or schema changes committed. The new probe initially assumed a NULL purged checkpoint; inspection confirmed the actual contract is empty string, and the fixture/assertion were corrected before passing.
- `git diff --check -- worker` passed.

SQL verification commands (repository root):

```sh
docker exec -i alm-kernel-test-20260918 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < worker/tests/instagram_worker_fence.sql
docker exec -i alm-kernel-test-20260918 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < worker/tests/worker_remediation_boundary.sql
```

## Boundaries / remaining release obligations

No queue redesign, new automatic retry policy, hard model cancellation, hosted service validation, or live connected benchmark was attempted. Unknown finalizations still require the established reconciliation/operational policy; this change prevents this worker attempt from converting uncertainty into a failed audit. Existing reviewed schema rollout/drain requirements remain. Independent reviewers should re-evaluate the HOLD against the exact snapshot below.

## Exact SHA-256 snapshot

```text
32698ec8d058c7c50b2a250cf83350f065a48b6202dfcb695de2c380793418b2  worker/auditlayer_worker/worker.py
95146ce5a01b5781b0b0590f2e3595028c4c6e178eaa9dc8876fe7ed0de49b50  worker/auditlayer_worker/observability.py
494b1f3a8ce77d76ed74f5f6ddf41e0eded97cbe7d59a5c676ec3e27877d431c  worker/auditlayer_worker/pipeline.py
18ad461f3b7b9fd8f043b7c732b60b562d4f6f1ad2c9d548e1371db312308c02  worker/auditlayer_worker/supabase_client.py
7c2bbc5030453e38e636fcdc17b83c6e9881ca6b88aedbd81b30662cbeee5a50  worker/auditlayer_worker/instagram_api.py
55f208aaf6425a733368e1b817214a2f1770ae4083d6e4c2f3029180fa26163e  worker/auditlayer_worker/benchmark.py
8791539fd6eea931ec00227e65fedc8d3f40762f3f680666cf6a2581ca4b9e0b  worker/tests/test_worker_remediation.py
ed95d712fa68030ddedd1ad17e5ab4b6408faed025515ec5dfbb485630b5ae63  worker/tests/worker_remediation_boundary.sql
```
