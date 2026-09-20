# Workspace credit ledger handoff — 2026-09-19

## Status and ownership

Implemented and exercised the **actual additive SQL migration** against a uniquely named disposable PostgreSQL 16/pgvector container, after applying the complete preceding migration chain. No production/database credentials, shared Supabase reset, deployment, commit, existing migration edit, profile entitlement update, or old report-count conversion is part of this change.

Owned files:
- `supabase/migrations/20260919220000_workspace_credit_ledger.sql`
- `supabase/tests/workspace_credit_ledger_test.py`
- this handoff

This is a transactional accounting primitive, **not an integrated/live billing release**. The application/Stripe/worker adapter remains the parent's integration work. Enrollment remains blocked pending final terms, retention and lawful purchased-credit expiry/refund policy.

## SQL authority

Every monetary column is nonnegative BIGINT MICROUSD, capped at `9007199254740991`. No monetary floats. Policy identifier is **`p01.v1`**, as explicitly required in this lane. Versioned policy constants: access 129000000; included 30000000; purchased increments 10000000 and aggregate purchased/cycle 70000000; customer consumption/cycle 100000000; retail reservation/run 15000000; independent actual upstream plus unresolved exposure 60000000.

All mutations serialize on the **existing `profiles.id` row**. This shares the lock authority with existing Stripe reconciliation. Admission additionally proves canonical `subjects.user_id = owner_id`. Admin customers get no entitlement bypass or cross-tenant projection. Customer reads use `auth.uid()` RLS; anon has no reads/writes, authenticated has no writes/RPC execution. Service role has SELECT, but **no direct DML** on new tables; mutation goes through explicitly granted SECURITY DEFINER functions with fixed search paths. No credentials have columns or belong in RPC JSON.

- Immutable lots, allocations, customer ledger and refund reservations: no UPDATE/DELETE, even through accidental privileged DML (triggers). No cascade deletion of accounting history.
- Lots are deducted included-first, then earliest expiry (stable ID tie-break). Expired lots never admit new work. Refund-reserved amounts cannot be spent.
- One held reservation per owner. Customer and upstream capacity are reserved in the same transaction; failure rolls back allocation and reservation inserts.
- A run intent cannot obtain a second reservation under a different reservation ID. Retry of a live hold requires **exact JSONB payload equality**, a still-valid quote, live authoritative billing interval and unexpired allocated lots.
- Successful customer debit is at most its original reservation. Failure/release must debit zero. Exactly one terminal payload; all different replays fail. Released holds cannot resurrect.
- Upstream cost is independent of retail tariff. Aggregate actual cost must include **all** failed calls/internal retries. Unknown cost is NULL and retains the full upstream reservation, even after customer release and across billing rollover. Known receipts and later reconciliation cannot exceed reserved exposure; overspend/missing receipts fail closed, retaining capacity for manual investigation.
- Cancellation prevents all new admission (conservative, not only scheduled runs) and further grants for the same subscription. It does not mutate legacy paid/trial/gift/report entitlements. There is intentionally no implicit resume RPC.

## Service-role SQL adapter API

Every function takes one argument **`p jsonb`**. These flat RPC fields are internal persistence adapters, **not another wire schema or model/rate catalog**. Validate the canonical `contracts/workspace-v1` object first, then explicitly project its fields; never spread arbitrary request JSON. UUID return values identify durable rows. Errors are raised exceptions, so rejected calls roll back fully.

### `workspace_credit_grant(p) -> uuid` (lot)

Fields: `owner_id`, `event_id`, `payment_id`, `subscription_id`, `customer_id`, `period_start`, `period_end` (the exact provider integer epoch pair), `kind` (`included` or `purchased`), `amount_microusd`, `paid_microusd`, `policy_version` (`p01.v1`).

Included requires 30000000 allowance and 129000000 confirmed access payment. Purchased requires paid amount exactly equal to the explicit increment. Unique event **and** payment IDs prevent invoice/payment replay; duplicate identical payload returns its original lot, altered identity payload fails. A different event cannot mint a second included lot for the same cycle. Subscription/customer/status/complete interval must exactly match authoritative current profile. No old-subscription adoption occurs here; existing reconciliation must first establish authority.

**Required upstream trust boundary:** the verified webhook/reconciliation service supplies genuinely confirmed paid USD invoice/payment facts, correct product/price and explicit P01 opt-in. SQL cannot authenticate a Stripe signature or infer payment truth from a string ID. Never call from a success redirect or customer request without payment confirmation. Tax/discount/proration handling is not guessed: non-exact access payment requires review. Late payment for an already expired/noncurrent cycle fails closed for reconciliation rather than minting current credit.

### `workspace_credit_reserve(p) -> uuid` (reservation)

Fields: `owner_id`, `reservation_id`, `run_intent_id`, `subject_id`, `quote_id`, `quote_expires_at` (timestamp string), `model_id`, `rate_version`, `context_version`, `intent_fingerprint` (64 lowercase hex), `retail_microusd`, `upstream_microusd`, `recurring`.

`reservation_id` is a stable retry UUID, not a newly generated ID on transport retry. `run_intent_id` is independently unique per owner. Adapter mapping from canonical wire contract: Quote `expires_at` -> `quote_expires_at`; `rate_card_version` -> `rate_version`; refs `context_version_id` -> `context_version`; Money `.microusd` -> the two flat monetary fields. Persist the model's complete pin/data route in the canonical intent/fingerprint; `model_id` is the catalog reference, not a free provider secret. SQL stores the exact adapter payload and refuses mismatch, but does **not** implement a parallel model/rate catalog or verify a fabricated quote. The trusted adapter must resolve the confirmed canonical context, consent, immutable rates/model and calculate worst-case customer/upstream bounds using the shared contracts.

