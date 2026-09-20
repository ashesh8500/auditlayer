# Reader + Brand Context integration — 2026-09-19

Scope: `deleg_9e1c2875` reader lane only. Worktree `/home/asheshkaji/projects/alm-report-mobile-20260919`, branch `fix/report-mobile-20260919`. No commits, deploys, provider calls, production probes or main-checkout edits. All evidence below is local execution in `web/`.

Not touched, by instruction: `web/src/lib/actions/intelligence.ts`, `web/src/lib/actions/refinements.ts`, `worker/**`, `supabase/**`, `web/src/lib/supabase/types.ts`, workflow UI/actions, shared schema/generated artifacts, the main checkout.

## What now exists (mounted controls, not a plan)

**Owner/shared reader**
- `immersive-report.tsx`: after injection it indexes the artifact's real `h2` sections inside the shadow root and renders (a) a sticky desktop chapter rail (≥1024px), (b) a mobile `<details>` contents list whose summary shows the active chapter. Both are real buttons: activating one scrolls the target, focuses it, switches `aria-current`, closes the mobile sheet and writes `#report:<id>`. `hashchange` is honoured, so deep links work on load and while the reader is already open. Section IDs emitted by the artifact are preserved untouched; when an artifact has no IDs the reader assigns a version-local `reader-section-N` and says so in the panel.
- The reader chrome moved from the dark forest header to the light app shell (`bg-white`, `text-foreground`, token-colored caption) and keeps the ALM wordmark plus the legacy black wordmark + green period. All reader styling is token-based (`--text`, `--line`, `--surface`, `--accent`, `--accent-muted`, `--muted`); no hardcoded hex remains in the file.
- Truthfulness panel: `Actions only`, `Why this score`, `Evidence panel` are rendered as permanently disabled controls with the explanation that this artifact carries no verified action/score/evidence mapping. Semantic-ID availability is stated per artifact. Missing scores are never turned into zero, and prose is never classified into actions or scores (`indexReport` only ever reads `h2`).
- `owned-report-reader.tsx`: keeps the retained TanStack owner and immutable-key design. It now reads a metadata projection first (`?metadata=1` — no storage download) and only then fetches bytes for the exact selected version. Selection lives in `?version=`; `latest` deletes the parameter. Historical selection never writes `latestVersion`, never rewinds the report pointer, and shows `Historical version — latest is unchanged`. Provenance shown: version, created date, Brand Context version, methodology, evidence-snapshot id — each rendered `unknown` (with a reason) when the artifact has nothing pinned, never borrowed from the latest subject run.
- `report-viewer.tsx`: added a `Read & browse versions` link to `/audits/[id]/read` beside the download control so the reader is reachable from the management view.

**Authorized read route** (`web/src/app/api/resources/report/[id]/route.ts`)
- Owner check on the audit root happens first for every viewer including admins; version history, run and storage are only read afterwards.
- Version parameter is validated (`^[1-9][0-9]*$`, safe integer) and must exist for this audit, otherwise 400/404 before any download. Bytes come from `audit_report_versions.report_path` for the requested version.
- Provenance is pinned from `audit_report_versions.intelligence_run_id` → `intelligence_runs`, and only when the run is `completed` **and** its `subject_id` is an owned subject of the requesting profile. It never falls back to the subject's newest run or latest brief.
- `?metadata=1` returns identity/versions/provenance with no `html` and no storage call, which is what makes the 5-minute metadata TTL free of immutable-byte refetches. Payload is a bounded projection: no wallet, context secrets, storage paths or internal telemetry.

**Brand Context / version continuity** (`web/src/components/intelligence/subject-home.tsx`, `web/src/lib/intelligence/subjects.ts`)
- Visible label is now **Brand Context** (tab, heading, buttons, copy), over the existing `living_brief_versions` records — no second store, no schema change.
- New read fields: `confirmed` and `authorLabel` (author is read as `created_by` and shown as `You` only for the acting profile, otherwise `Unknown`). Version history distinguishes confirmed / unconfirmed / confirmation-unknown, marks the confirmed version as current, and no longer treats the newest row as authoritative by position. Unconfirmed versions keep a `Needs your call` proposal lane.
- Proposal comparison is now base-version pinned: the diff reads the version named by the proposal's `base_version`, is labelled `Base version N`, and states `Base version N unavailable; comparison unknown.` instead of silently diffing whatever is newest. `parentVersionId` resolves from `base_version` too.
- Removed a fabricated `Overall score` (previously the mean of whatever dimensions happened to have numbers). The overall figure now renders only if an actual `overall` dimension score exists; otherwise nothing is shown. `Data needed`, methodology labels and change reasons remain unchanged.
- History rows expose `aria-expanded` and a ≥44px target; missing change summaries are reported as not recorded.

## Verification (local, offline)

`web/`, `pnpm exec vitest run` — reader-lane files, all green:

