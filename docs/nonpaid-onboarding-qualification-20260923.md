# Nonpaid onboarding qualification — 2026-09-23

## Scope and contract

Repairs the HIGH bootstrap and MEDIUM copy/billing findings from the read-only PR67 audit of `81cfcc5d3d56a9e4154af8c5b740778ae27300a7`, on integration base `e8eea1b585efe09d350a12a3cc38276d65f0e41b`. The legacy submission, trial grant, and Subjects library implementations still matched that audited snapshot before this repair. They are intentionally not widened or converted.

- `/commercial` empty state now opens `/commercial/setup`. The authenticated form collects brand identity, a manually managed channel, audience and goal. Both channel-management and brief-confirmation checkboxes start unchecked and are required.
- `commercial_brand_setup(jsonb)` derives the owner exclusively from `auth.uid()`, locks that owner's profile, validates bounded input and explicit booleans, and invokes the existing kernel subject/channel/immutable-brief helpers in one transaction. It never calls allowance, gift, wallet, audit, or queue writers.
- One immutable owner/request receipt records the setup. Same request + same payload recovers the same IDs; changed payload conflicts. The profile lock serializes first creation and retries. Another fresh key for an already configured owner/channel conflicts rather than silently replacing context. A removed entity makes the old receipt unavailable; it is not recreated. Admins receive no cross-tenant setup exception. Existing subject/account/owner IDs are not accepted from clients.
- The web action uses the session RPC, then reads back the exact owned subject, managed channel and confirmed brief before reporting success. It bumps the Subjects revision and revalidates Brands/Credits. The browser returns to `/commercial?channel=…` with that channel selected. Quote request and maximum acceptance remain separate commands; setup never auto-submits.
- Free welcome copy now says explicit Free enrollment after email verification. Trial landing describes gifted audits, not credits; all trial login/recovery links preserve `next=/commercial`. Existing trial grants are unchanged. Paid-disabled notice is unchanged.
- Commercial wallets display credit balance/reserved/available alongside metered dollar value and omit the unrelated experimental model-candidate catalog. Qualification and execution authority remain with the existing quote/runtime gates.

## Executed verification

- RED: full-chain disposable SQL failed because `commercial_brand_setup` did not exist. Action/component tests failed on absent setup implementation; existing component/copy tests reproduced the incorrect empty-state destination, implicit-signup wording, trial continuation and unconditional model catalog. The selected-channel test reproduced the wrong default. Browser testing caught the default 40px button; the setup CTA now uses the existing 44px large button.
- `python3 -B supabase/tests/commercial_brand_setup_test.py` — **PASS**. Applies every actual migration in a uniquely named, disposable loopback PostgreSQL/pgvector container and removes only that container. Exercises initial concurrent creation, replay, changed payload and duplicate-channel conflicts, input/boolean rejection, admin tenant separation, receipt RLS/ACL, mid-transaction brief failure rollback, missing-channel stale retry, existing trial gifts, fresh Free and exhausted legacy allowance.
- The same SQL test invokes `web/scripts/commercial-onboarding-probe.cjs`: actual production enrollment/setup/quote/submit actions against real migrated SQL. Two journeys passed: a fresh verified Free owner (no legacy Standard entitlement), and a Free owner whose total legacy allowance is zero. Explicit Free enrollment is replayed, setup and exact readback succeed, quotes queue nothing, rejected consent queues nothing, and accepted/retried consent produces exactly one new Standard audit. Legacy profile fields/gifts are unchanged.
- Test-only runtime catalog qualification is inserted only in the disposable test DB. The transport adapter substitutes framework/auth identity and routes Supabase operations to local psql; it does not stub the RPC results. The vanilla bootstrap needs an explicit fixture-only `GRANT SELECT ON audits TO authenticated` to model Supabase's original-table API grant; RLS remains active.
- Final `pnpm test` — **145 files / 1,074 tests passed**. Includes actual Chromium component/CSS checks at 390px and 1280px, explicit confirmation, continuation, no horizontal overflow, and 44px interactive heights. Browser actions are offline fixtures; SQL/action composition is independently real.
- Final `pnpm lint` — **0 errors, 11 existing warnings**. `pnpm build` and `pnpm typecheck` — **PASS**, including `/commercial/setup`. `git diff --check` — **PASS**.
- Updated experience-contract route inventory from 33 to 34 and regenerated its real scanner artifact; no new exceptions or remaining violations.

## Release boundary / remaining gates

No push, deployment, production query/mutation, Stripe call, trial-link creation, feature-flag change, worker change, entitlement migration, or infrastructure change was performed. No live model/provider or hosted GoTrue browser journey is claimed by these tests. Parent owns exact-head independent review, applying the additive migration before dependent web code, runtime qualification, final authenticated deployment smoke tests and release. Paid enablement stays deferred to the user.

Migration: `supabase/migrations/20260923154020_commercial_brand_setup.sql`.
Reproduce SQL/action checks from repo root; reproduce web checks from `web/`. Do not reset shared Supabase to run them. No local implementation blocker remains.
