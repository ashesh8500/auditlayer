# ALM Release-Evidence Packet

Canonical, non-mutating founder-facing release evidence for AuditLayerMedia.
Programs P7 (trust, privacy, founder operability), P12 (safe release); stories
F3 (operate without SQL), F6 (release safely), F9 (see system health);
developer stories D3 (fail closed), D8 (leave evidence).

## Command

```bash
python3 scripts/build_alm_release_evidence.py [--json] [--output PATH] \
  [--preview-evidence PATH] [--migration-evidence PATH] [--canary-evidence PATH] \
  [--production-evidence PATH] [--approval-evidence PATH] [--rollback-evidence PATH]
```

Default behavior reads **only local Git state** (read-only git commands) and the
two static repository contracts, which are reused by subprocess — never copied:

- `scripts/check-migrations.py` (static migration contract)
- `scripts/check_alm_capabilities.py --json` (capability preflight)

The packet projects the observed state onto the operating-model promotion
machine (`docs/improvements/OPERATING-MODEL.md`):

```
integrated_local → preview_candidate → preview_verified → release_ready
  → production_canary → promoted | rolled_back | held
```

This tool is a **read-only evidence projector, not a release executor and not a
second state machine**: it cannot deploy, migrate, approve, or mutate anything.
Exit 0 means the packet is internally valid — it is NOT a release-ready claim.
Read the per-state classifications for that.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Packet generated and internally valid (schema-valid, classifications consistent). |
| 3 | Usage / fixture / evidence-file error (missing file, invalid JSON, schema mismatch). |

## Evidence files (explicit, schema-validated, commit-compatible, redacted)

Every external boundary requires an explicit evidence file pinned to the
current HEAD. Absent evidence stays `UNKNOWN` with the exact correction
command; stale, incompatible-commit, or failing evidence stays `BLOCKED` —
never success.

Common schema (`schema_version: 1`):

```json
{
  "schema_version": 1,
  "evidence_type": "preview | migration | canary | production | approval | rollback",
  "commit": "<40-hex sha of HEAD>",
  "observed_at": "2026-08-07T10:00:00Z",
  "operator": "release-gate",
  "checks": [{"name": "desktop flow", "result": "pass"}]
}
```

- `approval` additionally requires `decision` (`approved` | `held` | `rejected`)
  and `founder`. A `held`/`rejected` decision blocks canary and promotion; it
  never becomes success. This tool cannot grant approval — it only reports an
  explicit record, whose authenticity is not locally provable.
- `rollback` may record `executed: true` (+ `executed_at`, `reason`); readiness
  evidence is never treated as an executed rollback.
- **Redaction:** evidence is allowlisted by schema. Unknown fields (for example
  `api_key`, `token`) are dropped and only their names are reported in
  `dropped_fields`. Values are never echoed, environment values are never read,
  and git remotes are never read.

## State projection rules

| State | Verified only when |
|---|---|
| `integrated_local` | Worktree clean, synced with the origin reference (`origin/improve/alm-recursive-2026-08-07` or the configured upstream), and both local static checks ready. |
| `preview_candidate` | `integrated_local` + verified `preview` evidence. |
| `preview_verified` | `preview_candidate` + verified `preview` evidence (the single explicit preview block projects onto both preview gates). |
| `release_ready` | `preview_verified` + verified `migration` and `rollback` (readiness) evidence. |
| `production_canary` | `release_ready` + verified `canary` evidence and explicit `approved` founder decision. |
| `promoted` | `production_canary` + verified `production` (post-deploy), `rollback` (readiness), and explicit `approved` founder decision. |
| `rolled_back` | Explicit `rollback` evidence with `executed: true`. |
| `held` | Explicit `held` decision, or a blocked promotion gate. |

An `UNKNOWN` lower gate propagates as `UNKNOWN` (missing evidence is not a
concrete failure); a `BLOCKED` gate propagates as `BLOCKED`. Production can
never be classified `promoted` without compatible preview, migration, canary,
post-deploy, rollback, and explicit founder-approval evidence.

## Fixtures and tests

```bash
python3 scripts/tests/test_build_alm_release_evidence.py
```

Covers every declared state plus clean/current, dirty, ahead/behind,
stale-evidence, mismatched-commit, missing-check, preview-only,
migration-unknown, canary-unknown, approval-absent, and rollback-incomplete
cases, redaction, non-mutation, and usage errors. Fixtures
(`scripts/fixtures/alm-release-evidence/`) prove packet classification and
redaction only — never a live preview, migration, canary, or production
promotion.

## Safety boundary

Local Python, read-only git commands, static repository contracts, and
synthetic fixtures only. No network product call, auth flow, browser, linked
database, service role, customer data, deployment, service action, migration,
Stripe action, or live report token spend. Nothing is written unless `--output`
is supplied. Rollback is deletion/reversion of the generator, fixtures, and
tests; no live state is touched.
