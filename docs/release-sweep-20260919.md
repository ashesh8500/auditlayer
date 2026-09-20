# ALM source sweep and release — 2026-09-19

## Authority and outcome
Ashesh approved implementation, major parallel fan-out, full source sweep for orphan/contradictory features, latency and user-story testing, consistent black ALM wordmark with green period, independent review, and deployment. Telegram message 19332 on 2026-09-19 explicitly expands this SAME release to the previously proposed pricing/reader overhaul, credit-based billing, model picker and brand-intelligence workspace direction. The earlier exclusion of pricing/model/credit changes is superseded. AWS hosting is explicitly deferred. Preserve working security/cache/report fixes and existing purchased rights; no credential bypass, arbitrary removal of working features, production-data deletion, or unrelated infrastructure migration. Native iOS compilation remains separate and requires Xcode. The expanded release authority and implementation boundaries are in `docs/workspace-release-20260919.md`; do not deploy the narrower sweep as if it satisfies the new request.

## Working tree
`/home/asheshkaji/projects/alm-report-mobile-20260919`, branch `fix/report-mobile-20260919`, base `38ab957b7669a0525af390882bad3c305f971660`; contains completed uncommitted web/worker report fixes. Main `/home/asheshkaji/projects/auditlayer` is stale/dirty: never edit it. Do not commit/deploy until independent final review.

## Wave 1 ownership
- Latency implementation: web resource cache, dashboard/connections loading, app-group layout, immersive report loading, pending job lifecycle, package/lock. No brand markup, auth proxy, billing actions, or worker edits.
- Branding implementation: canonical Brand component/assets/icons/metadata, brand references across web/email/report template; no loading/auth/business behavior changes. Coordinate immersive/header changes with parent.
- Web source sweep: READ ONLY all app/components sources; identify orphan routes/actions, dead ends, misleading gates, mobile/user-story omissions; file coverage list and actionable findings, not a new graph/framework.
- Domain/backend source sweep: READ ONLY web lib/API + worker + active SQL/scripts; audit billing monthly period defect, ownership, version/refinement/data pathways and stale/dead implementations; file coverage and targeted findings.
- Report independent review: READ ONLY existing report-fix diff, actual security/layout/upgrade semantics and regressions; exact reviewed-file hashes, blockers and probes.

Parent owns integration, shared actions/header handoffs, full build, dedicated-tester/browser QA, further remediation lanes, final independent review, preview, merge, production and worker deployment, rollback and postdeploy verification.

## Required closure
- Source coverage accounting across tracked active code (exclude historical migrations/legacy/generated/test fixtures from active-deletion assumptions; document skipped categories honestly).
- Reports/Connections cold and warm latency, traffic/idle/request budgets; completed reports do not poll; active progress bounded and terminal-aware.
- Sign-in/redirect continuity; subject create/select/brief; connection add/reconnect/disconnect; intake/entitlement errors; queued/blocked/failed/ready; reader/version/share/refine/PDF; pricing/billing return; admin; logout/account isolation.
- Desktop and 320/390/430px mobile checks; direct stored and new generated HTML; table-local scroll; no leaked telemetry; no broken upgrade links; consistent brand.
- Full tests/typecheck/lint/production build, independent exact-diff review, preview and deployed readbacks. Live payment or third-party consent steps not exercised must be named, not claimed.
- Rollback target recorded before release; worker drain/backup before sync; DB before dependent code if migrations needed.

## Baseline and recovery
- Live rollback web target verified: `https://web-1ov8rmnwl-ashesh8500s-projects.vercel.app`, deployment `dpl_2WMYBMuoNZ2ujzdeP5c37hjiGbDg`; both worker instances active/running, zero restarts.
- Headed Chromium on scoped Xpra :120 works. Private cua daemon started as terminal `proc_ac84c3bea1f0`; no desktop/global config changes. Scoped runtime changes XDG_CACHE_HOME, so Playwright needs `PLAYWRIGHT_BROWSERS_PATH=/home/asheshkaji/.cache/ms-playwright`.
- Parent harness `/tmp/alm-sweep-navigation-qa.cjs`; latest valid baseline `/tmp/alm-sweep-baseline-content/results.json` (52 samples incl 48 client navigations). Desktop medians Reports1493.5ms, Connections1737.5ms, Subjects2571.5ms; mobile1696.5/1450/2932.5ms. Eight samples each, not robust production p95. Zero document reload, overflow, JS errors. Earlier Subjects ~100ms only reached loading heading: superseded, NOT real loaded-content latency.
- Use exact loaded headings/content markers for after. Never compare loading skeleton timing to loaded baseline. CUA capture white gutter outside 390px emulated viewport is browser emulation, not app overflow.

