# Workspace release — production deploy record (2026-09-20 UTC)

## What shipped

| Item | Value |
|---|---|
| PR | [#65](https://github.com/ashesh8500/auditlayer/pull/65) — squash-merged to `master` |
| Release commit | `a227286` *feat: ALM workspace release — credits, model execution, workflow, reader continuity (#65)* |
| Previous master | `38ab957` |
| Diff | 351 files, +21,902 / −3,759 before the reconciliation fixes; 12 commits total |
| Rollback (web) | `vercel rollback` on project `web`, or re-deploy the previous production deployment (see below) |

Nine lane commits were reconciled (contracts, supabase migrations, worker execution, portal workspace surfaces, reader/refinement/share, brand+build, infra, docs) plus four reconciliation commits and the native-iOS design artifacts rescued from a closed worktree.

## Gates

All GitHub Actions checks on PR #65 finished **pass** on the merged revision: Pre-commit, Secret scan, CodeQL (python, javascript-typescript, and the aggregate), Web, Worker, ALM intelligence.

Local equivalents before merge:

- `web`: `pnpm install --frozen-lockfile`, `typecheck`, `lint` (0 errors), `vitest` 1,032 passed, `next build`, `playwright` 13 passed / 4 skipped
- `worker`: `uv run pytest` 847 passed / 11 skipped
- SQL: disposable-PostgreSQL harnesses (`supabase/tests/workspace_credit_ledger_test.py`, `supabase/tests/workspace_execution_test.py`) all PASS

Reconciliation fixes required to get there:

1. `worker/tests/test_workspace_execution.py` and the new cross-language parity test import the real web module graph, so the Worker CI job now installs web dependencies (`pnpm install --frozen-lockfile`) before running pytest.
2. The experience-contract scanner counted two new workflow routes; the artifact, pinned counts, the delegated-header exception and the workflow row's raw buttons were reconciled (shared `Button`, 40px+ targets).
3. CodeQL flagged 12 pre-existing high-severity alerts re-detected because the diff touched those lines. Fixed rather than dismissed: platform detection now matches a URL **host** (never a substring, so `evil.com/instagram.com` and `instagram.com.evil.com` are not Instagram) in both `web/src/lib/domain.ts` and `worker/auditlayer_worker/core.py`, with parity regression cases; the operator report-text sanitizer now strips end tags that carry whitespace/junk and decodes entities in a single pass.

## Production database

Eleven migrations were applied to the production project (`eamnfmtkvglbnugzmotw`) in filename order and recorded in `supabase_migrations.schema_migrations` (65 → **76** versions, matching the repository exactly). Applied via the Supabase Management API because the DB password is not available on this machine; statement splitting was validated against the CLI's own recorded statement counts before use, and the two migrations containing `create index concurrently` were applied statement-by-statement so they were not wrapped in a transaction.

Pre-migration state captured: 20 profiles, 68 audits, 10 subjects, 24 share links; `share_links` policies `admin_all/delete_own/insert_own/select_own` and trigger `set_share_links_updated_at`.
Post-migration state: identical row counts; `share_links` now carries the hardened `owner_insert/owner_read/owner_revoke` policies; 13 new tables (`workspace_credit_*`, `workspace_executions`, `brand_workflow*`) and 29 new RPCs exist.

Compatibility: every RPC called by the **currently deployed** worker still exists with an unchanged signature, so the running worker is not broken by this schema. Rollback for the schema is a drop of the objects listed in the pre-apply manifest (created objects and added columns only; no existing table, policy or function was removed except the six deliberately replaced `share_links` policies/trigger).

## Web production

`make deploy-prod` → deployment `web-n8l3xvqml-ashesh8500s-projects.vercel.app` (`dpl_2UsAuLnF8nFZ2sgaARKtFwyBfxUh`), `target: production`.

Verified on `https://auditlayermedia.com`:

- `/brand/alm-favicon-16.png` (an asset that exists only in this release) returns **200** — production is serving the new build.
- `/pricing` renders the new offer: “Workspace — $129/month … 3,000 included credits ($30 usage value) … **Not available for enrollment** — final retention, expiry and refund terms are not approved. Workspace payment configuration and model qualification are not ready.”
- `/`, `/sample`, `/support`, `/privacy`, `/data-deletion` → 200; `/dashboard` → 307 to `/login?next=%2Fdashboard` (auth gate intact).

## Not deployed: the Hetzner worker

Worker code is merged in `a227286`, but the production VM was **not** released from this machine: `~/.ssh/config` has no `hermes-vm` host and `ssh root@178.104.182.4` returns `Permission denied (publickey)`.

This is safe to leave for a follow-up because the release is backwards compatible in both directions:

- `worker_claim_control` was inserted with `drain_token = NULL`, so claims are not paused and the running worker keeps claiming normally.
- Every RPC the deployed worker calls still exists with the same signature.

Remaining steps (run where VM access exists):

```sh
REVIEWED_REVISION=a22728684079a0e8e00dd15afaed18858b10e20e \
AUDITLAYER_REPO_DIR=/opt/auditlayer \
DRAIN_HOOK=/opt/auditlayer/worker/infra/drain.sh \
DRAIN_TOKEN=<retained uuid> \
bash worker/infra/deploy.sh
```

Or, per the repo's Syncthing sync convention: confirm `a227286` has synced to the VM, then `sudo systemctl restart auditlayer-worker@1 auditlayer-worker@2`.

## Capabilities that remain deliberately fail-closed

- No model is qualified (`rateCards` empty, both catalog candidates marked unavailable) — no provider call or credential read happened in this release.
- Workspace enrolment is not offered: legal/retention/expiry terms are unresolved.
- Scheduled runs require a durable `brand_workflow_occurrences` row plus live run+schedule grants; ledger-only reservations cannot dispatch.
- `brand_workflow_queue_occurrence(jsonb)` is still a stub: the workflow lane must create the audit/evidence/run/quote and call `workspace_execution_admit`.

## Worktrees and branches closed

Removed: `/tmp/alm-login-release-20260919`, `/tmp/alm-release-4703177`, `alm-ios-20260919`, `alm-launch-20260918` (858 MB), `alm-login-20260919` (118 MB). Deleted branches (local + remote where present), each verified landed in `master` by patch-id (`git cherry`) or identical content: `fix/launch-connections-20260918`, `fix/login-pkce-20260919`, `feat/ios-design-20260919`, `fix/report-mobile-20260919`. The native-iOS design artifacts from the closed worktree are preserved in `docs/ios/` and `docs/plans/2026-09-19-native-ios.md`.

Kept deliberately: the main checkout `/home/asheshkaji/projects/auditlayer` on `feat/bounded-report-runtime-v1` (in-flight mission with an uncommitted landing-page testimonial section) and this release worktree, now on `master`.
