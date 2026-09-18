# Independent worker security/reliability review — HOLD

Reviewed dirty release worktree against `origin/master` = HEAD = `0ca79eadc84c89bca31d05dc4fdbb9122bd3439b`. Review completed 2026-09-18. This is a bounded worker gate, not a verdict on the separately changing web SEC1/SEC2 work.

**HOLD: two reproduced issues remain.** The new credential RPC itself passed the tested stale-lifetime, ACL and tenant-association checks. The ordinary suite is green but does not cover the two counterexamples below.

## 1. HIGH — disconnected managed account becomes public; captured research can bypass the new fence

Locations:
- `worker/auditlayer_worker/supabase_client.py:108–125`: token lookup only queries `instagram_connections`; an empty result unconditionally means NOT_FOUND.
- `worker/auditlayer_worker/pipeline.py:852–858`: NOT_FOUND becomes public fallback, without consulting the durable managed account/audit association.
- `worker/auditlayer_worker/pipeline.py:278–287,334–343`: claimed audit research or account research is captured before the asynchronous credential lookup.
- `worker/auditlayer_worker/pipeline.py:1098–1123` and `427–439`: a metrics future returning None authorizes an unfenced `research_cache` field in `update_audit`.
- Continuity migration `20260918182043_instagram_subject_continuity.sql:206–218`: disconnect purges caches, retains the managed account, and deletes the credential row. Its explicit contract says this is reconnect-required, not public fallback.

**Real probes:**
1. Rollback-only PostgreSQL fixture called actual `persist_instagram_connection`, then actual `disconnect_instagram_connection`. Asserted the durable account remained `ownership_status='connected'` with `ig_connection_id IS NULL`, while the worker's exact connection lookup returned no row. Passed.
2. Actual `SupabaseGateway.get_instagram_token` and `_start_instagram_fetch`, with the empty DB result supplied by a fake transport, returned None and emitted `instagram_public_fallback`. Only `instagram_connections` was queried.
3. Actual `GenerationPipeline.run`, mock generator (no model), claimed `research_cache='captured-before-disconnect'`, and that empty connection result. Generator waited for the actual lookup future and raised a retryable `GenerationStageError` carrying its supplied research cache. Result:

```text
PROBE_DISCONNECT_CHECKPOINT {'status': 'failed', 'raw_checkpoint': 'captured-before-disconnect', 'fenced_rpc_count': 0}
```

Thus a claim/cache read preceding disconnect, followed by credential lookup after disconnect, can restore the just-purged reusable audit research through the new helper's public branch. This is not a failure of the SQL version predicate; the path avoids the RPC entirely. Even without that timing, managed disconnected audits silently take public fallback.

**Classification:** existing NOT_FOUND semantics become an unresolved compatibility/security gap with the new durable-disconnect contract and new checkpoint fence. Not attributed to a regression in worker backoff/health. Minimal acceptance: distinguish a genuinely public target from a disconnected managed identity before fallback, and ensure captured managed research cannot take the raw checkpoint branch. Add the claim-before-disconnect/lookup-after-disconnect regression, not just tests with an already-resolved fenced metrics object.

## 2. HIGH reliability — initial finalization can overwrite a committed ready audit with failed

Locations: `worker/auditlayer_worker/supabase_client.py:409–433`; `worker/auditlayer_worker/pipeline.py:550–564,600–608`.

`finalize_initial_report` directly lets a transport exception escape. Unlike regeneration, it does not reconcile or convert ambiguity to `ReportFinalizationOutcomeUnknown`. The pipeline catches it as a definite failure and writes `status='failed'`.

**Real deterministic probe:** actual `GenerationPipeline.run` + `MockReportGenerator` + actual bound `SupabaseGateway.finalize_initial_report`. Fake RPC execution first recorded an immutable version and set its state ready, then raised `httpx.ReadTimeout` to represent a response lost after commit. The pipeline's real catch path produced:

```text
PROBE_INITIAL_AMBIGUOUS {
  'summary': 'failed',
  'stored_state': 'failed',
  'committed_versions': ['immutable-version-1'],
  'updates': [{'status': 'failed', 'admin_notes': 'Report finalization failed after private artifact upload.'}]
}
```

**Classification:** confirmed pre-existing, not introduced by this diff: programmatically compared the entire initial-finalization method to `origin/master`, identical. Nevertheless it is an actual failure of the requested ambiguous-finalization gate, not the deferred hard-cancellation limitation. The new refinement protection does not cover initial reports. Minimal acceptance: reconcile the same uploaded initial artifact or preserve uncertain state rather than setting failed on an ambiguous initial RPC response; add the committed-then-timeout initial-report test.

