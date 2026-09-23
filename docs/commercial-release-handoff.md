# Commercial release composition

## Result and scope

Continuation of `d3d0db67d05a5fbe74c72f206d45c55d46f370cb`. New customer commands, UI, paid enrollment and an ordinary-queue SQL bridge are implemented and locally exercised. **This is not permission to enable production enrollment.** The production worker integration hook below still belongs to the worker reviewer/parent; this lane did not edit worker files. The offline tracer actually executes the canonical pipeline and bounded child, but substitutes the external model/storage transport. It is not live OpenRouter/evidence qualification or a full GoTrue browser journey.

No push, deploy, live Stripe operation, production database mutation or model spend. Existing subscriptions, legacy report allowances, gifts and trials remain separate.

## Executable customer paths

1. Sign in, then `/commercial` (linked from public pricing and Billing offers). **Enroll or Renew Free** calls `claimFreeAllowance()` explicitly. DB checks verified non-anonymous identity; grants are exactly once, with no Stripe IDs. The 500 monthly and initial 500 welcome credits expire at that UTC calendar month's end. Reading pages, wallet or receipts never renews them.
2. Configure a brand and managed channel in `/subjects`, and confirm its brief. `/commercial` lists only the signed-in owner's managed channels with a confirmed brief. Select one, enter a goal, **Request Quote**, then **Accept Maximum and Submit**. The server ignores browser owner IDs; SQL pins owner, subject, confirmed brief, canonical channel locator, runtime, rate version, budget and expiry. Channel changes require a new quote. It reserves the existing wallet and enqueues an ordinary `audits` row plus `audit_batches`/`batch_audits`, atomically. Explicit consent is mandatory; exact committed retries return the original audit before mutable admission checks. Free monthly renewal also occurs on this explicit submission command, not a read.
3. Accepted submissions go to `/audits/<id>`, with the existing reader `/audits/<id>/read`. The owner-session receipt read is `GET /api/commercial/receipts/<id>`: reserved maximum, terminal state, customer debit, nullable actual upstream cost and receipt ID. Unknown cost is not zero. Unrelated owners get 404.
4. **Brand — $199 / Month** or **Studio — $499 / Month** on `/commercial` calls `startCommercialCheckout`. A profile-locked pending enrollment is reserved BEFORE a chargeable session is created. Retries reuse the hosted session or the durable idempotency key. Existing active/legacy purchased contracts are denied, not converted. A pending session for one plan blocks checkout for the other. Missing session bindings older than 23 hours require reconciliation rather than reusing an expired Stripe idempotency key. Only signed checkout expiry releases pending capacity; browser cancellation does not.
5. `/api/webhooks/stripe` verifies the signature first, then routes commercial events separately from legacy events. Checkout adopts exact subscription/customer/period authority through the existing profile-wide ordered reconciler. `profiles.commercial_plan` distinguishes Brand/Studio; neither is mapped to Starter/Pro. The legacy `profiles.plan` is preserved. `invoice.paid` composes ordered renewal, durable payment command, exact retrieved invoice/payment-intent verification, included-credit confirmation, and lot readback. Subscription `active` or a success redirect alone grants no credits. Unknown/ambiguous payment facts return 503 for reconciliation. Existing `/settings/billing` and Stripe portal remain the management path.

## Configuration and migration order

Apply reviewed additive migrations before dependent web code:

- `20260920191558_commercial_composition.sql`: distinct commercial profile projection, extended ordered authority, pending checkout reservation/binding/expiry and opt-in subscription authority.
- `20260920192335_commercial_ordinary_queue.sql`: private qualified runtime catalog, durable quotes, atomic reservation + canonical ordinary queue submission, service-only worker claim/finish bridge. RLS owner reads; all writers are service-only.

`web/commercial.env.example` documents consumed flags, all default closed:

- `ALM_COMMERCIAL_FREE_ENABLED=1`: explicit Free enrollment/renewal button/action.
- `ALM_COMMERCIAL_PAID_ENABLED=1`: Brand/Studio checkout. Set only after worker/evidence readiness, not just Stripe configuration.
- `ALM_COMMERCIAL_EXECUTION_ENABLED=1`: quote/submission commands. **Do not set until the ordinary-worker bridge below is integrated.**
- `STRIPE_PRICE_BRAND_MONTHLY`: new USD monthly price, 19,900 cents, quantity 1.
- `STRIPE_PRICE_STUDIO_MONTHLY`: new USD monthly price, 49,900 cents, quantity 1.

Checkout retrieves each price and checks currency, exact canonical JSON amount, monthly interval and interval count before creating a session. Existing Stripe secret/webhook secret, Supabase configuration and site origin are unchanged. Do not reuse or mutate legacy prices. New legal ambiguity does not disable the implemented monthly subscription protocol: only enrollment release flags remain controlled.

## Ordinary worker integration — exact remaining code gate

Read `f2e318a` via `git show`: its ALM OpenRouter `auto` maps to `deepseek/deepseek-v4-flash-0731`, through `https://openrouter.ai/api/v1`, using `ALM_OPENROUTER_API_KEY`, ordinary in-process `GenerationPipeline`. This change intentionally does NOT send customer runs to the experimental workspace/model_execution executor.

Minimal hook required in the worker-owned `_drain_once` path:

