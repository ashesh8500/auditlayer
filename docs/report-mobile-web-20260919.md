# Report reader / upgrade correction — web lane

## Scope and root causes

- Worktree: `alm-report-mobile-20260919`, no commit/deploy. Only `web/` plus this requested evidence document edited by this lane.
- All three HTML handlers previously returned the stored HTML unchanged: owner `/api/audits/[id]/report` (iframe, versioned HTML and HTML download), owner `/api/audits/[id]/read`, and authorized `/api/share/[token]/report` (public/email-gated share reader). Thus old reports retained technical footer text even after a generator-only change.
- `ImmersiveReport` extracted body **contents**, losing the element targeted by `body` typography rules; shadow CSS `:root` also did not match the host. Browser RED showed Times New Roman and no `--accent` despite the report stylesheet declaring Inter and teal.
- Legacy tables lacked local horizontal scroll containment; two-column cards could exceed phone width. Parent's live reproduction measured a 550px document at a 390px viewport. This lane reused the parent's already-downloaded report locally; did not fetch or mutate customer artifacts.
- Stored CTAs point to `https://auditlayermedia.com/pricing`, which had no page. Redirecting to `/#pricing` would not work for signed-in users because `/` redirects them into the app. A sandboxed management iframe also cannot run billing inside itself; no sandbox permissions should be broadened to fix that.

## Implementation

- `report-presentation.ts` parses HTML with parse5 and applies source-offset edits, not wholesale serialization. This preserves untouched content/evidence/source bytes. It removes **only** paragraphs matching the complete legacy `Prompt v… · timestamp · ~$cost · input+output tokens` telemetry signature. Customer as-of dates, source dates, narrative, prices, and citations remain.
- Adds keyboard-focusable, labelled scroll regions around tables, scoped responsive styles for the known report shell, shrinkable grid children, and phone card stacking. No page-wide overflow clipping.
- Applies this projection only after the existing access gate and successful private storage download in all three handlers, including HTML attachment/version requests. No writes to stored reports, regeneration, auth changes, CSP changes, or sanitizer changes.
- Shadow reader retains a real body element and maps report `:root` to `:host`, restoring its declared typography and variables. Reuses its existing shadow root on a new report URL instead of leaving old contents behind.
- Known ALM pricing links are normalized to the serving app's origin, retaining explicit `starter`/`pro` or inferring them from Standard/Extended CTA labels. Other citation URLs remain untouched. Absolute URLs continue to work in downloaded HTML.
- Canonical destinations agreed with worker lane remain `/pricing?plan=pro` and `/pricing?plan=starter`. Bare `/pricing` also works.
- New pricing page derives its offer copy/prices from the existing offer contract; signed-out links carry `/pricing?plan=…` through the existing login `next` flow. Signed-in forms explicitly submit through the existing `startCheckout` billing action. The pricing action rechecks auth and retains plan continuity if the session expires before submit. Page GET never creates a checkout. Existing customer portal action remains available.
- `ReportFrame` bridges a trusted, unmodified primary click on **same-origin `/pricing` only** from iframe content to host navigation. It reconstructs only allowlisted plan query values. Customer and admin iframe sandbox strings remain byte-for-byte unchanged; no script, form, or arbitrary top-navigation permission added.
- Added parse5 runtime dependency and explicitly declared the already-used esbuild version for offline real-component browser tests. Updated experience-contract route count/artifact for the new route.

## RED → GREEN and verification

Executed failures before corresponding fixes:

1. Legacy-footer test: returned HTML still contained `Prompt v1.8`.
2. Local-table test: expected labelled scroll wrapper absent.
3. Upgrade normalization test: expected local `/pricing?plan=pro` absent.
4. Shadow browser test: font was `Times New Roman`, accent empty.
5. Pricing route test: file did not exist; route/action imports absent.
6. Real sandbox iframe click: top-level URL did not navigate to pricing (3-second navigation timeout).

Final execution:

- `pnpm test`: **75 files, 751 tests passed**. Includes 9 Chromium real-component tests plus four report-route projection tests. Existing OAuth negative-path suites emit their expected diagnostic stderr; no failed tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed with 0 errors and 13 existing warnings. Targeted ESLint for presentation, pricing, iframe, and reader files also passed. One initial invocation from repository root had no lint script; rerun from `web/` produced this result.
- Local Next dev server on port 3019 stopped after verification; `ss` confirms no listener remains.
- `git diff --check`: passed.
- `PLAYWRIGHT_BASE_URL=http://localhost:3019 pnpm exec playwright test e2e/report-pricing.spec.ts`: **2 passed** against actual Next dev pricing/login pages at 390px; both selected plans survive the browser click to login; pricing HTTP 200; page width 390.
- `ALM_REPORT_FIXTURE=/tmp/alm-report-mobile-before/report.html pnpm exec vitest run src/components/report-mobile.browser.test.ts`: **9 passed** using actual `ImmersiveReport` and `ReportFrame` components plus the parent's private stored-report download. All external requests are intercepted/aborted in this offline harness; no mocked checkout success, no provider calls, no purchases.

Actual stored-report geometry, both shadow and iframe modes:

| Viewport | Document scroll width | Table region widths | Table scroll widths |
| --- | --- | --- | --- |
| 320 | 320 | 280 / 280 | 498 / 470 |
| 390 | 390 | 350 / 350 | 498 / 470 |
| 768 | 768 | 656 / 656 | 656 / 656 |
| 1440 | 1440 | 656 / 656 | 656 / 656 |

Both modes report `Inter, -apple-system, BlinkMacSystemFont, sans-serif` and `--accent: #0d9488`. At phone widths local table scrollLeft advances while the page remains at scrollX=0. The offline iframe CTA test performs an actual browser click and verifies host navigation to `/pricing?plan=pro` with `sandbox="allow-same-origin"` unchanged.

## Exact files changed by this lane

All paths below are relative to `web/`:

- `package.json`, `pnpm-lock.yaml`
- `artifacts/experience-contract.json`
- `src/lib/experience-contract.test.ts`
- `src/lib/report-presentation.ts`
- `src/lib/report-presentation.test.ts`
- `src/lib/report-presentation-routes.test.ts`
- `src/components/immersive-report.tsx`
- `src/components/report-viewer.tsx`
- `src/components/report-frame.tsx`
- `src/components/report-mobile.browser.test.ts`
- `src/app/admin/audits/[id]/page.tsx`
- `src/app/api/audits/[id]/report/route.ts`
- `src/app/api/audits/[id]/read/route.ts`
- `src/app/api/share/[token]/report/route.ts`
- `src/app/pricing/page.tsx`
- `src/app/pricing/actions.ts`
- `src/app/pricing/page.test.tsx`
- `e2e/report-pricing.spec.ts`

Plus this document at `docs/report-mobile-web-20260919.md`. Worker changes in the shared worktree belong to the sibling lane.

## Boundaries / remaining integration gates

- Parent owns the full Next production build; this lane did **not** run `pnpm build` or overwrite a production build.
- Signed-in page/action continuity is behavior-tested with explicit auth/billing test doubles, not a real Stripe checkout or payment. Actual public pricing→login browser navigation is tested. Parent can run its dedicated-tester authenticated probe during integration.
- Browser component harness exercises real component code and report CSS, with a minimal host rather than a full authenticated Next app shell. Parent's final authenticated app-shell/mobile check remains useful.
- Existing stored **PDF binaries** are not rewritten by this HTML read-time projection. HTML reader/share/download benefits immediately; future PDF generation is owned by worker lane.
- No report/customer identifiers, report fixture contents, session credentials, or screenshots were committed into this document or tests.
