# Commercial release handoff

## Status — partial implementation, NOT an enrollment-ready release

This change implements the approved price source, public-offer replacement, and a working extension of the existing credit kernel. It does **not** complete customer quote/submission or Brand/Studio checkout enrollment. Do not enable paid enrollment or describe signup → report → receipt as verified. No production database, Stripe object, environment, deployment, worker file, or shared skill was changed. Parent owns integration and independent release review.

## Implemented

- `web/src/lib/commercial-policy.json` is the new opt-in price authority, version `ALM-2026-09.v1`: Free $0 / one brand / 500 monthly + 500 verified welcome; Brand $199 / one brand / 5,000; Studio $499 / five brands / 15,000 pooled; Enterprise custom. Single-owner, 100 credits/$1, 3x reference tariff assumption, $10/1,000 paid top-ups, no annual offer. Purchased expiry/refund terms remain null, not fabricated.
- `/`, `/pricing`, and Billing share `CommercialOffers`; Starter/Pro and $129 Workspace are no longer their public default offers. Existing subscription management remains available. New enrollment is explicitly unavailable. Legacy pricing/domain/Stripe authority is retained for purchased contracts; no migration or repricing of profiles.
- Additive `20260920182906_commercial_release.sql`: SQL projection of the canonical JSON (exact equality tested); commercial cycle metadata; nullable Stripe subscription for genuine UTC calendar-month Free cycles; verified/non-anonymous identity checks using `auth.users`, not user-editable metadata; profile-lock serialized welcome/monthly grants and exact grant IDs; new managed-brand admission; per-plan consumption/top-up/upstream caps; existing reservation/settlement/dispatch kernel reused, not replaced by a second wallet.
- Paid grant/command/confirm support accepts additional `pricing_version` and `commercial_plan` pins. Confirmation retains those pins. Existing exact Stripe customer/subscription/period authority remains mandatory. Brand/Studio grants cannot silently replace a different purchased contract. Omitting the commercial pin cannot escape into the legacy top-up cap. Existing grant RPC remains service-only; its renamed legacy implementation is no longer directly callable by service role.
- Free reserves are genuinely admitted against its wallet, one held run per owner and one managed brand. Studio admits five different subjects and can actually consume $300 in a cycle; Brand consumes $100. $15/run retail ceiling remains. Failed runs produce zero customer debit; unknown provider liability remains held by the existing kernel.
- `commercial_credit_wallet()` is an owner-session/RLS read, with `period_source`, `period_start/end`, nullable `subscription_id`, `commercial_plan`, and `pricing_version`. Wallet API/client validate this separately from the unchanged `workspace.v1` Wallet and label Free periods honestly. Nullable purchased expiry means **no expiry recorded**, not a published perpetual-credit promise.
- `claimFreeAllowance()` is a tested explicit server action, disabled unless `ALM_COMMERCIAL_FREE_ENABLED=1`. It takes no browser owner, grants through SQL, and verifies an owner-session wallet readback. It is **not yet wired to an enrollment button or signup callback**; do not turn this flag on as a substitute for completing execution admission. Wallet GET never grants credit.

## Worker / shared-contract reconciliation

No worker or root `contracts/` edits were made. The execution wire remains `workspace.v1` / `P-01.v1`; `ALM-2026-09.v1` is a separate **commercial** version on durable cycles/grant payloads, not a silent replacement of that execution policy identifier. Existing `workspace_execution_admit` and `workspace_execution_dispatch` work with Free and legacy after this migration, exercised in real SQL. Parent must reconcile the old shared `policy.p01.v1.json` commercial constants before exposing new enrollment; do not treat the old $129/3,000-credit constants as the new offer.

Exact integration boundaries:

1. Paid grant/command JSON: retain all existing keys, add `pricing_version: "ALM-2026-09.v1"`, `commercial_plan: "brand" | "studio"`. Included amount and paid amount derive from canonical policy. Never mint from a browser redirect or unverified metadata.
2. Free grant: service-only `commercial_free_grant({owner_id})`; returns cycle UUID. Lazy monthly renewal must be called from an explicit authenticated enrollment/submission command, **not** from reads. No fake Stripe IDs. Initial welcome and current monthly allowance both expire at that month's UTC boundary (included/non-rollover).
3. Reservation signature unchanged. SQL selects the live cycle, enforces brand slots and wallet/caps under the profile lock. It now recognizes nullable lot expiry. Managed brands are durable slots; no brand-replacement/release command is implemented yet. Subject archival/deletion UX must be reconciled before enrollment.
4. Wire receipts keep their existing shape. Correlate commercial version via reservation → cycle. Existing reservation fields separate customer retail debit from actual-or-null upstream cost, with timestamps/run identity; lots record included subsidy vs purchased funding. No new finance dashboard was built.
5. Operational upstream caps in the source: Free $6 (including welcome exposure), Brand $60, Studio $180, independent of retail. These conservatively scale the existing $60/$100 kernel ratio; they are **limits, not measured margins**. Worker per-operation worst-case quote/budget must fit remaining caps. Existing per-reservation upstream ceiling is still $60.
6. Shared wire Wallet is still paid-only; the web commercial projection is intentionally separate. Parent may generate a new shared wallet union, but must not fabricate Stripe authority to satisfy the old schema.

## Exact remaining implementation/release gates

These are code gaps, not merely missing secrets:

