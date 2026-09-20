# `web/src/lib/workspace` — billing, wallet and model-quote surfaces

Leaf policy for the workspace (credit) contract integration. Canonical schema lives in
`contracts/workspace-v1` (generated projections in `@/lib/workspace-contracts`); SQL remains
the authority for money and state transitions.

## Availability policy

- **Policy id is exactly `P-01.v1`.** No runtime case normalization: `p01.v1` is rejected by SQL.
- **Enrollment is unavailable.** `enrollment.available === false` with named blockers (retention,
  credit expiry, refund/consumer terms, workspace payment configuration, model qualification).
  No price, rate or model is invented to make the surface look complete.
- **Model candidates stay unqualified.** `modelCatalog` publishes canonical `ModelOption`s as
  `unavailable` with a reason, no rate card and no tools. A dropdown here would be a fake control.
- **Legacy rights are preserved.** Existing Starter/Pro/gift/trial/report entitlements keep their
  contract; no report count is converted into credit. Reads of a missing workspace contract return
  `wallet: null` and the UI says so.

## Server seams

| Seam | Module | Notes |
|---|---|---|
| Wallet projection | SQL `workspace_credit_wallet()` → `api/resources/wallet/route.ts` | `security invoker`, session `auth.uid()` only; no owner argument from the browser |
| Paid grant/topup | `payments.ts` (+ `payment-server.ts`) | Binds a durable SQL `workspace_credit_payment_commands` row to retrieved provider facts; PI only for purchases, invoice+period for the included allowance |
| Refund/cancel | `lifecycle.ts` (+ `lifecycle-server.ts`, `actions/workspace-billing.ts`) | Freeze first, then provider call with `workspace-refund:<freeze-id>` / `workspace-cancel:<subscription-id>`, then record; ambiguity is `pending` |
| Credit admission | ledger lane SQL only | `lifecycle.ts` never reserves; `actions/intelligence.ts` / `actions/refinements.ts` / the wizard refuse explicit `workspaceIntent` until an atomic customer admission RPC exists |

### Idempotency and ambiguity rules

- Provider idempotency keys are derived from durable rows (freeze id, subscription id), never random.
- A lost or ambiguous provider response is recorded `pending` and returned as
  `pending_reconciliation`; it is never reported as success and never blind-retried.
- A record-write failure after a successful provider call is still reported as pending, because
  money may already have moved.
- Recording a provider action never unfreezes credit; a partial provider refund is refused for
  manual reconciliation.

## Not implemented here (blockers, not silent gaps)

1. No atomic **customer** quote → reserve → queue seam. The execution lane publishes a *worker*
   admission RPC only, so credit admission fails closed and legacy owed work runs on legacy rights.
2. No live rates/model qualification, so no quote can be minted; `rateCards` stays empty.
3. The pilot cancellation action requires an existing workspace cycle; enrollment blockers above
   mean it is not reachable in production yet.

## Verification

```sh
python supabase/tests/workspace_credit_ledger_test.py                # real disposable PostgreSQL
cd web && pnpm exec vitest run src/lib/workspace src/lib/actions/workspace-billing.test.ts src/app/api/webhooks
```
