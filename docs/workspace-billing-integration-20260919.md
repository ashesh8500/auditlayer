# Workspace billing/wallet integration — 2026-09-19

Owner lane: web billing/pricing/checkout-intent/stripe webhook + wallet & model-availability surfaces,
`actions/intelligence.ts` (intake, credit branch only), `actions/refinements.ts` (credit branch, legacy behaviour unchanged),
the existing `20260919220000_workspace_credit_ledger.sql` migration and its tests.

## Canonical policy resolution (required decision, resolved)

Canonical policy identifier is exactly **`P-01.v1`** (`contracts/workspace-v1/policy.p01.v1.json`
and every generated projection). This lane therefore changed the **unshipped** credit migration and its
tests from `p01.v1` to `P-01.v1`.

- `workspace_credit_cycles.policy_version` check and both `workspace_credit_grant` comparisons now require `P-01.v1`.
- The adapter rejects any other spelling; there is **no runtime case normalization or alias acceptance**.
- Test evidence: `workspace_credit_grant` with `policy_version: "p01.v1"` raises `payment_authority_denied`,
  while the canonical value grants.
- The sibling ledger handoff still says `p01.v1`; that sentence is superseded by this section (its handoff was
  not edited to avoid racing a concurrent writer).

## What is implemented and verified

### SQL (new migration `20260919222023_workspace_billing_commands.sql`, created with `supabase migration new`)

1. `workspace_credit_wallet()` — owner-session (`security invoker`) wallet projection built from real cycles,
   lots, ledger entries, held allocations and reservations. Compliance: `Workspace`/`WalletLot` DTO with
   `owner_id`, `P-01.v1` policy, USD `Money`, balance/reserved/consumed/purchased/upstream exposure and
   per-lot `granted/balance/reserved/consumed/granted_at/expires_at/stripe_source_id`. Expired lots are
   excluded; anonymous callers are denied; service role cannot execute it.
2. `workspace_credit_payment_command(p)` / `workspace_credit_payment_confirm(p)` — a **server-authored**
   durable payment command (owner, provider payment id, customer, subscription, exact period, kind,
   amount/paid, `price_id`, `terms_version`, `P-01.v1`) that can only be confirmed by provider facts
   retrieved server-side. Identical replay returns the original lot; a different payment id for the same
   command or a different paid amount fails; the grant itself is the existing exactly-once
   `workspace_credit_grant`. No public opt-in RPC is exposed — publishing a customer checkout requires
   approved terms and a distinct Stripe workspace.
3. `workspace_credit_provider_action(p)` — refund/cancellation **provider execution records** bound to the
   frozen liability (refund freeze row / subscription cycle), unique `idempotency_key`, exactly one
   pending→terminal reconciliation step, partial provider refund refused (`partial_provider_refund`),
   failed provider refund leaves the frozen amount unspendable, and anonymous/authenticated callers cannot execute it.

### Web

| File | Role |
|---|---|
| `web/src/lib/workspace/catalog.ts` | canonical `ModelOption` availability (both candidates `unavailable`, no rate card, no tools) + enrollment blockers |
| `web/src/lib/workspace/payments.ts` | provider-fact reconciliation: `payment_intent.succeeded` (top-up) and `invoice.paid` (included allowance) |
| `web/src/lib/workspace/payment-server.ts` | service-role composition + post-write verification of the confirmed lot |
| `web/src/lib/workspace/lifecycle.ts` / `lifecycle-server.ts` | refund (freeze → provider refund → record) and cancellation (credit cancel → provider cancel → record) with stable idempotency keys |
| `web/src/lib/actions/workspace-billing.ts` | owner-gated pilot cancellation; owner/subscription resolved from session + durable cycle, never from the browser |
| `web/src/lib/workspace/intake.ts` | fail-closed guard for explicit `workspaceIntent` |
| `web/src/app/api/resources/wallet/route.ts` | owner-scoped, `private, no-store` wallet resource; 401 before SQL, 503 (never a fake wallet) on failure |
| `web/src/lib/workspace/billing-view.tsx` | wallet + offer + model-availability UI on the retained owner cache (`WorkspaceResources`/`useWorkspaceQuery`) |
| `web/src/app/(app)/settings/billing/page.tsx` | owner-only surface mounting the above |
| `web/src/app/pricing/page.tsx` | honest blocked new-offer panel; Starter/Pro/gift-login intent preserved unchanged |
| `web/src/app/api/webhooks/stripe/route.ts` | verified events routed to the workspace payment adapter **before** the legacy switch; pending ambiguity → 503 for provider retry; legacy subscription reconciliation untouched |
| `web/src/lib/actions/intelligence.ts`, `actions/refinements.ts` | explicit workspace consent refuses with a bounded message instead of falling through to count-based legacy admission |

### Legacy preservation (unchanged by design)

- Starter/Pro/enterprise/gift/trial/report entitlements and `reconcile_stripe_subscription` are untouched;
  no report count becomes credit, no `profiles` column is written by this lane.