- Customer intake currently still blocks workspace intents. Implement durable server-authoritative qualified-model/rate quotes and atomic **submission-time** admission; bind confirmed brief, subject, model, costs and explicit consent. Route new commercial users into the credit execution path rather than the legacy report-count path. Enforce Free one-active-run at enqueue as well as reservation; preserve gifts and old audits without converting them to money. Complete expiry/retry/renewal/concurrent-final-slot tests through that actual entry point.
- Compose Brand/Studio checkout and invoice renewal commands with the existing profile-wide ordered subscription-authority reconciliation. Existing `planForPriceId`, `PurchasablePlan`, checkout actions and webhook adoption only support legacy Starter/Pro; **do not map new Brand/Studio prices to those plans**. New mappings/enrollment state need an explicit versioned opt-in that does not rewrite existing subscribers. SQL commercial grants require the correctly reconciled customer/subscription/period already present; direct fixture setup is not webhook proof.
- Before creating a top-up Checkout/PaymentIntent, reserve pending purchase capacity transactionally. The implemented grant cap alone does not prevent concurrent checkouts from charging before a later cap rejection. Need pending-payment recovery/expiry and test duplicate/out-of-order invoice, payment, renewal, cancellation and failure/retry behavior end to end. No automatic overages/reload. Free top-ups denied.
- Final purchased-credit expiry/refund and retention terms are still absent. Keep enrollment closed. Do not reuse the old pilot cancellation/refund action as newly approved terms. Purchased lots currently store null expiry; existing legacy lots retain their original expiry.
- Qualify ALM-owned OpenRouter + evidence retrieval, pin an actual rate/model/data route, and prove a useful complete evidence-bearing report within 500 credits. Web catalog remains unavailable pending the other worker lane/parent's qualification; no credentials or live tokens were used here.

### Stripe products / environment gates

Parent must create **new**, separate USD prices in Stripe **test mode first**:

| Offer | Required price | Recurrence / quantity |
|---|---|---|
| Brand | 19,900 cents | monthly / 1 |
| Studio | 49,900 cents | monthly / 1 |
| Paid top-up | 1,000 cents for 1,000 credits | one-time / explicit quantity within remaining purchase cap |

No annual prices; no changes to existing Starter/Pro or $129 subscriptions/products. Suggested new bindings `STRIPE_PRICE_BRAND_MONTHLY`, `STRIPE_PRICE_STUDIO_MONTHLY`, `STRIPE_PRICE_COMMERCIAL_TOPUP` are **not consumed by this commit** and must be implemented with the checkout/webhook mapping above. Existing `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, Supabase service-role and public origin remain server environment configuration. Only new flag actually consumed here is `ALM_COMMERCIAL_FREE_ENABLED`, default closed. Do not place secrets into source or tests.

After missing composition is implemented: test mode signup → grant → quote → queued → dispatch → immutable artifact/receipt, failed/no-charge path, concurrent allowances and purchases, cancellation and old-subscriber preservation; regenerate/verify database types; independent security/spec review; preview browser checks; reviewed additive migration before dependent web deployment; reconcile worker contracts and deploy worker/web together; bounded live evidence probe and exact deployed readback. Parent owns these actions, no push/deploy by this child.

Rollback: keep financial rows, immutable receipts and profile authority. Disable enrollment first. Revert web/worker behavior only with compatibility checked; do not drop cycles/lots or alter Stripe subscriptions to undo the release.

## Executed evidence

Pinned pnpm `/home/asheshkaji/.hermes/cache/scratch/alm-release-takeover/toolchain/node_modules/.bin/pnpm` version 10.34.5; frozen install. No live model calls.

- RED→GREEN demonstrated for missing commercial source, Free grant function, Free inactive-cycle reservation, paid allowance rejection, wallet projection, new payment command, missing web commercial wallet/action and old pricing rendering. Additional adversarial RED caught a legacy-top-up cap bypass; fixed by locked commercial-pin enforcement. Another RED caught transaction-start-time cycle readmission after expiry; fixed using volatile wall-clock admission.
- `python3 supabase/tests/commercial_release_test.py`: uniquely owned disposable loopback PostgreSQL, actual entire migration chain; canonical JSON parity, verified identity, four concurrent grants exactly once, no profile mutation, RPC ACL, Free reservation/concurrency/brand cap, failed zero debit, Brand/Studio paid grants, five-brand Studio admission, purchased nullable expiry, consumption at $100/$300 then denial, commercial pin bypass denial, owner wallet isolation, bound payment confirmation, existing legacy and Free durable execution dispatch, and wall-clock expiry.
- `python3 supabase/tests/workspace_credit_ledger_test.py`: all 12 printed acceptance groups pass (legacy kernel suite).
- `python3 supabase/tests/workspace_execution_test.py`: all 4 printed acceptance groups pass (existing execution suite).
- From `web/`: `pnpm test --reporter=dot`: **134 files / 1,040 tests passed**; `pnpm lint`, `pnpm typecheck`, `pnpm build` pass. Initial full-suite invocation from repository root produced path errors; corrected workdir results supersede it.
- Real built Next server + Chromium on owned loopback port 3197: `/` and `/pricing`, widths 390 and 1440; approved price DOM, no old public offers in commercial cards, no horizontal overflow. Server closed afterward. This is local public-page coverage, not authenticated live enrollment.
- Logs (scratch, not committed): `alm-commercial-tests-final.log`, `alm-commercial-build.log`, `alm-commercial-lint.log` under `/home/asheshkaji/.hermes/cache/scratch/`.

No independent reviewer verdict is claimed. Parent must review the exact integration candidate before promotion.
