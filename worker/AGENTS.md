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

## Prompt version (S0.6)

Every report carries a `prompt_version` so you can tell which generation rules
produced it — critical when diagnosing old reports after prompt template changes.

| Concern | Mechanism |
|---|---|
| **Version constant** | `PROMPT_VERSION` in `worker/auditlayer_worker/core.py` (currently `"0.7"`) |
| **When to bump** | Any edit to the prompt template, system messages, business constraints, master skeleton, or section frameworks |
| **Changelog** | Comment block above `PROMPT_VERSION` — add an entry on every bump |
| **Stored in DB** | `audits.prompt_version` column (migration `0017_prompt_version.sql`); backfilled for existing audits |
| **HTML footer** | `build_prompt_footer_line()` injects `Prompt v{version} · {timestamp} · ${cost} · {tokens}` after the report footer badge; replaces `<!-- PROMPT_VERSION_LINE -->` placeholder in master skeleton |
| **System prompts** | `WORKER_SYSTEM_PROMPT` and `REFINE_SYSTEM_PROMPT` include `prompt v{PROMPT_VERSION}` so the model knows what rules are active |
| **Worker writes** | `Gateway.update_audit(audit_id, prompt_version=PROMPT_VERSION)` on every generation and refinement |
| **Tests** | `worker/tests/test_prompt_version.py` (8 tests) + `worker/_verify_s06.py` (5 checks) |

### Bumping the version

1. Edit `PROMPT_VERSION` in `core.py`
2. Add a `# vX.Y — …` entry to the changelog comment block
3. Run `uv run python _verify_s06.py` (expect failure — version mismatch)
4. Update the expected version string in `_verify_s06.py` if it asserts `"0.6"`
5. Run `uv run pytest tests/test_prompt_version.py -v` — update any assertions that hardcode `"0.6"`
6. Push the migration for any schema changes, then deploy worker

---

## Hermes modes

| Mode | Use |
|---|---|
| `http` | Gateway already running (Hetzner / local laptop) |
| `subprocess` | Worker spawns `hermes gateway run` when queue has work |
| `inprocess` | Experimental — imports `run_agent.AIAgent` directly |

See `README.md` and `docs/deployment.md` § Hermes connectivity.
