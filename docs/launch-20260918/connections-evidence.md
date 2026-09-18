# Connections lane evidence

## Implementation (in progress at this checkpoint)

- `/settings/connections` lists owner-filtered Instagram connections (including stale ones), exact count + 24-row pages, owner-checked optional target, global feedback, Add/Reconnect/Disconnect and separate AI app grants link. Existing panels/buttons/tokens retained.
- Reports no longer selects a singleton Instagram connection. Reports and New Audit usage explicitly owner-filter even admin sessions. Reports paginates/filter server-side with exact counts; usage is head/count rather than capped row downloads.
- OAuth start stores owner/nonce/expiry/safe return path/optional owned connection + canonical IG identity in HttpOnly state. Callback defaults to Connections; errors always recover there; expiry/user mismatch/cancellation fail closed; targeted callback rechecks ownership and canonical identity before existing **nine-argument** persistence RPC. Same identity rename is permitted; different identity is rejected. Meta bigint identity reads use `ig_user_id::text` to avoid JS integer rounding.
- Cache invalidation includes Connections/Subjects/Accounts/Reports. Disconnect action returns visible success/failure feedback; **history preservation depends on DB lane migration**.
- Header, Accounts, wizard, privacy/support/deletion navigation consolidated. Subjects and audit detail owned by other lanes, not edited here.
- Added authenticated preview Playwright journey tests at 1280px/390px + recoverable invalid callback. Fixed existing preview login test cookie isolation by using `page.request`, not standalone `request` fixture.

## RED → GREEN evidence observed

Real route/component execution tests failed before their implementation and were rerun green: structured state, targeted start ownership, callback expiry/cancel/default destination, callback targeted identity revalidation, active-card feedback and all-state actions, paginated Connections + off-page owner-checked target, owner-scoped Reports, owner-scoped usage, account navigation, disconnect recovery/invalidation, callback cache invalidation. Trust/navigation static tests supplement these; they are not the state coverage.

## Checkpoint verification

- `pnpm typecheck`: passed at 18:38 UTC.
- `pnpm lint`: 0 errors, 13 pre-existing warnings in unrelated files.
- Full suite checkpoint: 66/68 files, 688/692 tests passed. Projection test expected old dashboard connection query: updated to new Connections surface and now passes. Three **experience-contract scanner** failures remain for integration owner: hardcoded route count 28 vs now 29; two design scanner violations; stale `state-no-route-error-files` exception due concurrent error page addition. Please reconcile scanner/artifact centrally after all lanes finish; I have not edited its registry/artifact.
- Signed-in Playwright command ran: **4 skipped**, no PREVIEW_TEST_LOGIN_SECRET in environment and no `.env*` files in this worktree. These are NOT verified journeys; release owner should run against configured preview/production-mode local app.
- No Meta consent, live credential changes, generated reports, commits or deployment performed.

## Coordination / release caveats

- DB migration must precede shipping disconnect-preservation copy and callback bridge behavior. RPC signature remains nine arguments; optional returned subject_id is not required for default Connections redirect.
- Targeted callback rechecks after token exchange and before RPC. Existing 9-argument RPC cannot accept connection_id; tiny concurrent disconnect/write TOCTOU window remains unless DB lane adds a compatible transaction mechanism. Owner remains explicit in RPC and same-identity check; no foreign owner write is requested.
- Browser QA (signed-in desktop/mobile), actual Meta approval/insights, DB runtime isolation and full end-to-end history preservation remain release gates, not claims from these unit tests.

## Final verification / handoff

- **Targeted: 13 files / 65 tests passed** (`vitest run` across start/callback, cards, Connections page, Reports page, usage, navigation, disconnect, projection/trust and OAuth helpers), final run 18:45 UTC.
- **Full web suite: 67 files passed / 1 failed; 698 tests passed / 3 failed** (701 tests). Remaining failures are all `src/lib/experience-contract.test.ts`: route/state inventory counts and subject lane state registry. Current scanner violations are `subjects/loading.tsx` not consuming AlmSkeleton/ExperienceLoading and `subjects/error.tsx` not registered. Connections' added focus marker is now clean. Integration owner must update the route/state inventory, registry and committed artifact coherently; no feature behavior test failed.
- **Final `pnpm build` passed** after the last source edits, with `/settings/connections` in the production route table. Log: `/tmp/alm-connections-build-final.log`.
- **Final `pnpm typecheck` and `git diff --check` passed**. Lint: 0 errors, 13 unrelated existing warnings (see `/tmp/alm-connections-lint.log`).
- **Playwright: 4 skipped**, explicitly because this lane has no configured preview test secret. Tests are implemented, but no signed-in or live Meta result is claimed.
- Production source is complete for this lane. No commit/deploy or edits to another lane's source files.

### Files created

- `web/src/app/(app)/settings/connections/page.tsx` and `page.behavior.test.tsx`
- `web/src/app/(app)/dashboard/page.behavior.test.tsx`
- `web/src/app/(app)/audits/new/page.usage.test.tsx`
- `web/src/components/instagram-connect.behavior.test.tsx`
- `web/src/components/connections-navigation.test.tsx`
- `web/e2e/connections.spec.ts`
- This evidence file.

### Existing files modified

- Instagram OAuth start/callback routes + route tests; `lib/instagram-oauth-url.ts`
- `components/instagram-connect.tsx`, `components/app-header.tsx`, wizard reconnect link
- Reports page, New Audit usage query, Accounts list/detail connection links
- Instagram disconnect action + tests; browser projection and public trust tests
- Privacy, support and data-deletion copy
- `e2e/preview-login.spec.ts` (browser/request session isolation fix)

### Deliberate boundaries

Reports uses two parallel owner-scoped queries (24-row filtered page + exact usage count), replacing the old full-row download and singleton connection query. Filter-pill per-status counts were removed rather than displaying page-local counts as global totals. Overall filtered total is exact. Hero latest/active report cards appear only on the unfiltered first page so older pages cannot mislabel their report as latest.

Default callback success lands on Connections and displays the updated username even if that connection lives on a later page. Optional safe return paths are honored only after validated owner-bound state; callback failures always land on Connections. Legacy in-flight cookies are deliberately rejected with a recoverable session-expired message.
