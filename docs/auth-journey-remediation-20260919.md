# Auth and orphan-journey remediation — 2026-09-19

## Delivered

- **W08:** All sign-in methods converge on an explicit authenticated trial-claim screen. A signed-in visitor no longer loses `trial`; password and preview login preserve it; successful Google/token-hash magic-link callbacks preserve it alongside `next`. Authentication alone never displays a redemption success. The claim is a server-action POST, not a mutation during GET/prefetch. The form shows confirmed success, a same-offer replay, or an actionable failure independently from sign-in, with retry and continue-without-claiming choices.
- `lib/auth/claim-trial.ts` verifies the user server-side, uses only canonical `redeem_trial_link` for grants, and verifies same-offer ownership before treating a repeated claim as already claimed. It rechecks ownership after an RPC race, does not grant credits in application code, does not mistake a different existing trial for success, and retains invite context on failure. Exhausted/expired public invite pages retain a sign-in/check path for prior claimants. No SQL or commercial-action changes.
- **W09–W10:** One shared relative-path normalizer now serves page, actions, callback, and middleware. Backslashes, controls (including encoded controls/backslashes), protocol-relative and absolute URLs are rejected. Protected `pathname + search` is encoded inside `next`, not left at login's top level. OAuth, callback, and preview errors preserve safe destination/trial context. Existing fresh-PKCE isolation, verifier preservation, and proxy registration are untouched.
- Successful password/preview authentication and trial claims bump reports/subjects resource revisions. Successful callback responses carry fresh revision cookies alongside the new session cookies. Trial cookies are HttpOnly and are cleared only after confirmed claim/replay.
- **W16/W20:** Accounts list/detail and AI grants distinguish query errors from empty state and offer a real refresh control. Missing owner-scoped accounts still 404; operational errors do not. Non-Instagram detail pages do not query Instagram connection health or display Instagram reconnect guidance. Instagram reconnect now carries the owned connection ID and account return path to the existing guarded OAuth start route; prefetch is disabled. Public-data versus connect versus reconnect copy remains distinct.
- **AI connector copy:** Replaced the decorative icon with an actual awaited clipboard control, live success/failure status, and a selectable wrapping address fallback.
- **W19:** Terminal/review, authorization-denied, and delayed progress has explicit Check again / Sign in again / Back to Reports recovery. Check again performs only a progress GET and can observe ready after operator intervention; it never approves, requeues, or buys a run. Existing bounded cadence, backoff, hidden/offline aborts, late-result fences, and one-time ready invalidation remain tested. Removed unsupported claims of email delivery, founder notification, continued processing, and intact evidence.
- **W21:** No header production edit was needed: the current `isPreviewTesterEmail` already calls `isPreviewLoginAllowed`. Tests exercise the real environment predicate and prove matching production identities do not receive Tester navigation while enabled preview identities do. Existing Brand wrapper preserved.
- **W22:** Rechecked imports/symbol consumers and concurrent diffs, then deleted only unused `components/live-timeline.tsx`, `app/admin/cost-dashboard.tsx`, `components/whimsical-shapes.tsx`, and `components/ui/led.tsx`. Removed the three obsolete live-timeline experience-contract exceptions and regenerated the scanner artifact. Public trial/share/MCP/OAuth routes, services, and tested shared primitives remain. Admin user-forms belong to the admin lane and were not edited.

## Verification

Regression tests were introduced and executed failing before the corresponding fixes (redirect helper/new module availability, callback/context loss, password trial loss, signed-in login redirect, account/AI error masking, clipboard control, terminal recovery, trial replay entry point, and dead-file retirement).

Final focused command covered 13 files: redirect, canonical claim, password/action recovery, login page, callback/PKCE, trial page, account/AI journeys, connector clipboard, bounded progress recovery, header environment gating, dead UI/protocol preservation, Supabase fresh-session behavior, and pricing continuity.

**67/67 tests passed**, JSON evidence: `/tmp/alm-auth-journey-tests.json`.

`pnpm exec tsc --noEmit`: **passed** after concurrent lanes' latest edits.

Targeted ESLint on the new auth helpers, login action/page/claim form, callback, middleware, connector/error controls, and wait state: **passed**.

No live sign-ins, provider writes, paid requests, build, commit, or deploy was performed. Tests use mocked auth/database/provider responses; they do not prove hosted provider configuration, live RPC deployment, email delivery, or pixel-level browser layout.

## Integration findings / handoff

- A full `pnpm exec vitest run src` during ongoing parallel edits returned **863 passed / 19 failed, 92 passed files / 9 failed files**. Those failures were in the concurrently edited experience contract, Stripe route fixtures, dashboard resource fixtures, report share cache expectation, subject proposal tests, intake allowance mock, generated Instagram lifecycle type assertion, intelligence batch API shape, and intelligence action owner-scope fixtures. This is a timestamped integration observation, not a claim these remain unfixed. Full output: `/home/asheshkaji/.hermes/cache/terminal-output/out-1789851228-1089944-d190.log`.
- The final standalone experience-contract run still has **2 failing assertions**: unregistered current visual findings and obsolete `target-share-report-view-reset`. Scanner output points outside this lane (brand hex colors, delegated route headers, report-viewer/resource-status targets, workspace-resource focus). No broad exemptions were added to conceal them. Parent should reconcile these after all component edits and regenerate `web/artifacts/experience-contract.json` again if needed.
- Parent explicitly owns SubjectHome/proposal recovery, audit-detail projection/missing-artifact controls, and progress endpoint state; none of those files were edited here. Existing cache/brand/resource-provider work was preserved.
- The trial flow intentionally adds an explicit claim click after authentication. This prevents GET-prefetch mutations and gives users a truthful result; successful authentication itself no longer silently consumes an invite.

## Changed surface inventory

Auth: `app/login/{actions.ts,page.tsx,login-form.tsx,password-login-form.tsx,trial-claim-form.tsx}`, `app/auth/callback/route.ts`, `lib/auth/{redirects.ts,claim-trial.ts}`, `lib/supabase/middleware.ts`, and `app/try/[token]/page.tsx`.

Journeys: `app/(app)/accounts/{page.tsx,[id]/page.tsx}`, `app/(app)/settings/ai-connections/page.tsx`, `components/{journey-load-error.tsx,connector-address.tsx}`, and `components/intelligence/customer-wait-state.tsx`.

Verification: corresponding regression tests plus `components/app-header.test.tsx` and `lib/dead-ui.test.ts`; obsolete exception cleanup in `lib/experience-contract.ts` and regenerated `artifacts/experience-contract.json`. Four unused UI files removed as listed above.
