# Latency implementation — 2026-09-19

## Delivered (no commit or deployment)

Reports, Connections, Subjects and the owner reader now have one retained, authenticated-layout TanStack Query owner (`@tanstack/react-query` pinned to 5.90.21). Page RSCs do not perform the old list/profile/report DB reads before rendering the retained client content. Layout server auth and every DTO boundary still verify the session; customer DTO queries explicitly scope owners, including admins. Subjects reuses the unchanged canonical owner-filtered/paginated/channel-deduplicating reader.

- Memory only; no local/session storage. Five-minute metadata freshness, fifteen-minute inactive GC. No focus/reconnect polling or retry storms. Empty success is cached. Manual Refresh is a real origin read and keeps the old timestamp/data with a visible refresh error on transient failure.
- One client per mounted authenticated principal. Signout/session-owner change clears and cancels; abort signals and post-await fencing reject late responses. A 401/403 or mismatched DTO principal clears private data rather than rendering stale success.
- Keys include owner, resource, revision and filter/page. Server-action revision cookies are nonsecret HttpOnly same-site session invalidation nonces, **not persistent private-data storage**.
- Reader DTO hashes actual presented HTML bytes using SHA-256. Immutable keys include owner, report ID, version, content hash and explicit presentation revision. A replacement at the same path/version still receives a different identity. Metadata pointer is five-minute reusable; bytes under an immutable identity use infinite freshness with finite GC. Existing mobile/shadow-body presentation fixes remain intact. Public/share readers remain uncached, abortable fetches.
- PollCount feedback loop removed. The mounted regression reproduced **11 immediate fetches** before the old loop's test safety cutoff; now one immediate read and one after 8 seconds. Subsequent reads are scheduled after settlement, back off on errors, slow after prolonged work, pause/abort hidden/offline/unmount, stop terminal/401/403/404, and refresh/invalidate Reports once on ready. A route/status key change isolates old component state.
- Resolved success/empty markers: `reports-content`, `connections-content`, `subjects-content`. These are not on skeletons or failed initial loads.
- No speculative full/intent prefetch, global Next experimental flags, provider sync, model invocation, or live writes were added.

## Required parent-owned integration — release gate

Helper is implemented: `import { bumpResourceRevision } from "@/lib/resources/mutation-revision"` and `await bumpResourceRevision("reports" | "connections" | "subjects")`. Call **after durable success, before redirect/revalidatePath**. Next server-action cookie mutation rerenders the layout and supplies a new generation to mounted observers. Do not import this server-only helper into client code.

| Parent-owned path / success boundary | Revision |
|---|---|
| `lib/actions/audits.ts::createAudit` accepted submission | reports; subjects if subject linkage created |
| `lib/actions/intelligence.ts::prepareAndSubmitIntelligenceBatch` accepted new work or recovered successful retry (including subject/channel creation) | reports + subjects |
| `lib/actions/refinements.ts::requestRefinement` accepted refinement | reports |
| `lib/actions/instagram.ts::disconnectInstagram` successful deletion | connections |
| `app/api/auth/instagram/callback/route.ts` successful persist/reconnect before redirect | connections (full document OAuth return already discards memory) |
| Subject create/rename/archive/channel add/remove actions or API routes | subjects |
| `lib/actions/admin.ts` successful approve/requeue/block/manual report upload | reports for the acting browser; another owner's open tab is not pushed |
| `lib/actions/admin.ts` plan/gift/access updates, `lib/actions/preview-tester.ts` plan/reseed helpers | reports; subjects for reseed |

Client completion paths (`components/live-timeline.tsx`, any refinement-completion observer in `report-viewer.tsx`) should call `void useWorkspaceResources()?.invalidate("reports")` **at the actual terminal transition**, before `router.refresh()`. Store the hook's result at component top level, not inside callbacks. `customer-wait-state` already does this. Invalidation marks the report list AND latest-reader pointer stale; content keys remain immutable. Only invalidate subjects when a completion changes its displayed summary; current list intentionally has `lastAuditAt: null`.

Stripe/OAuth full navigation starts an empty cache. Backend webhooks, worker changes, or another principal's founder mutations cannot alter an already-open user's session cookie; those changes are visible on explicit Refresh or the next stale revisit (5 minutes), not instant cross-user push. Do not claim distributed invalidation. Privileged commands always reauthorize independently of cached usage/plan displays.

