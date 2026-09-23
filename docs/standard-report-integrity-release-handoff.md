# Standard report integrity — review and release handoff

## Review outcome

Independently reviewed implementation `db26fb3a1f145b1698d820fdf763a29f22e6a86a` against `origin/master` (`d3e312e`). No blocking correctness/security regression found; no additional code changes needed. Reviewed profile-path attribution, source provenance, initial/correction rendering, score withholding, HTML escaping, creative deduplication, dependency lock, prompt version and bounded retry contract. Added-line scan found no secret literals, shell execution, eval/exec, pickle or formatted SQL patterns.

Independent local verification in this worktree:

- `cd worker && .venv/bin/python -m pytest -q`: **865 passed, 12 skipped, 3 warnings**, 62.21 seconds.
- `uv lock --check`: passed; local non-network import confirms `ddgs 9.16.0`.
- `git diff --check origin/master...HEAD`: passed.
- Skips and fork-deprecation warnings remain as documented in `standard-report-research-integrity.md`.

This establishes offline correctness, not full narrative accuracy or launch qualification. Public snippets remain stale/misattribution risks; exact tuple deduplication does not detect semantic repetition. No model calls, production changes, merges, or report-deliverable edits were performed in this review.

## Production baseline (provided by task owner; not reprobed here)

Production already has the hot-installed **ddgs 9.16.0** dependency. Production **source remains at prior `a227286`**, not this fix. The new embedded dependency pin/lock makes that hot dependency durable across future frozen installs; dependency availability alone does not deploy prompt v1.13. Do not restart, drain, or synchronize production as part of PR preparation. Urgent report delivery is owned separately by the parent operator.

## Later release, only with separate authorization

1. Read the PR's exact remote head and require all applicable checks to pass. Merge only when explicitly authorized. Fetch the resulting full merge SHA; do not deploy an implicit branch tip or assume the pre-merge SHA survived squash.
2. Prepare a clean, isolated release checkout at that SHA. Review its complete diff against the deployed revision, use the CI-pinned pnpm toolchain, and retain the production `.env`. No database migration or web deployment is introduced by this fix.
3. Follow the canonical `worker/infra/deploy.sh`, not the older restart-only shortcut in the workspace release record. Supply `REVIEWED_REVISION` (full SHA), `AUDITLAYER_REPO_DIR` (clean release checkout), `DRAIN_HOOK` (that checkout's absolute `worker/infra/drain.sh`), and an operator-retained `DRAIN_TOKEN` UUID. The script tests an immutable archive, proves fleet drain, snapshots source/dependencies/profile/unit, synchronizes, performs `uv sync --frozen --no-dev --extra embedded`, checks parity/preflight and starts/verifies both workers before same-token resume. Stop on any failed gate; never release another operator's fence or roll back over active jobs.
4. Verify source/profile parity against the released archive, installed ddgs version, prompt version **1.13**, both `@1/@2` health endpoints (8788/8789), fresh logs and unpaused claim state. Legacy singleton/PDF units remain disabled. Keep the rollback snapshot.
5. Any later live-search/model qualification needs separate authorization. Inspect returned source identity and rendered claims, unsupported N/A scores, distinct supplied ideas and visible source limitations; a quality score alone is not evidence quality. Never replace or alter the urgent report artifact during release validation.
