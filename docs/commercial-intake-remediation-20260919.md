# Commercial intake remediation — 2026-09-19

## Delivered, not deployed

- **One allowance authority:** `audit_allowance(owner)` computes effective trial/admin plan, allowed report types, usage, gifts, remaining access and exact Stripe window. Intake, batch precheck and Reports DTO/display consume it. Locked submission uses the same function, while rolling retry recovery remains before mutable entitlement/channel checks. Failed allowance reads produce 503, never zero usage or an empty-success library.
- **Exact monthly renewal:** Stripe snapshots resolve the unique mapped item and carry both actual period bounds through reducer, digest, receipt equality and profile projection. Item and legacy subscription bounds are never spliced. Paid usage is `[start,end)`; missing/expired/malformed windows do not receive guessed calendar/30-day allowances. Free/manual/trial lifetime rules and gifts-first semantics remain unchanged. Gift-created audit rows still count toward plan usage, deliberately preserving existing accounting rather than inventing additive credits.
- **Intake continuity:** owner-checked `account_id` resolves a unique subject/channel or gives a visible warning. Report selector uses DB-effective types, including trial grants and existing Enterprise eligibility. Website host/path is canonicalized directly from the raw URL, never from a social handle. The existing canonical helper intentionally drops query/fragment and normalizes host/scheme; worker SSRF protections remain untouched. Existing channel identity is resolved from owned rows, with reconnect/observed checks shared across channel, batch and server preflight.
- **Recovery:** rejected submit/context promises clear pending state and offer retry. Exhausted intake stays reachable for a lost-response retry, without the old `billing=unconfigured` lie. Reconnect carries safe subject/channel return context and explicitly warns that unsaved notes/batch choices will be lost; no persistent private draft store was added. Success navigates to `/subjects/{subjectId}?batch={batchId}`, not only the first audit.
- **Mutation invalidation:** new/recovered batch submissions bump Reports + Subjects; brief save/proposal resolution and new/recovered recommendation decisions bump Subjects. Proposal resolution owner-checks and reads back the persisted status, revalidates subject/intake paths, and returns `{ok:true, mode:'live', subjectId, refresh:true}` for parent refresh.
- **Customer truth:** billing return says confirmation is pending rather than claiming activation from a query string. Removed fake proportional run progress and customer `prompt_version`/Method metadata from the Reports query/DTO/render; retained report version/date. Retry label maximum now matches the worker's one retry.
- Retired unused production `actions/audits.ts` and `rpcSubmitAuditBatch`. Kept tested batch utility exports and compatibility SQL/history deliberately.

## Exact worker contract

`public.audits.brief_version_id uuid NULL REFERENCES public.living_brief_versions(id)` is additive. Existing-subject audit JSON carries `brief_version_id`; the transaction validates it belongs to the locked owned subject. Draft-subject submission pins the initial version created inside that same transaction. SQL assembles `audits.context` from the exact pinned authorized brief JSON plus change notes before queue visibility.

Worker provenance must consume that exact audit ID. Historical null means **no proven brief**, never “latest at completion.” A newer brief created during generation cannot replace the submitted version or its context. This lane did not edit worker files; the parent/sibling worker lane owns consumption. Parent reports W07 owner-checked subject/sibling audit navigation is complete and owns subject-home refresh integration.

## Required staged rollout — do not bulk-push blindly

1. `20260919204027_commercial_intake_allowance.sql`: adds period-start columns, replaces reconciliation with the start-aware signature, and adds the narrowly scoped `backfill_stripe_period_start` RPC.
2. Review/run `scripts/reconcile-existing-stripe-windows.py` **read-only first** with protected `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`. No provider request was made by this lane. Default execution reads only already-linked active/trialing Starter/Pro subscribers with missing starts. It checks actual Stripe identity, plan/price, one monthly item and exact stored end. `--apply` explicitly permits the guarded RPC and exact target readback; changed ends/status/identity require normal provider reconciliation, not a fabricated event or guessed period. Re-run until review cases are resolved.
3. `20260919204116_commercial_allowance_brief_gate.sql`: **first statement refuses activation** if any existing actual active/trialing Starter/Pro subscriber lacks valid recorded bounds. Only then replaces locked allowance/submission and adds brief pinning.
4. Activate the integrated web/worker release only with both DB stages ready. The old no-start reconciliation signature is removed intentionally; there is no compatibility overload silently discarding start. Plan a controlled webhook-only intermediate rollout or bounded webhook retry window between stage 1 and the integrated release. New intake/DTO code requires stage 2. Do not deploy the new full web app alone while its allowance RPC is absent.

No production DDL, live backfill, Stripe subscription/price query, inference, full shared build, commit, deployment or provider change occurred.

## Verification