- The webhook still reconciles subscription events exactly as before; `invoice.paid`/`payment_intent.succeeded`
  only mint credit when a durable server command exists (otherwise `null` → legacy behaviour, or `pending`).
- An account without a workspace contract gets `wallet: null` and explicit legacy reassurance copy.

## Executable paths and commands

```sh
# real disposable PostgreSQL 16/pgvector container, full preceding migration chain, no shared Supabase
cd /home/asheshkaji/projects/alm-report-mobile-20260919
python supabase/tests/workspace_credit_ledger_test.py

# offline web/provider/UI tests (no provider calls, no secrets, no builds)
cd web
pnpm exec vitest run src/lib/workspace src/lib/actions/workspace-billing.test.ts \
  src/lib/actions/refinements.test.ts src/lib/actions/intelligence-owner-scope.behavior.test.ts \
  src/app/api/webhooks src/app/pricing/workspace.test.tsx
```

## Observed results

`python supabase/tests/workspace_credit_ledger_test.py` — exit 0:

```text
PASS paid grant duplicate/lost-response preserves legacy profile
PASS atomic reserve and exact intent retry
PASS durable paid command validates bound provider facts and exactly-once grant
PASS successful settlement exactly once
PASS last-balance race, overspend rollback, released no resurrection, pending exposure
PASS failed actual cost reconciliation remains customer free
PASS stale Stripe, tenant/admin boundary, immutable ledger and JSON-safe money
PASS topup cap, included first, refund holds and cancellation preserve paid entitlements
PASS provider refund/cancellation execution stays bound, idempotent and frozen on failure
PASS strict expiry including lost-response retry and cancelled renewal
PASS purchased expiry order, concurrent duplicate settlement and 100-dollar consumption cap
PASS all owner projections exclude an admin customer from other tenants
```

`pnpm exec vitest run src` — 1030 passed, 2 failed; **both failures are the experience-contract lane's
stale artifact, not this lane's code** (see coordination items below). `pnpm exec tsc -p tsconfig.json --noEmit`
reports no errors. No new `any` and no `as any` remain in the files this lane touched.

RED→GREEN observed for every unit: missing `workspace_credit_wallet()`/`workspace_credit_payment_*`/
`workspace_credit_provider_action()` functions; a wrong `policy_version`; a pending→succeeded transition that
dropped the frozen amount; `pending` wrongly recorded as `succeeded`; a random instead of durable idempotency key
(mutation-checked by reverting the key and re-running the offline suite).

## Boundaries respected

Only the paths listed above were written. No shared schema/generated projections, no `web/src/lib/supabase/types.ts`,
no dependency/lockfile, no worker, no reader/subject-home components, no workflow files, no builds, no servers,
no environment or production/provider/Supabase connections, no secrets, no commits. The new migration was created
with the Supabase CLI, and the sibling workflow/execution migrations were not touched.

## Coordination items for the parent (real blockers, not silent gaps)

1. **Atomic customer admission is missing — the one real quote→run seam is not wired.** The execution lane
   publishes *worker* `workspace_execution_admit/dispatch/finish`, which requires an already-created audit and
   intelligence run plus a claimed worker lease; it is explicitly not a customer create-audit API. To complete
   quote → atomic reservation + run → receipt, one of these is needed: (a) an execution-lane
   `workspace_credit_submit(p)` composing existing batch/audit creation + canonical server-persisted quote/intent
   + `workspace_credit_reserve` in one transaction, letting worker admission adopt that reservation instead of
   reserving again; or (b) parent authorization for this lane to add that SQL. Until then explicit credit intent
   fails closed and legacy owed reports keep running (verified).
2. **Policy semantics for a period-mismatched included renewal.** `workspace_credit_grant` requires the profile's
   *current* billing interval, so a late/ambiguous included invoice for an expired cycle is refused rather than
   granted (the ledger lane documented this). The webhook therefore records it as `pending_reconciliation`
   (503 → provider retry). A deliberate reconciliation command for late included cycles still needs an owner.
3. **Experience-contract artifact is stale for two new pages.** `web/artifacts/experience-contract.json` pins
   30 route pages and `experience-contract.test.ts` asserts that number plus zero violations. Reality is 32
   (`src/app/(app)/settings/billing/page.tsx` from this lane, `src/app/(app)/workflows/page.tsx` from the workflow
   lane), and the 8 remaining violations are hardcoded hexes/raw buttons in `components/immersive-report.tsx` and
   `components/workflows/*`. The contract owner should regenerate the artifact and reconcile the pins; this lane
   deliberately did not edit another lane's generated projection or its test pins.
4. **Configuration still required before enabling anything:** Stripe workspace + `price_id`s for the access plan
   and top-ups, the approved-terms version string, and per-provider credentials/qualification evidence. Until then
   `rateCards` stays empty, both catalog candidates stay `unavailable`, and no quote can be minted.
5. **Provider-shape caveat.** Included-allowance confirmation reads `invoice.payments` (retrieved with
   `expand: ["payments"]`) and the mapped subscription item window. If the live API pin differs, SQL/adapter
   mismatch fails closed to `pending_reconciliation` rather than granting — verify against the pinned API version
   during release review.
