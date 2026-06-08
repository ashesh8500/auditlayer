# scripts/

Legacy v1 smoke scripts (`e2e-smoke.py`, `smoke-check.sh`) remain for the archived
portal. **v2 agents should use the Makefile and `docs/agent-handoff.md` instead.**

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