- **26 focused Vitest files / 234 tests passed.** Includes mounted Pro→Extended submission, trial-only selector entries, transport rejection/retry, context reload retry, reconnect eligibility, owner account continuity, exact website action→RPC payload, quota-read failure, honest billing copy, customer telemetry removal, proposal readback/owner/cache behavior, reducer/webhook period propagation and existing intelligence regression tests.
- `pnpm exec tsc --noEmit --incremental false`: PASS.
- Scoped ESLint across touched production web files: PASS.
- `python3 scripts/check-migrations.py`: PASS, **70 unique migrations** in the observed integrated working tree.
- `git diff --check`: PASS.
- **Real PostgreSQL 16:** own disposable `alm-commercial-test` container, loopback port **55439**; no other DB/container reset. The container was removed after verification and absence was checked. Installed pgvector only in this container, then replayed all 70 migrations in canonical order in a fresh `commercial_canonical` database. All passed. Generated Supabase types exactly match this real schema (only final blank-line normalization).
- `supabase/tests/commercial_intake_sql_test.py` passed real SQL assertions for non-calendar start/end boundaries, prior-period exclusion, malformed/missing/future-window denial, active/expired trial with zero/nonzero gifts, free lifetime/manual/admin behavior, concurrent final-slot race, atomic batch rollback, retry after final slot, initial brief/context pin, later-brief immutability, foreign-brief rollback, duplicate/stale/equal-time Stripe cases, start-sensitive conflicts/renewal, manual precedence, scoped backfill readback, owner read denial, rollout prerequisite and RPC grants.
- The initial vanilla-PG trial lacked pgvector; it was installed and **fresh canonical replay** replaced that partial-order experiment as final evidence. Supabase type generation emitted upstream CLI deprecation/listener warnings but exited successfully; no schema error.

Reproduce web verification from `web/`:

```sh
pnpm exec vitest run src/lib/intelligence src/lib/actions/intelligence-owner-scope.behavior.test.ts src/lib/actions/intelligence-proposal.behavior.test.ts src/lib/actions/intelligence-ownership.test.ts src/lib/stripe-reconciliation.test.ts src/lib/stripe-webhook.test.ts src/lib/commercial-domain.test.ts src/components/intelligence/intelligence-wizard.test.tsx 'src/app/(app)/audits/new' 'src/app/(app)/dashboard/page.behavior.test.tsx'
pnpm exec tsc --noEmit --incremental false
```

SQL bootstrap is `supabase/tests/commercial-local-bootstrap.sql` for a fresh **disposable** vanilla PostgreSQL container only. Apply the actual migration chain, then:

```sh
python3 supabase/tests/commercial_intake_sql_test.py postgresql://postgres@127.0.0.1:55439/commercial_canonical
```

## Parent integration / remaining gates

- Review staged billing rollout/backfill above before applying any new migration. Actual existing subscriber reconciliation and real Stripe monthly price facts remain unverified here by design.
- Parent owns integrated build, authenticated browser/cookie-revision verification, worker consumption, subject-home refresh, audit-detail links and release. Mounted tests are not a live authenticated browser claim; session revision cookies do not push another principal's open tab.
- **Static lifecycle fixture integration:** production-reference census found no consumer of the retired `actions/audits.ts`, but `scripts/fixtures/alm-lifecycle/manifest.v1.json` still names it as `audits_action` and the historical generated artifact repeats it. Parent/operations lane should retire or replace that obsolete fixture consumer when regenerating lifecycle evidence; this lane did not edit concurrently owned release scripts/artifacts. Historical docs mentioning the old action are not production callers.
- Generated `supabase/types.ts` includes the concurrent admin/share/refinement migrations present during the canonical replay. Regenerate again if sibling schema signatures subsequently change.

## Files owned by this change

- Web production: `lib/domain.ts`, new `lib/allowance.ts`, `lib/actions/intelligence.ts`, removal of `lib/actions/audits.ts`, `lib/stripe-reconciliation.ts`, Stripe webhook route, `lib/intelligence/{api,batch,types}.ts`, `(app)/audits/new/page.tsx`, `components/intelligence/intelligence-wizard.tsx`, `components/reports-library.tsx`, Reports resource route, `lib/resources/dto.ts`, generated `lib/supabase/types.ts`.
- New migrations: the two explicitly named stages above.
- New operational/test artifacts: `scripts/reconcile-existing-stripe-windows.py`, `supabase/tests/commercial-local-bootstrap.sql`, `supabase/tests/commercial_intake_sql_test.py`, wizard mounted tests, account continuity tests, commercial-domain tests, webhook tests and proposal-action behavior tests. Updated existing allowance/intelligence/Stripe/dashboard/API test doubles and assertions to the canonical authority.
- This handoff document. All unrelated dirty work and excluded ownership surfaces were preserved.
