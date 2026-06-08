# AGENTS.md — `worker/` (Hermes worker)

Parent: [`../AGENTS.md`](../AGENTS.md) · Handoff: [`../docs/agent-handoff.md`](../docs/agent-handoff.md)

---

## Role

Long-running Python service that:

1. Claims `queued` audits (and `queued` refinements) from Supabase
2. Runs Hermes `social-media-audit` generation with guardrails
3. Streams `audit_events` phases for the live UI
4. Uploads HTML + PDF to private Storage
5. Records `tokens_in`, `tokens_out`, `cost_usd`

**Self-contained** — logic in `auditlayer_worker/core.py`. Do not import `legacy/`.

---

## Quick commands

```bash
make worker-run
make worker-once
cd worker && uv run pytest
cd worker && uv run python -m auditlayer_worker diagnose-hermes
cd worker && uv run python -m auditlayer_worker demo --handle iamsrk --generator mock
cd worker && uv run python -m auditlayer_worker regen-pdf --audit-id <uuid>
```

---

## Key files

| File | Purpose |
|---|---|
| `core.py` | Intake (`evaluate_intake`), prompts, HTML guardrails |
| `pipeline.py` | Claim → generate → upload → status transitions |
| `generation.py` | Mock vs Hermes generators |
| `hermes.py` | HTTP client to gateway `/v1/chat/completions` |
| `hermes_runtime.py` | `HERMES_MODE`: http / subprocess / inprocess |
| `supabase_client.py` | Claim, events, storage upload |
| `pdf.py` | `browser` (Chromium) vs `stub` PDF |
| `config.py` | Env loading — `worker/.env` overrides repo `.env` |

---

## Rules

- Never call Hermes from `web/`.
- Keep `evaluate_intake` aligned with `web/src/lib/domain.ts`.
- Tests use mock generator only — no live tokens in pytest.
- `HERMES_API_KEY` must match gateway `API_SERVER_KEY` for http/subprocess modes.
- Emit `audit_events` for every phase change; `actor='worker'`.

---

## Hermes modes

| Mode | Use |
|---|---|
| `http` | Gateway already running (Hetzner / local laptop) |
| `subprocess` | Worker spawns `hermes gateway run` when queue has work |
| `inprocess` | Experimental — imports `run_agent.AIAgent` directly |

See `README.md` and `docs/deployment.md` § Hermes connectivity.