## Integrated local verification
- Combined web run: 933 tests / 110 files passed before the subsequent website-heading fix; owner-detail focused suite now 13 passed. Network-denied worker run: 730 passed, 11 skipped, one intentionally deselected socket-server probe. Full rerun still required at final candidate.
- Next 16.2.10 production build passed, with registered Proxy. Canonical local Supabase stack replayed the migrations; its custom Docker network uses `com.docker.network.bridge.host_binding_ipv4=127.0.0.1`. Every published service binding was inspected as loopback-only. Paid/provider credentials are blank in protected `/tmp/alm-sweep-local.env`.
- Local prod-mode server: `http://localhost:3021` (bound 127.0.0.1); `/api/health` database ok. Use localhost consistently for browser cookies: Next local redirects normalized to localhost, so a 127.0.0.1 browser origin lost its session on redirect. No production auth change made for this local harness issue.
- All 17 existing Playwright journeys passed, including authenticated tests (no skips).
- `/tmp/alm-local-stories.cjs` executed six additional real browser/DB stories: Extended two-channel batch, preserved website locator and exact brief pin, actual Server Action revision cookie, artifact-derived refinement selection, public share/reader at mobile widths, persisted revocation + anonymous denial, honest unavailable email-provider state, and authenticated-versus-anonymous owner DTO boundary. Fixture report clearly labels itself local QA, not client research; no worker/model/provider execution claimed. Results `/tmp/alm-local-stories/results.json`.
- Real detail-browser test discovered 431px content at 390px for a website title. Parent fixed wrapping and stopped prepending `@` to URL locators; unit regression RED→13 PASS. Production-mode browser retest pending rebuild; do not mark closed solely from unit results.
- Navigation experiment `/tmp/alm-sweep-local-after/results.json`: 52 samples, zero document reloads/overflow/browser errors, only one Reports/Connections DTO fetch per viewport, but warm median 400–610ms and an RSC read on every visit. Local results are not comparable proof of production improvement. Cache lane owns narrow primary-nav full-prefetch investigation and review M1/M3/L1/L2 fixes. M2 stale projection/style test failures were resolved in the 933-test run.
- Lifecycle contract checker exposed stale references after retirement/delegation; a bounded separate lane owns manifest/checker reconciliation, not new architecture.

## Status
Wave 1 `deleg_46a6aa88` completed: cache/branding implemented; web sweep 99 source files with 22 findings; backend sweep 229 inspected/scanned entries (167 explicit exclusions); report independent review HOLD on equal-offset HTML edits. Source coverage is recorded, not claimed as a proof of bug absence.

Wave 2 `deleg_85d01ba3` completed all five implementation lanes. Review batch `deleg_2788387d` returned scoped sharing security PASS (parent safe projection/readiness and stale no-store expectation are now integrated); commercial HOLD B1 spliced backfill period + B2 cross-subscription stale cancellation; refinement HOLD missing selected-section evidence + unbounded inference versus lease + safe heading mismatch. Drain implemented as migration `20260919211532_worker_fleet_drain.sql` with executable token-owned hook; it is not yet applied to production.

Current disjoint corrective lanes: `deleg_d73afbe3` cache memory/freshness/invalidation/status/nav; `deleg_5ceec942` existing lifecycle CI contract reconciliation; `deleg_aa8f9942` commercial B1/B2 fixes, refinement evidence/deadline/heading fixes, independent drain review. No child may commit/deploy; parent owns final exact-candidate gate and rollout. No stale HOLD is counted as closed without rechecking its exact reproducer.

Further parent verification:
- `/tmp/alm-local-trial-auth.cjs`: six additional real browser/DB assertions passed: authenticated GET grants nothing; explicit claim grants exactly once; same-user replay of exhausted invite is idempotent; query + effective trial Pro types survive into intake/API; even admin customer route cannot read another owner's report; real signout + browser-back cannot restore private workspace. Results `/tmp/alm-local-stories/trial-auth-results.json`. Local trial users/offers/action fixtures removed and absence verified, including one failed-run leftover. No real email, payment or provider call.
- Read-only fleet inventory: exactly two local Python workers with uv launchers; @1/@2 active, zero restarts, health ok and active_job_kind=null; singleton disabled, no PDF unit. This records the inventoried single-host fleet, not proof about hypothetical undisclosed hosts.
- Protected production worker `.env` presence-only inspection: DeepSeek V4 Flash/inprocess configured; EXA/TAVILY/FIRECRAWL/BRAVE/SEARXNG variables absent. Full-data launch remains blocked on a working ALM-scoped research provider and real Instagram reconnect. Do not borrow personal/shared credentials implicitly.

Parent integration completed locally with failing-then-passing regressions:
- Stable right-to-left HTML edits now handle equal-offset replacements and insertion order. Adjacent, footer-boundary, unclosed and nested tables have real Chromium tests; malformed iframe URL no longer throws. Original independent `/tmp/alm-review-probes.cjs` now reproduces clean boundaries.
- Progress reads authorized root audit + audit_events only; removed incorrect subject-latest lookup, owner-scoped even for admin, failed reads return503, no internal raw progress detail.
- Audit detail explicitly projects safe share fields (no verification material), surfaces unavailable share data rather than an empty list, hides actions for missing ready artifact, removes prompt Method display while keeping report version/date.
- Subject+batch sibling navigation loads separately under Suspense with owner checks at each joined entity. Actual production read-only PostgREST relation query returned200 with one row; no writes.
- Living Brief suggestion resolution refreshes canonical data on success, does not preserve stale initialized proposal statuses, and catches transport errors. Instagram successful connect/disconnect advances Connections/Subjects/Reports revision cookies, tested; failures do not.
- Removed internal prompt-version interpolation from subject archive/account history; admin diagnostics retained.
- Parent focused test runs and typecheck passed at their executed states, NOT final integrated release proof. Child files can still change.

Next: consume Wave2 handoffs, reconcile migration/provenance contracts and all findings, full production build/suites, exact-candidate independent review, authenticated after-benchmark and user-story QA, preview/CI/merge/schema+worker+web rollout with recorded rollback, deployed verification. No production change yet.

