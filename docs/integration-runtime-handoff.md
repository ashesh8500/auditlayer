# Integrated ordinary-worker runtime handoff

## Implemented scope

Built on merged `07557cd9116ea5fe442e34351a1ed254a92003ea`. No web files or existing commerce migrations changed. No push, deployment, live credentials, model requests or production mutations.

- `_drain_once` now calls **`commercial_execution_claim` directly**, after canonical queue claim and before research. SQL null preserves the legacy path; any error stops execution. Commercial runs require the exact OpenRouter model/provider/route and in-process Hermes generator, not the mock or experimental executor.
- Quote input/output/call ceilings, rates and total upstream hold configure a fresh ordinary generator. Environment/app token and total-cost caps can only tighten admission. The existing one-call child, no fallback and zero SDK retry remain. Corrections consume the same bounded reservation; rejected-format calls never become customer usage.
- The quote's exact confirmed `brief_id` is loaded before generation, matched to the audit pin and owner, and its contextual fields go into the prompt. The old internal `Commercial quote ...` marker is not evidence. Empty brief content does not bypass the evidence gate.
- After immutable report finalization, the worker directly calls **`commercial_execution_finish`**, then reads the exact reservation back. Success bills only validated successful-path token usage at the quoted reference rates and existing 3x retail policy. Failed/blocked/review outcomes debit zero. SQL still owns wallet/cycle/cap/idempotency enforcement and requires the immutable report version. Lost terminal responses are reconciled or retried with the same payload, never by repeating inference.
- Provider USD is actual only when the provider supplied it. Rate estimates and unknown usage settle with nullable actual upstream cost, not invented zero. No dispatch is the only zero-cost inference proof. Ambiguous artifact finalization leaves the hold for explicit reconciliation.

## Explicit research-budget behavior

**Commercial execution does not invoke paid managed search tools.** The existing Hermes managed-tool path has no enforceable provider price/receipt contract; treating its historical `$0.12` estimate as a hard spend limit would be false. Commercial runs instead use the existing deadline-bounded public search-index fallback, connected first-party metrics, cached evidence and the pinned supplied brief. The quote's research allowance is reserved but not spent or billed; inference admission subtracts that allowance from the upstream ceiling. Commercial telemetry uses zero research allowance, not the legacy estimate.

This is an intentional, visible fail-closed boundary, not a missing worker hook. Qualify the runtime using this actual research path. Adding paid Exa/Tavily/etc. to commercial execution later requires an enforceable pre-call tariff/budget/receipt contract. **Legacy noncommercial managed research is unchanged.** Configuring a search key alone does not enable commercial paid research.

## Additive replay-fence migration

Apply `20260920201152_inference_replay_fence.sql` after the existing commercial migrations and before the worker, with the fleet drained.

- `audit_inference_fences` is a service-readable, non-client, non-worker-writable audit → originating run admission fence, **not a wallet**. Existing nonempty inference receipts are backfilled.
- The existing report-run receipt write atomically takes the audit lock and establishes/checks this fence. Another run cannot reserve against the same audit, including known completed paid attempts. The worker reads the exact fence back before provider dispatch; an absent migration/table or wrong fence fails closed.
- SQL validates commercial receipt input/output bounds, call count, quoted rates and cumulative reserved liability before accepting the pre-call write. Receipt history cannot be silently cleared.
- A row trigger applies to the existing stale/retry reapers and other requeues. Fenced or commercial jobs become `blocked`, with an audit event and reconciliation note, rather than replaying. Legacy jobs with no paid receipt retain their existing retry policy. Reaper return counters retain their original “processed/requeued” shape; read the actual audit status for the blocked disposition.
- `report_generation_runs.refinement_id` adds a unique durable link to the existing refinement lifecycle. OpenRouter refinements bind the same read-backed receipt recorder **before inference**, with SQL running-owner/lease checks. A fresh process cannot create a second run for that refinement. The existing refinement reaper remains terminal. Terminal cost labels now mark rate-estimated USD as estimated even with actual tokens.

No automated “clear fence and retry” RPC was added. Reconcile provider receipt/correlation IDs and immutable artifact/version state explicitly. Keep unknown exposure reserved. Use the existing exact commercial terminal/reconciliation protocols to release or settle financial holds; never delete financial history or replace unknown cost with zero. A new explicitly authorized execution should use a new audit/quote, not forcibly replay the old one. Expired/unclaimed commercial quotes and ambiguous worker failures also require explicit hold release/reconciliation.

## Other review repairs

- Locator/name-only rows and rows without a usable attributable HTTP(S) URL no longer count as factual evidence. Connected-metrics reports and supplied-context review drafts remain available. Prompt version is **1.14**.
- Intelligence duration normalizers aggregate only finite numeric duration keys from the existing report/runtime vocabularies, ignoring nested `_inference` receipts and unknown keys.

## Offline verification

Installed this worktree's own environment with `uv sync --frozen --extra embedded`. The original review reproducer first returned **7 passed**, demonstrating the original defects; those are not acceptance tests. New acceptance tests were run RED before the corresponding repairs.

`worker/tests/test_runtime_sql_integration.py` boots a uniquely named disposable local PostgreSQL container, applies **the full merged migration chain**, and drives the **actual `_drain_once`**, ordinary generator, real bounded SDK child, receipt hooks, quality gate, finalization and settlement. Only external search/model/storage and the SQL wire transport are offline fixtures; no generation/claim/settlement gate is patched to pass. Cases cover:

- successful immutable artifact plus exact SQL debit/actual-cost receipt;
- unknown upstream failure, review draft, format correction, input and call caps;
- lost settlement response and ambiguous finalization;
- SIGKILL after durable reservation, followed by real reaper and actual worker restart with no redispatch;
- concurrent cross-run reservation race, SQL cap/ACL rejection and legacy no-dispatch recovery;
- real nested refinement execution with pre-call SQL receipt, timeout and SIGKILL before return, terminal reaper, and duplicate-run denial.

Final verification: `cd worker && .venv/bin/pytest -q` → **920 passed, 12 skipped, 11 warnings** (189.51 seconds), including the full-chain SQL/ordinary-worker tracer and cross-language parser tests. Also ran the existing `python3 supabase/tests/commercial_composition_test.py` successfully against the full chain. `git diff --check` is clean. The multiprocessing/fork warnings are emitted by existing containment plus its new real-path tests; no live inference is claimed. Final suite log: `/home/asheshkaji/.hermes/cache/scratch/alm-integration-worker-tests-release.log`.

## Deployment configuration still owned by release parent

1. Review/apply the additive migration while the worker fleet is drained; retain the existing commerce migrations and approved wallet policy unchanged.
2. Deploy this complete worker source/lock with the existing canonical drain/parity workflow. Do not install only `commercial.py` or skip the receipt migration.
3. Use authorized existing `ALM_OPENROUTER_API_KEY`, `ALM_INFERENCE_PROVIDER=openrouter`, `ALM_INFERENCE_MODEL=auto`, `HERMES_MODE=inprocess`. Auto remains `deepseek/deepseek-v4-flash-0731`; no separate-key or provider-credit-limit gate is introduced.
4. Record a real qualification row in the otherwise-empty `commercial_runtime_catalog`, with verified rates, bounds, expiry and evidence-bearing output using the actual commercial public-index/connected path. Test-only catalog rows exist only in disposable containers.
5. Run production preflight/parity and bounded live qualification before enabling enrollment/execution flags. Free 500/month + 500 welcome, Brand $199/5,000 and Studio $499/15,000 remain SQL/web-owned. No paid top-ups or legacy-subscription migration was introduced.
