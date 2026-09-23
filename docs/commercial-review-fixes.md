# Commercial review corrections (CR-1 / CR-2 / CR-3)

Base: `6cc2de8`. Scope: web entrypoints, one **new additive** SQL migration and its tests. No worker changes, historical migration edits, push, deployment, live Stripe requests or model calls. The existing `20260920201152` runtime fence is retained unchanged. Top-ups remain closed pending terms; monthly enrollment's existing release flags are unchanged.

## Corrections

- **CR-1:** the production quote action accepts valid ISO timestamp offsets (`z.iso.datetime({offset:true})`). The regression creates a real qualified quote in disposable PostgreSQL after the complete migration chain, then passes its unmodified `to_jsonb` RPC response (fractional seconds and `+00:00`) through the actual server action. This is not a UTC-Z fixture repair.
- **CR-2:** `commercial_subscription_apply` returns `current_authority` only for an otherwise stale `invoice.paid` whose completed checkout and locked active profile exactly match customer, subscription, commercial plan and both period bounds. It does not rewrite lifecycle authority or create an applied receipt. The webhook accepts this bounded outcome, not arbitrary `stale`. Existing payment-command/confirmation code independently verifies retrieved invoice and payment-intent facts and exact current grant authority. Canceled, retired, old-period, conflicting and wrong-identity events remain denied.
- **CR-3:** Starter/Pro and Brand/Studio now reserve the **same** owner-wide pending row before chargeable session creation. Legacy actions reuse bound open sessions; unbound retries use `checkout:legacy:<intent-id>` and the existing 23-hour ambiguity fence. New legacy sessions carry a checkout-intent binding; signed completion atomically reconciles authority and completes that reservation, and signed expiry releases it. The reducer also rejects unsupported replacement of active commercial authority, including old legacy sessions without the new metadata. Reports now link to current enrollment rather than advertise new legacy purchases; existing billing management stays visible. Legacy renewal, cancellation and gifts are not migrated or canceled.

## TDD evidence

Observed failures before the corresponding implementation:

1. Real SQL quote → production action returned `ok:false` / “Quote unavailable.”
2. Lexically lower same-second invoice → signed production POST returned **503**, with only `commercial_subscription_apply` called.
3. Direct legacy completed checkout after Brand → `applied:true`, replacing commercial authority.
4. Actual legacy server actions ignored denied admission and returned a hosted checkout redirect; new reservation test failed with `invalid_plan`.
5. Signed legacy completion left its shared pending reservation open.
6. Rendered active-commercial reports page still displayed Starter/Pro purchase forms.

All now pass. The new `supabase/tests/commercial_review_fixes_test.py` owns a uniquely named loopback-only Docker PostgreSQL container and removes it in `finally`. `web/scripts/commercial-review-probe.cjs` bundles the production actions/POST handler; replaces only auth, SQL transport and provider transport; generates/verifies real local Stripe signatures; and calls the actual migrated service-role SQL functions.

Coverage includes both lexical orderings, earlier-created invoices, delayed payment after a later lifecycle update, before-checkout failure then successful retry, exact duplicate lot count, renewal, cancellation, retired authority, old periods, equal-time conflict, incorrect invoice/payment authority and tampered signatures. It also tests bidirectional pending offer conflicts, concurrent four-offer SQL admission, and **concurrent actual Brand/Starter server actions backed by real SQL: exactly one provider-session creation**. Signed legacy completion/expiry and legacy renewal/cancellation are exercised. Service-only RPC ACLs and unchanged profile snapshots on rejected commands are asserted.

## Verification

Executed locally:

```sh
python3 supabase/tests/commercial_review_fixes_test.py
python3 supabase/tests/commercial_composition_test.py
python3 supabase/tests/commercial_release_test.py
cd web
pnpm test --reporter=dot
./node_modules/.bin/tsc --noEmit --incremental false
./node_modules/.bin/eslint src scripts/commercial-review-probe.cjs
pnpm build
```

- New full-chain regression tracer, existing composition and release SQL suites: **passed**.
- Web suite: **141 files / 1,055 tests passed**.
- TypeScript and production build: **passed**. Build ran with Stripe/Supabase credentials explicitly empty.
- ESLint: **zero errors**, 11 pre-existing warnings in untouched files.
- `git diff --check`: passed.

An initial unscoped `vitest run` incorrectly discovered Playwright `e2e/*.spec.ts` and failed test-runner collection. The canonical package command (`vitest run src`) above passes. No e2e/live-provider qualification is claimed. Independent final review and deployment remain parent-owned.

## Rollout / rollback

Apply `supabase/migrations/20260920205634_commercial_review_fixes.sql` before the dependent web code. Keep all old migrations, including the runtime fence. On application rollback, retain the schema guards and financial records; close enrollment flags rather than delete reservations, receipts or paid lots. A browser cancel redirect never releases capacity. Ambiguous unbound sessions older than 23 hours require provider reconciliation; do not invent a fresh idempotency key or cancel a contract automatically. Existing pre-release hosted sessions should be reconciled operationally, not treated as permission to replace active Brand/Studio authority.
