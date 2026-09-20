# Cache review closure — 2026-09-19

## Delivered; no build, server changes, DB writes, deploy or commit

Closed M1, M3, L1, L2 and the unreachable Connections branch from `/tmp/alm-final-cache-review.md`. M2 experience/projection fixes remain parent-owned and pass the integrated tests. Added bounded canonical Next full prefetch to the three primary resource shell links; **a latency reduction is not yet measured**. Parent owns rebuild, actual authenticated production-mode navigation measurement and final independent delta review.

### M1: one TanStack owner with explicit inactive HTML admission

`createWorkspaceClient` subscribes to TanStack QueryCache success and observer-removal events and removes excess inactive report queries through QueryCache.remove. No second payload store, persistence, scheduler, retry mechanism or query engine was added. A WeakMap stores only numeric byte measurements for immutable DTO objects, so ordinary budget passes do not repeatedly encode unchanged bodies.

- Scope: immutable `report-version` entries and Reports `reader:` latest-pointer entries; not metadata lists.
- Inactive admission: **8 HTML-bearing query entries**, **16 MiB aggregate logical UTF-8 HTML**, **4 MiB maximum per entry**. Most recently updated entries win; ties prefer later insertion. This is update-recency retention, not a claim of access-LRU.
- Count and byte limits are independent. Zero-length bodies count as entries. Rejected large entries are not retained after settlement/unmount; opening them again reads the authorized DTO again.
- A currently observed reader is protected, including a report larger than 4 MiB. Observed and in-flight queries are exempt; after the last observer leaves / a fetch settles they are subject to admission. The active displayed report can therefore exceed this **soft inactive** budget. This is not a hard browser-heap limit or a server/download size restriction.
- Pointer and immutable DTOs still reference HTML. Both are conservatively charged against logical admission; **8 entries is not a promise to retain 8 distinct reports** (often 4 pointer/content pairs). Removing pointer HTML would require another content observer and coordinating eviction/missing-body recovery; avoided that additional mechanism in this minimal closure. JavaScript engines may share string storage; no measured-heap claim is made.
- Existing fifteen-minute inactive GC remains, as do all owner-keyed clients, identity cancellation/clearing, no private persistence, immutable key identity and server authorization boundaries.

Tests exercise 48 reports, independently binding count and byte cases, duplicate pointer charging, oversized mounted reader survival under pressure, oversized unmount eviction/reopen, signout clearing, and late old-owner reader success AND 401 after a principal switch.

### M3 / L1 / L2 / dead markup

- `requestRefinement` bumps Reports only after successful enqueue AND confirmed row readback, before revalidatePath. Tests assert one accepted-success bump and no bump for enqueue, confirmation, download and validation failures.
- ResourceStatus uses the typed DTO `fetchedAt`, not TanStack receipt `dataUpdatedAt`. A failed refresh retains the original origin timestamp; no origin timestamp means no Last checked label. The shared client reader type carries fetchedAt for all metadata DTOs (all actual endpoints already emit it); no Subjects source changes were needed.
- Reports status validation uses `Object.hasOwn`. Actual handler tests reject `toString`, `constructor`, `__proto__`, `hasOwnProperty` and unknown statuses with 400 before querying.
- Removed Connections `const error = false` and its dead markup; the actual ResourceStatus error path remains. Existing Connections behavior tests pass.

## Navigation decision and evidence

Read the supplied real local results `/tmp/alm-sweep-local-after/results.json`: 52 total samples, 42 warm client samples (round > 0), 7 warm samples per route/width. Every warm sample included a non-prefetch RSC response for its destination. Same-document client navigation and retained DTOs do not eliminate this route-layer wait.

| Width | Reports warm median | Connections warm median | Subjects warm median |
|---|---:|---:|---:|
| 390 | 404 ms | 402 ms | 432 ms |
| 1280 | 401 ms | 606 ms | 582 ms |

Pinned installed Next **16.2.10** source confirms `client/app-dir/link.js::getFetchStrategyFromPrefetchProp` maps true to `FetchStrategy.Full`, while default null/auto selects PPR. `client/components/segment-cache/cache.js` documents dynamic-prefetch freshness (default five minutes) separately from normal navigation freshness (default zero seconds). This justifies testing full prefetch rather than another DTO cache or experimental global staleTimes. It does not prove a particular throttle caused every observed millisecond.