### `workspace_credit_finish(p) -> uuid`

Fields: `owner_id`, `reservation_id`, `outcome` (`success`, `failure`, `released`), `customer_debit_microusd`, `actual_upstream_microusd` (integer or explicit NULL), `receipt_id`; success also requires nonempty `successful_path_id`.

The receipt must be generated from trusted provider usage, not browser assertions. Customer tariff includes only the one successful path. Actual upstream includes every internal retry/failed request. Set `actual_upstream_microusd = NULL` when any call's cost is ambiguous. Even a pre-dispatch release requires a durable receipt documenting known-zero or unresolved cost. Settlement of an already admitted execution remains possible after expiry; this does not authorize dispatch after expiry.

### `workspace_credit_reconcile(p) -> uuid`

Fields: `owner_id`, `reservation_id`, `receipt_id`, `actual_upstream_microusd`. Only terminal reservations with unresolved upstream cost can reconcile; payload is immutable and duplicate-safe. No customer charge is introduced by reconciliation.

### `workspace_credit_refund_reserve(p) -> uuid`

Fields: `owner_id`, `request_id` (globally unique stable string), `subscription_id`. Freezes the unconsumed purchased portion from that subscription in append-only `refund_reserved` ledger entries and returns a `workspace_credit_refunds` row containing total MICROUSD. Existing held run allocations are excluded; settle those first, then use a new explicit refund request for any remainder. Identical retry returns the original refund; changing the payload is denied. A new request cannot refund already frozen lots twice.

**Integration gap:** this is not a Stripe refund and does not claim cash has been returned. Parent must implement provider refund initiation with idempotency, payment/lot-level refund receipt reconciliation, and explicit recovery of unsuccessful provider refunds. No automatic unfreeze/delete is provided: unresolved refund liability remains unavailable to spending. The source ledger links every frozen amount to its paid lot/payment identity.

### `workspace_credit_cancel(p) -> text`

Fields: `owner_id`, `subscription_id`; return is the subscription ID. Idempotently marks its known workspace cycles cancelled without changing the legacy profile. Parent must separately stop/pause schedules, revoke pending dispatch/delivery permissions, and reconcile actual Stripe cancellation. Cancellation is intentionally not reported as a provider-side cancellation by this primitive.

## Integration blockers / boundaries

1. At handoff inspection, shared `contracts/workspace-v1/schema.json` used policy identifier **`P-01.v1`**, while this lane's explicit specification says **`p01.v1`**. Parent must resolve the exact identifier in the canonical contract; do not silently normalize identifiers in a live adapter. No parallel wire catalog was added here.
2. Wire objects use nested USD Money/model pins and different field names. Explicit validated adapter mapping is required as above. Unsupported model/rate, unconfirmed context, stale quote, or missing enrollment/consent must fail before service RPC invocation. No customer may select `owner_id` without session ownership authorization; service-only SQL intentionally does not mistake the service role's absent `auth.uid()` for an end-user identity.
3. A reserve retry is **not a worker lease**. Parent must use its durable run/dispatch idempotency/claim authority so a lost response or duplicate queue delivery cannot execute the provider twice. Revalidate the held reservation immediately before dispatch. The worker must bound the entire retry envelope within `upstream_microusd` and check remaining exposure before every costly operation; SQL cannot observe a network call that bypasses it.
4. Receipt accounting is aggregate per run, not a provider-call receipt catalog. A trusted adapter must include failed calls and forbid success-path tariff from accumulating retries. No automatic timeout releases ambiguous upstream exposure.
5. Refund cash execution/reconciliation, schedule wiring, operator reconciliation UI, wallet presentation and customer routes are not connected by this lane. Twelve-month purchased expiry is implemented only as the proposal's test-mode policy; live enrollment requires finalized terms.
6. This migration intentionally uses the exact assigned filename, preserving existing chronology; no CLI-generated timestamp changes or prior migration rewrites.

## Reproducible actual-Postgres verification

From `/home/asheshkaji/projects/alm-report-mobile-20260919`:

```sh
python supabase/tests/workspace_credit_ledger_test.py
```

Python standard library + Docker are sufficient. Harness uses pinned `pgvector/pgvector@sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b`, random `alm-workspace-ledger-<uuid>` name, ephemeral loopback-only port, database `workspace_ledger`, no bind mounts, and unconditional cleanup of **only its own container**. No URL/env connection override is accepted. Full preceding canonical migration chain is applied using the repository's disposable Supabase auth/storage bootstrap, then this exact migration. PostgreSQL, not mocks, runs every RPC, concurrent psql sessions, row locks and RLS.

Observed output (exit 0):

```text
PASS paid grant duplicate/lost-response preserves legacy profile
PASS atomic reserve and exact intent retry
PASS successful settlement exactly once
PASS last-balance race, overspend rollback, released no resurrection, pending exposure
PASS failed actual cost reconciliation remains customer free
PASS stale Stripe, tenant/admin boundary, immutable ledger and JSON-safe money
PASS topup cap, included first, refund holds and cancellation preserve paid entitlements
PASS strict expiry including lost-response retry and cancelled renewal
PASS purchased expiry order, concurrent duplicate settlement and 100-dollar consumption cap
PASS all owner projections exclude an admin customer from other tenants
```

Red-green runs first observed missing grant/reserve/finish/reconcile/refund functions, then exposed and fixed quote/run-intent replay, expired retry, cancellation-renewal bypass and a PL/pgSQL alias ambiguity. Initial vanilla postgres lacked the existing schema's vector extension; switched to disposable pgvector, preserving the full chain rather than stripping migrations. Tests additionally reject customer/provider overspend, failed-path customer charges and missing receipt, and compare complete accounting plus profile snapshots on rejected grants/admission rollback. No external provider/network spend was used.