No actions, auth/proxy, billing, AppHeader, worker or brand markup were edited by this slice. Parent must finish the above integrations before release.

## Changed files owned by this slice

- `web/package.json`, `web/pnpm-lock.yaml`: pinned TanStack Query and test-only jsdom 26.1.0; preserved earlier dependencies.
- `web/src/lib/resources/{workspace,dto,report,mutation-revision}.ts`; workspace/report tests.
- `web/src/components/{workspace-resources,resource-status,reports-library,connections-library,subjects-library,owned-report-reader}.tsx`.
- `web/src/app/api/resources/{reports,connections,subjects}/route.ts`, `report/[id]/route.ts`.
- `(app)/layout.tsx`, dashboard, Connections, Subjects and owner-reader page shells; migrated their existing behavior/security tests to the DTO boundary.
- `components/intelligence/customer-wait-state.tsx` + mounted fake-timer tests; `immersive-report.tsx` loading lifecycle + lifecycle tests; workspace mounted lifecycle tests.
- `lib/instagram-connection-public.test.ts`: projection guard now points at the moved read endpoint.
- This handoff document. Pre-existing presentation/worker changes and sibling brand changes are preserved.

## Verification

Focused Vitest coverage includes simultaneous consumers; Reports ↔ Connections retained reuse without a second origin read; empty success; five-minute TTL; finite GC; explicit refresh failure; no focus/reconnect reads; revision change without old-data paint; late A success/error after B; signout/403 clearing; body reuse and shared-reader abort; all polling terminal states, cadence, hidden/offline/unmount, late ready, backoff and terminal server-prop changes. DTO tests retain owner-scoped admin access, pagination, exact counts, nonsecret connection projections, reconnect-target ownership, error vs empty, canonical subject history/count behavior, and report presentation regression checks.

Reproducible from `web/`:

```sh
pnpm exec vitest run src/lib/resources src/components/workspace-resources.test.tsx src/components/immersive-report.lifecycle.test.tsx src/components/intelligence/customer-wait-state.test.tsx 'src/app/(app)/dashboard/page.behavior.test.tsx' 'src/app/(app)/settings/connections/page.behavior.test.tsx' 'src/app/(app)/audits/[id]/read/page.test.tsx' 'src/app/(app)/subjects/subjects-page.test.tsx' src/lib/intelligence/subject-history.behavior.test.ts src/lib/intelligence/subject-owner-scope.behavior.test.ts src/lib/instagram-connection-public.test.ts src/lib/report-presentation.test.ts src/lib/report-presentation-routes.test.ts
pnpm exec tsc --noEmit --incremental false
pnpm exec eslint src/components/workspace-resources.tsx src/components/resource-status.tsx src/components/reports-library.tsx src/components/connections-library.tsx src/components/subjects-library.tsx src/components/owned-report-reader.tsx src/components/immersive-report.tsx src/components/intelligence/customer-wait-state.tsx src/lib/resources src/app/api/resources
git diff --check
```

Final run: **14 test files / 72 tests passed**. Typecheck (`--incremental false`), scoped lint and `git diff --check` also passed. No whole build, dev server, paid API, shared tester login or production request was run by this slice.

## Remaining measured/integration gates

- Parent owns real authenticated after-benchmark, integrated build and deployment. Use `/tmp/alm-sweep-baseline-content/results.json`, not the earlier skeleton-based Subjects measurement. No production latency improvement is claimed from unit tests.
- Verify server-action cookie revision propagation and all mutation success paths in Next itself, plus layout stability across actual Next navigation. Tests exercise mounted React/TanStack lifecycles and mocked DB boundaries, not real cookie-auth browser integration.
- Cold/stale reader-pointer reads download the body to compute an authoritative content digest. There is no assumed immutable Storage ETag/version contract, no metadata-only shortcut, and no extra generation. Presentation transforms must bump `REPORT_PRESENTATION_REVISION` when changed.
- Subjects canonical read and Storage SDK download do not propagate the browser abort into every backend operation. Browser cancellation fences results; report/connection DB reads do receive the request signal. Cold Subject fanout/count semantics are unchanged; this slice removes repeated work, not the first-read database cost.