| File | Tests | What it proves |
|---|---|---|
| `src/lib/report-reader.test.ts` | 10 | real IDs kept, version-local IDs marked unstable, prose never classified as action/score, malformed versions and fragments rejected |
| `src/components/report-reader.browser.test.ts` | 4 | Chromium, real components: desktop rail + mobile contents keyboard navigation and `#report:` deep link at 320/390/1440, share view renders no version selector, historical selection does not rewrite latest, metadata refresh does not refetch immutable bytes (`bytes` counter stays 2 while `metadata` grows) |
| `src/app/api/resources/report/[id]/route.test.ts` | 9 | owner check precedes history/run/storage for privileged and ordinary viewers, historical run pinned rather than latest subject evidence, legacy pin stays unknown, metadata mode never downloads, malformed/absent versions rejected before download, no path/wallet leakage in the DTO |
| `src/components/intelligence/brand-context.browser.test.ts` | 2 | Chromium at 320/390: confirmed vs unconfirmed vs unknown author, base-version label, proposal rendering, focus/`aria-expanded`, no horizontal overflow |
| `src/components/owned-report-reader.test.tsx` | 3 | retained owner: late-response fencing across identity switch, mounted report survives budget pressure, bytes dropped on departure, cache cleared on signout (counts updated for the metadata-then-bytes sequence) |
| `src/app/(app)/audits/[id]/read/page.test.tsx` | 3 | existing owner/foreign checks still hold with the new version query in the chain |
| `src/components/report-mobile.browser.test.ts` | 14 | unchanged regression: 320/390/768/1440 geometry, local table scroll (`scrollLeft` advances, `scrollX` stays 0), Inter + `#0d9488`, sandbox string unchanged |
| `src/components/intelligence/subject-home*.test.tsx`, `src/lib/intelligence/subject-history.behavior.test.ts` | 28 | proposal decision/refresh behaviour and history projection unaffected by the Brand Context relabel |

Also: `pnpm exec tsc --noEmit` reports **no errors in any reader-lane file**; remaining repo errors are sibling-lane (`src/lib/actions/workflows.ts`, `src/lib/workflows/*`, `src/lib/workspace/payments.test.ts`). `pnpm exec eslint` on every touched file exits 0. The experience-contract scanner reports **zero violations from reader-lane files**; the residual `header`/`button`/`target` violations and the route count (30 → 32) come from the workflow lane, not this one.

Full `pnpm exec vitest run src`: 1018 passed / 2 failed at handoff time — both failures are `experience-contract` assertions caused solely by workflow-lane files (its route count 30 → 32 and its three violations in `src/app/(app)/workflows/page.tsx` and `src/components/workflows/workflow-owner.tsx`). Verified with a direct scanner run: no reader-lane file produces a finding.

## Practical user stories covered

1. Open own report → see version, created date, Brand Context pin, method and evidence snapshot; switch to an older version, read it, download *that* version, see that latest is unchanged.
2. Deep link into a section (`#report:next`) on desktop and mobile → correct section focused; keyboard-only navigation through rail/contents works at 320 and 390px.
3. Open a legacy artifact with no pins → every provenance field reads `unknown`, the controls say unavailable, and no score or action is invented from prose.
4. Share recipient opens `/s/<token>` → reads the same artifact bytes with no version selector, no owner context, no wallet or telemetry.
5. Returning owner reloads and refreshes metadata → bytes are served from the exact-version cache entry; only metadata re-reads.
6. Brand Context: confirmed version is `Current`, unconfirmed and author-unknown versions are labelled as such, and a proposal shows the base version it was drafted against (or says the comparison is unknown).

## Remaining gaps / handoff items

- **Renderer semantic IDs (parent/worker lane):** the reader can only deep-link into `h2` sections of the canonical shell. To make actions/evidence/score explanations real rather than unavailable, the renderer must emit supported, already-existing artifacts — proposed, no schema change: `id="alm-section-<n>"` on each `<section>`, `data-alm-evidence="<evidence_id>"` on citation blocks, `data-alm-score="<dimension>"` / `data-alm-score-value="<n|null>"` on score rows and `data-alm-action="<recommendation_id>"`. Until those bytes exist in stored artifacts, the reader must keep showing the unavailable state; do not infer mappings from prose.
- **Evidence drawer:** deferred by design. Needs a version-pinned evidence read (snapshot-scoped, not latest subject run) before any source panel can be honest. The route already reports the snapshot id when one is pinned.
- **Render observation date:** not available in current artifacts; the reader states this explicitly instead of displaying a plausible date.
- **Legacy in-flight storage/TTL:** the metadata entry now retains no bytes; per-version entries are still bounded by the existing 8-entry / 16MB / 4MB-per-report budget.
- **Sibling-lane residuals** for the parent integration gate: workflow-lane `experience-contract` assertions (route count and its three violations), the workflow test-suite import failure, and the pre-existing repo-wide `tsc` errors in `src/lib/actions/workflows.ts`, `src/lib/workflows/*`, `src/lib/workspace/payments.test.ts`.
- **Not verified here:** production/authenticated app-shell rendering, real Supabase RLS behaviour for the new version/run reads (route tests use test doubles), and any stored PDF binary.
