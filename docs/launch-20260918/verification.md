# Verification log

## Baseline (origin/master 0ca79ea, before implementation)

- Web `pnpm test`: 59 files, 639 tests passed.
- `pnpm lint`: zero errors, 13 existing warnings.
- `pnpm build`: production build passed; `pnpm typecheck` passed.
- Production-mode local server on port 3028: 11 Playwright public/auth-redirect tests passed; one authenticated preview test skipped because credentials not loaded. Initial browser launch failed because pinned Chromium was not installed; `pnpm exec playwright install chromium` resolved environment prerequisite, then entire browser suite reran. Server stopped and port closure verified.
- Live Vercel production alias resolves to `dpl_C37FDApbxeRmnpcmyVTxHZ6Yfb4F`, `https://web-kh3xabvqb-ashesh8500s-projects.vercel.app`, created 2026-09-07, Ready, runtime iad1. This is the pre-release rollback deployment.
- Personal browser `/subjects` reaches `/login`; no authenticated production QA claimed. No saved vault login available; 1Password unlock unavailable in this session. Do not impersonate a customer to close this gate.
- Vercel Preview credential **names** exist, but `vercel env pull` returned empty sensitive values; no usable credentials were retrieved. For local production-mode QA only, generated a mode-0600 `.env.local` from existing Supabase configuration and fresh local preview-login secret/test password. Used the canonical dedicated preview tester, not a customer-login bypass. Server bound to loopback only. No secrets logged or committed.
- Supabase CLI 2.117.0 `db push --project-ref eamnfmtkvglbnugzmotw --dry-run --skip-vault --yes`: connected successfully and showed only the new launch migration pending. This was discovery only; migration contents were still under development, no DDL applied.

## Report-page query waterfall

`web/src/app/(app)/audits/[id]/page.test.tsx` invokes the actual server component and its ReadyReport child with controlled lazy database queries.

RED: two tests failed because only refinements started; version/share reads waited for it. Missing-audit access gate test passed.

GREEN: all three passed after Promise.all over independent refinement/version/share metadata reads, still downstream of the existing authenticated audit lookup. Optional share transport failure remains contained. No public/shared user-data cache introduced.

This verifies removal of the sequential dependency, not a measured production latency reduction. Authenticated before/after browser measurements remain outstanding.

## Evidence from read-only specialist investigations

- `/tmp/alm-launch-ux-investigation.md`: precise customer-scope, OAuth bridge, disconnect and archive gaps with production metadata snapshots. Snapshots changed while another actor submitted work; counts are not a current total.
- `/tmp/alm-launch-performance-baseline.md` and `/tmp/alm-launch-performance/`: 16 JSON artifacts and collection scripts; public timing measurements, historical stage timings, live unit health and profile-bundle drift. Historical success cohorts are small/heterogeneous and not launch load-test evidence.
- `aws-migration-plan.md`: reviewed recommendation only, no AWS resources created. Official Lambda quota source independently refetched by release owner, including standard invocation versus Managed Instances distinction.

## Integrated web verification

- After SEC-1 transactional reconnect and SEC-2 exact-ID remediation: **68 files / 719 Vitest tests passed**, production build and typecheck passed, lint zero errors / 13 pre-existing warnings; all **15 browser tests reran and passed** against the rebuilt production bundle.
- Earlier parent integration checkpoint: **68 files / 703 Vitest tests passed**, production build and typecheck passed, lint zero errors / 13 pre-existing warnings.
- Shared error/loading primitives replaced ad hoc Subjects states; updated experience scanner and regenerated artifact: 29 routes, 10 rules, no blocking violations.
- Production-mode browser QA against real Supabase using the canonical dedicated preview tester: **15/15 passed, zero skipped**, including desktop 1280px and mobile 390px Subject detail → Reconnect → Connections → Reports and invalid callback recovery. This exercises real reads/session auth but not real Meta consent.
- Preview login resets one shared tester password: parallel workers invalidate sessions. Authenticated Playwright lane now runs serially. Use the canonical `localhost` origin locally; mismatching `127.0.0.1` with redirect origin breaks cookies and is not an application auth regression.
- `scripts/qa-launch-connections.mjs` captured six route/viewport screenshots and 18 timing samples to `/tmp/alm-launch-browser/`, all without overflow. Measurements are local production bundle + real Singapore Supabase, not production-user timing or a before/after claim.
- Screenshot review identified misleading inactive-state “Connected data” and “New audits will wait” copy, singular count, unnecessary Page 1, and ambiguous AI-grant scope. Two new behavioral regressions first failed and then passed after narrow corrections; full tests/build/browser reran afterward.
- Local QA server is loopback-only on 3028. Stop it and verify port closure after release testing.

## Gates still open

Worker stale-write follow-up, final SQL/worker integration and independent review, exact-head CI, hosted preview probe, schema rollout/read-back, migration dry-run reconciliation, production deployment, worker/profile rollout and steady-state checks, controlled connected report and authenticated production acceptance. Do not label the release complete until these are resolved or explicitly reported blocked.