## Verified passing areas

- Full deterministic worker suite, canonical interpreter `/home/asheshkaji/projects/auditlayer/worker/.venv/bin/python`, `PYTHONPATH=.` from this worktree's `worker/`: **696 passed, 11 skipped in 13.48 seconds**. Skips are the existing `test_sweeps.py` class moved to SQL. Ran via `pytest.main(['-q','-rs'])` with a Python audit hook rejecting non-loopback `socket.connect`: **zero external socket attempts**.
- Classified transport errors and HTTP/PostgREST transient codes retry with capped equal-jitter backoff; fatal config/auth/schema/local-protocol errors and `once=True` escape; runtime shutdown occurs. Existing recovery tests exercise cap and reset as well as each exposed control-plane boundary. Gateway sweep no longer swallows transport failure.
- Active health is fixed/nonrenewable, finite and 900 seconds; tests cover health beyond the idle poll window, deadline expiry despite activity, failure propagation, and failed/unknown summaries. No cancellation claim is made.
- Refinement tests cover committed finalization response loss and success-event failure without overwriting done. Regeneration tests cover same-path reconciliation/unknown outcomes. These positive results do not generalize to initial finalization (finding 2).
- Ran `worker/tests/instagram_worker_fence.sql` against **existing local container** `alm-kernel-test-20260918`, rollback-only: PASS for stale progression/cache/snapshot/token/reconnect writes after disconnect, reconnect with same token, same-row same-token OAuth version rotation, refreshed version use, cache TTL/non-sliding reuse, zero values and service-role/anon/authenticated ACL behavior.
- Ran all five blocks of `supabase/tests/instagram_subject_continuity_test.sql`, rollback-only: PASS, including durable identity/history, purge, rename/reconnect, tenant/identity conflicts and grant boundaries.
- Additional independent rollback-only SQL probe tested cache AND progression against another owner's audit, another owner's connection, and a different account's audit under the same owner: all rejected. Readback confirmed the disconnected managed-account/empty-credential state used in finding 1.
- Read the additive write-fence migration against continuity locking/purge semantics: owner-first lock, exact connection/version/state check, account stable identity and audit association validation, service-only execution, qualified tables and empty search path. No stale write accepted in the executed SQL tests.
- Compared installed PostgreSQL `prosrc` to the exact migration bodies: both `rotate_instagram_credential_version` and `write_instagram_worker_state` matched byte-for-byte after surrounding whitespace trim. Did not install/redefine any function.
- `git diff --check origin/master` passed at initial snapshot. Reviewed all five changed worker implementation diffs and relevant surrounding call paths.

## Scope and limitations

- No production, external network, paid model, migration application, installed function edits, commits or deploys. Database probes began transactions and rolled back. Did not rerun the prior concurrency runner because it commits fixtures; concurrent-session lock tests are prior implementation evidence, not independently reproduced here.
- Deferred hard wall-clock model cancellation is **not** a new blocker in this verdict. The active deadline is observation-only; it cannot terminate a hung provider. Uncertain refinement work still needs reconciliation. Do not turn health expiry into blind mid-finalization restart authorization.
- Schema must precede worker rollout; old privileged direct-writing binaries must be drained. No hosted PostgREST/production Python 3.12/live OAuth verification was performed.
- Only this report was created by the reviewer; no implementation/test/schema source was edited. Temporary mock generation artifacts used `TemporaryDirectory` and were removed automatically.

## Exact reviewed SHA-256 snapshot

The following were hashed before review and again after probes; unchanged:

```text
32698ec8d058c7c50b2a250cf83350f065a48b6202dfcb695de2c380793418b2  worker/auditlayer_worker/worker.py
95146ce5a01b5781b0b0590f2e3595028c4c6e178eaa9dc8876fe7ed0de49b50  worker/auditlayer_worker/observability.py
72cdb0238954cd2177c6f3841adee446806dcf7d168e9e4ffc2e1a00a1123545  worker/auditlayer_worker/pipeline.py
cd38e23eb2d48cf6d105978d97da646f8f67c490ad3fc21071c7205921745ec3  worker/auditlayer_worker/supabase_client.py
7c2bbc5030453e38e636fcdc17b83c6e9881ca6b88aedbd81b30662cbeee5a50  worker/auditlayer_worker/instagram_api.py
11490fa19047b730e5cc521eb0187d7ff9654818cafcd4086d24ba14ece045f6  supabase/migrations/20260918182043_instagram_subject_continuity.sql
9b0b5c8987a7e5c85dafbf3437ca642abe7a5a94f41daeda9239a38085c4b6c7  supabase/migrations/20260918184915_instagram_worker_write_fence.sql
```
