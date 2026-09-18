# Subjects read-model evidence

## Implemented boundary

- Customer subject list and detail remain explicitly owner-scoped, including admins. Exported channel/brief readers now verify the parent owner before reading children. No page GET mutates or reconciles identities.
- Detail audit history unions owner-filtered batch associations with exact owner-verified account IDs attached to the subject's channels. Audit ownership is checked independently. Deduplication is by audit ID; handles never establish ownership. Failed/in-progress rows are retained, labelled by status, and open their run instead of claiming a ready report.
- Subject list, channels, brief versions, batches, batch links, accounts, and audit history use deterministic paginated reads. A short response is not treated as EOF: pagination advances by actual received rows until an empty page, handling a lower hosted row cap. ID filters are chunked at 100. Counts describe loaded runs (not immutable report-version counts).
- Managed Instagram channels without an account or usable connection require reconnect. Account/connection owner projections must match the authenticated owner before health/display metadata is trusted. Reconnect links use `/settings/connections`; no unverified connection ID is propagated.
- Query failures no longer masquerade as an empty workspace, zero child counts, or a missing subject. Subject routes use an all-or-nothing error boundary with sanitized copy and Retry, plus an accessible loading state. A missing/foreign subject still returns null/404. Deliberately no partial DTO is returned: any required child failure prevents misleading partial rendering.
- Remaining intelligence previews are explicitly labelled (5 latest runs, up to 30 recommendations, 20 suggestions). Complete audit history is separate from those previews. List-level last-audit timestamps are omitted (`null`) rather than continue presenting batch-only timestamps as complete history; detail computes the timestamp from the merged history.
- `ReportArchiveItem.status` is additive/optional to preserve existing fixture/API consumers. Existing public function names and result shapes are unchanged; errors now reject rather than silently return empty values.

## TDD evidence

Observed RED → GREEN in local Vitest:

1. Mixed legacy+batch history: initially zero reports rather than 16; then all 16 unique owned runs, including a failed run, passed with 15 batches and a simulated 7-row server cap.
2. Owner/failure/pagination behavior: 11 expected failures (foreign direct channel access, swallowed query failures, capped lists); all passed after implementation.
3. Missing-account reconnect, foreign joined connection/account, channel/brief pagination: three expected failures, then passed.
4. Rendered subject UI: three expected failures for inert reconnect, failed-run label, and empty archive; then passed.
5. Route UI: missing Connections action/loading/error boundary failed, then passed.
6. Canonical channel count consistency failed (2 versus 1), then passed after sharing the canonical dedupe key.

Latest targeted command:

```sh
cd web
pnpm exec vitest run src/lib/intelligence/subject-history.behavior.test.ts src/lib/intelligence/subject-owner-scope.behavior.test.ts src/components/intelligence/subject-home.test.tsx 'src/app/(app)/subjects/subjects-page.test.tsx' src/lib/actions/intelligence-ownership.test.ts src/lib/actions/intelligence-owner-scope.behavior.test.ts
```

**43 tests passed in 6 files.** Targeted ESLint passed. Final `pnpm exec tsc --noEmit` passed after the concurrent Connections page landed. An earlier TypeScript run was blocked only by that other lane's in-progress import. Unscoped `git diff --check` encountered another lane's trailing whitespace in the OAuth callback test; no out-of-scope fix attempted.

## Limitations / release gate

- These are deterministic local query-double and rendered React tests, not live RLS, real consent, or deployed browser verification.
- No build, commit, deployment, migration, SQL repair, token request, or production mutation performed.
- Full pagination is not a transactional database snapshot. Concurrent data changes may affect a multi-request read; UI therefore says loaded count, not an exact global immutable total.
- Archive is one entry per audit with its current report version and existing authorized audit URL, not a new immutable-version browsing feature. Existing report artifact routes are untouched.
- SQL lane owns durable account preservation/reconciliation. API lane owns canonical Connections and targeted OAuth actions. Browser retry/reconnect flow and mobile layout remain for the parent's serialized release gate.