1. After `claim_next_queued`, before **any** research/provider call, invoke service RPC `commercial_execution_claim({audit_id, worker_id, model})`. Null means legacy work: preserve its existing path. A commercial result contains the immutable runtime pin, per-call input/output ceilings, maximum calls, research budget, retail/upstream reservation and brief ID. Wrong worker/model, expired/revoked qualification/cycle or a second claim fail closed. **Do not ignore an error and continue ordinary execution.**
2. Construct the ordinary bounded generator from that pinned configuration. Enforce the returned input ceiling, output limit, max calls (including correction), research allowance and total upstream maximum before dispatch; use the matching reference rates, not stale default DeepSeek rates. Existing OpenRouter child containment/no-fallback/no-SDK-retry boundary stays intact. Do not merely check the cost after the provider has spent it. Use the existing pinned brief loader. No cross-model substitution.
3. After immutable report finalization, invoke `commercial_execution_finish({audit_id, worker_id, outcome, customer_debit_microusd, actual_upstream_microusd, receipt_id})`. Success requires an actual immutable report-version row matching the ready audit path. Debit only successful-path reference usage, within the agreed maximum. Failed/blocked/review/timeout outcomes have zero customer debit; actual provider cost remains nullable and unknown exposure stays reserved by the existing ledger. Retry the same terminal payload after a lost response. Do not retry inference.
4. Exclude these commercial attempts from legacy automatic retry sweeps. Reconcile abandoned claims/never-dispatched expired quotes explicitly: zero customer debit, actual upstream zero only with proven non-dispatch, otherwise null. Reconcile an ambiguous artifact-finalization result before terminal settlement. The SQL claim fence rejects a second dispatch; a sweep must not repeatedly requeue it.

These hook/recovery changes are **not implemented in worker source here** because that directory is reviewer-owned. Do not describe this as only a missing secret or a production-only gate. The offline tracer demonstrates the implemented protocol against the existing actual pipeline; production still needs this small composition hook and review.

## Qualification and legal gates (narrow)

`commercial_runtime_catalog` has **no seeded rows/rates** and is service-readable/operator-written only. The quote RPC denies `model_unqualified` until parent records a real reviewed qualification reference, expiry, correct OpenRouter pin and measured/verified rates plus enforceable runtime limits. Quotes also recheck exact catalog identity at submit and dispatch. Neither credentials nor published model listing qualifies a report. Live evidence/search and useful complete report within 500 credits remain parent's verification gate. The deliberately named `test-only` catalog values exist only inside disposable test databases.

Commercial top-up checkout remains absent/closed. Do not invent purchased-credit expiry, refund eligibility or retention terms. The old service-only accounting grant primitives remain for existing contractual operations; they are not a new top-up customer purchase surface. A future top-up feature must reserve pending capacity before creating a chargeable session. No automatic top-ups or overages. New monthly included credits expire on exact Stripe period boundaries; Free uses UTC calendar months. No annual pricing, no changes to old subscriptions.

`workspace.v1` / `P-01.v1` remains the execution/ledger identifier. `ALM-2026-09.v1` is the separate commercial source and durable payment/cycle pin. The old experimental catalog is not promoted into a qualified OpenRouter runtime. No second wallet or finance dashboard was created.

## Local evidence and commands

From `/home/asheshkaji/projects/alm-commercial-release`:

```sh
python3 supabase/tests/commercial_composition_test.py
# Optional actual worker/pipeline smoke, using an installed worker dependency environment:
ALM_TEST_WORKER_TRACER=1 /home/asheshkaji/projects/auditlayer/worker/.venv/bin/python supabase/tests/commercial_composition_test.py
python3 supabase/tests/commercial_release_test.py
python3 supabase/tests/workspace_credit_ledger_test.py
python3 supabase/tests/workspace_execution_test.py
cd web
pnpm test --reporter=dot
pnpm typecheck
pnpm lint
pnpm build
```

- SQL tests own uniquely named disposable loopback PostgreSQL containers, bootstrap actual auth/storage primitives and apply the full real migration chain, then destroy only their containers. Composition tests cover concurrent pending checkout, ambiguous replay, signed expiry recovery, Brand/Studio adoption/included grants, ordered renewal/cancel/conflict, ACL, verified Free → qualification denial → pinned quote → atomic ordinary queue, consent/channel/owner/concurrency denial, immutable-artifact enforcement, no-charge receipt and stable retry.
- The optional worker tracer calls the real `claim_next_queued`, real Linux bounded child, real unchanged `GenerationPipeline`/quality check, actual SQL `finalize_initial_report` and commercial terminal receipt. Executed result: **ready**, immutable report row persisted, receipt read back. The external model was the repository's deterministic mock and storage was an owned scratch artifact; estimated mock usage was NOT charged or presented as measured upstream cost. An optional intelligence-bridge transport warning is expected in this minimal fixture. No live evidence-bearing qualification is claimed.
- Existing profile-wide subscription-authority tests also passed against an independently owned `127.0.0.1:55439/commercial_closure` container with the full chain. Direct invocation without that test DB correctly refuses to run.
- Web suite: **140 files / 1,051 tests passed**; typecheck and production build passed. Lint passed with 11 existing warnings, zero errors. The experience-contract artifact was regenerated for the added route.
- Real built Next server + Chromium: `/pricing`, widths 390 and 1440, three enrollment links, correct approved prices, no horizontal overflow; unauthenticated `/commercial` redirects to `/login`. Owned server stopped. Mounted UI/action tests cover explicit Free command, authenticated owner binding, checkout reservation/binding/readback and receipt reads. A full authenticated GoTrue + Stripe + live model browser journey was not executed.

Scratch logs: `alm-composition-tests-final.log`, `alm-composition-build.log`. No independent final reviewer verdict claimed. Rollback: close enrollment/execution flags first; retain ledger, grants, receipts and provider authority. Do not delete financial rows or alter existing Stripe subscriptions to roll back application code.