Only AppHeader links `/subjects`, `/dashboard`, `/settings/connections` now explicitly use `prefetch={true}`. No new report-body/detail/list-row prefetch, global Next flags or bypass of the authorized server layout. Other existing links retain their previous defaults. A rendered-element-tree test asserts exactly these three explicit full-prefetch destinations. Next owns router cache lifetime/invalidation; server-action cookies and session changes retain their existing framework behavior.

Parent must measure after rebuilding, with the identical resolved-content markers, widths and rounds; include click RSC requests and prefetch/background volume, not only medians. Full prefetch moves bounded route work earlier; do not claim reduced total work or verified latency until the browser run establishes it. No server at localhost:3021 was touched by this slice.

## Verification

TDD REDs observed before respective implementation: 48 retained entries vs limit 8; missing accepted-refinement bump; noon origin rendered as 15:00 receipt; inherited statuses returning 503 instead of 400; unreachable error branch present; no explicit primary full-prefetch links. Each was then GREEN. Supplemental mounted/budget/auth tests cover integration.

Final focused run: **14 files / 62 tests passed**.
Final whole suite: **113 files / 952 tests passed**, JSON evidence `/tmp/alm-cache-closure-vitest.json`.
Typecheck, scoped ESLint (including refinement source/tests) and diff whitespace check: exit 0.

An earlier whole-suite run overlapped a parent-owned website-title RED in `audits/[id]/page.test.tsx` (948 passed / 1 failed); that file was not edited by this slice. Final rerun is fully green. Initial stronger timestamp typing exposed the Subjects query's incomplete declared DTO shape; corrected the shared client-reader return type, not Subjects code.

Reproduce from `web/`:

```sh
pnpm exec vitest run src/lib/resources src/components/workspace-resources.test.tsx src/components/owned-report-reader.test.tsx src/components/resource-status.test.tsx src/components/app-header.test.tsx src/lib/actions/refinements.test.ts src/lib/dead-ui.test.ts src/app/api/resources/reports/route.test.ts 'src/app/(app)/dashboard/page.behavior.test.tsx' 'src/app/(app)/settings/connections/page.behavior.test.tsx' 'src/app/(app)/subjects/subjects-page.test.tsx' src/lib/experience-contract.test.ts src/lib/instagram-connection-public.test.ts
pnpm exec vitest run src --reporter=json --outputFile=/tmp/alm-cache-closure-vitest.json
pnpm exec tsc --noEmit --incremental false
pnpm exec eslint src/lib/resources/workspace.ts src/lib/resources/workspace.test.ts src/components/workspace-resources.tsx src/components/resource-status.tsx src/components/resource-status.test.tsx src/components/owned-report-reader.test.tsx src/components/app-header.tsx src/components/app-header.test.tsx src/components/connections-library.tsx src/app/api/resources/reports/route.ts src/app/api/resources/reports/route.test.ts src/lib/dead-ui.test.ts src/lib/actions/refinements.ts src/lib/actions/refinements.test.ts
git diff --check
```

## Paths changed by this closure only

- `web/src/lib/resources/workspace.ts`
- `web/src/lib/resources/workspace.test.ts`
- `web/src/components/workspace-resources.tsx`
- `web/src/components/resource-status.tsx`
- `web/src/components/resource-status.test.tsx` (new)
- `web/src/components/owned-report-reader.test.tsx` (new; reader production source unchanged)
- `web/src/components/app-header.tsx`
- `web/src/components/app-header.test.tsx`
- `web/src/components/connections-library.tsx`
- `web/src/app/api/resources/reports/route.ts`
- `web/src/app/api/resources/reports/route.test.ts` (new)
- `web/src/lib/actions/refinements.ts`
- `web/src/lib/actions/refinements.test.ts`
- `web/src/lib/dead-ui.test.ts`
- `docs/cache-review-closure-20260919.md` (new)

Outside the repository, updated the default-profile `web-navigation-performance` skill with the maintained-cache budget lesson. No Brand, experience-contract, subject/detail, worker, admin, server/build/env/DB source was changed by this slice.
