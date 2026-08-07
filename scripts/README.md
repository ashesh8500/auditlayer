# scripts/

The v1 smoke scripts (`e2e-smoke.py`, `smoke-check.sh`) for the archived
portal live in `legacy/scripts/`; `smoke-check.sh` is also kept here for `make smoke`.
**v2 agents should use the Makefile and `docs/agent-handoff.md` instead.**

## v2 quick commands (preferred)

```bash
make check-v2       # full offline QA
make dev-web        # Next.js local
make worker-run     # process audit queue
make deploy-prod    # Vercel
make vercel-logs    # prod function logs
make hermes-vm-sync # push secrets + CLI auth to Hetzner VM
```

See [`docs/agent-handoff.md`](../docs/agent-handoff.md) and [`docs/hermes-vm.md`](../docs/hermes-vm.md).

## ALM capability preflight (fail closed on auth/capability gaps)

One local, no-secret command distinguishes `ready`, `blocked`, and `unknown`
for Google OAuth, magic link delivery/template, preview-only test login,
Instagram OAuth, callback/support/privacy/data-deletion routes, required
environment-variable presence (names only, never values), worker commands,
DeepSeek V4 Flash policy features, migration/static checks, and recovery
guidance. External/live verification is always reported `UNKNOWN` with the
exact separate release-gate command; the preflight never claims a live login
or provider availability from fixtures.

```bash
# static contract tests (exit 0, final line ALM CAPABILITY PREFLIGHT TESTS PASSED)
python3 scripts/tests/test_check_alm_capabilities.py

# repository-ready environment -> exit 0; external/live checks UNKNOWN
python3 scripts/check_alm_capabilities.py --fixture scripts/fixtures/alm-capabilities/complete.json --json

# missing credentials -> nonzero fail-closed exit naming exact blocked capabilities
python3 scripts/check_alm_capabilities.py --fixture scripts/fixtures/alm-capabilities/missing.json --json

# production posture -> preview test login rejected by policy, exit nonzero
python3 scripts/check_alm_capabilities.py --fixture scripts/fixtures/alm-capabilities/production.json --json

# real process environment (presence-only)
python3 scripts/check_alm_capabilities.py --json
```

Exit codes: `0` repository-ready (external checks remain UNKNOWN),
`2` one or more capabilities blocked (fail closed before any mutation),
`3` usage/fixture error. Fixtures prove classification and redaction only —
never live provider availability or login success. Rollback is deleting the
script, fixtures, and tests; no live state is touched.
