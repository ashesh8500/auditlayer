# AuditLayer Hermes Worker

Standalone Python service that claims `queued` audits from Supabase, runs the
Hermes `social-media-audit` agent with guardrailed toolsets, streams a
granular `audit_events` timeline so the Next.js frontend can render a **live
agentic view**, renders the self-contained HTML + a PDF, uploads both to
private Supabase Storage, and records `tokens_in` / `tokens_out` / `cost_usd`
for billing.

The worker does **not** need a dedicated gateway VM. Hermes connectivity is
controlled by `HERMES_MODE` (see below). The Hetzner CX22 path remains the
recommended scale-out option when you want a always-on gateway + worker pair.

It is self-contained: all intake-calibration and Hermes prompt/guardrail logic
is copied into `auditlayer_worker/core.py`, so it has **no dependency** on the
legacy `src/auditlayer/` package (which is being archived into `legacy/`).

## Architecture

```
Supabase audits (status=queued)
   │  claim (status -> running, row-atomic)
   ▼
GenerationPipeline ── emits audit_events ──▶ Supabase Realtime ──▶ frontend timeline
   │  started → researching → metrics → peers → scoring → composing → uploaded → succeeded
   ├─ Hermes (HERMES_MODE):
   │     http       → existing Gateway api_server at HERMES_API_BASE
   │     subprocess → worker spawns `hermes gateway run`, same HTTP client
   │     inprocess  → run_agent.AIAgent directly (no HTTP)
   ├─ Storage bucket "reports"  (text/html, signed URL)
   ├─ Storage bucket "pdfs"     (application/pdf, headless Chromium or stub)
   └─ audits row: status=ready, report_url, pdf_url, tokens_in/out, cost_usd
```

### Hermes modes (`HERMES_MODE`)

| Mode | When to use | Notes |
|---|---|---|
| `http` (default) | Hetzner or any host with a persistent gateway | `HERMES_API_KEY` must match gateway `API_SERVER_KEY` |
| `subprocess` | Railway, Fly, a colocated app server, local dev | Spawns `hermes gateway run` on first job; stops after `HERMES_SUBPROCESS_IDLE_SECONDS` of empty queue |
| `inprocess` | Advanced / experimental | Imports `run_agent.AIAgent` from `HERMES_AGENT_ROOT`; no separate gateway process |

Audits run ~7 minutes and can consume 1M+ tokens. Plan for **≥2 GB RAM** and a
long-lived process — this worker cannot run on Vercel serverless functions.
Deploy it as a separate service (systemd, Fly machine, Railway worker, etc.).

## Install

```bash
cd worker
uv sync            # resolves httpx + supabase into a local venv
cp .env.example .env   # fill in SUPABASE_* and HERMES_API_KEY
```

`HERMES_API_KEY` **must** equal the Hermes Gateway `API_SERVER_KEY` when using
`http` or `subprocess` mode. Model and toolsets are read live from the
`app_settings` table when Supabase is connected (env values are the fallback).
Model selection is admin-only — never exposed to end users.

For `subprocess` mode you also need the `hermes` CLI on `PATH` (or
`HERMES_GATEWAY_BIN`) and a configured `~/.hermes` (provider auth, skills,
`api_server` platform with `API_SERVER_KEY`).

## Run

```bash
# Production queue worker (needs Supabase service-role key):
uv run python -m auditlayer_worker run

# Drain a single item and exit (useful for cron/debug):
uv run python -m auditlayer_worker run --once
```

### Standalone demo (no Supabase)

Runs a full generation against the local Hermes gateway and writes the HTML +
PDF to `AUDITLAYER_OUTPUT_DIR`, printing the event stream. If Hermes is
unreachable it prints the exact blocker + fix and falls back to deterministic
mock generation so the pipeline is still verified end-to-end.

```bash
uv run python -m auditlayer_worker demo \
  --handle @hemalpatelphd --goal growth \
  --context "UCSD professor, PhD"

# Force deterministic mock (no model tokens):
uv run python -m auditlayer_worker demo --handle @example --generator mock

# Require a real Hermes run (no fallback):
uv run python -m auditlayer_worker demo --handle @example --require-hermes
```

### Hermes diagnostics

```bash
uv run python -m auditlayer_worker diagnose-hermes   # reachability + auth + gateway state
uv run python -m auditlayer_worker validate-hermes   # tiny health-check completion
```

`diagnose-hermes` must show `tcp_reachable=true`, `auth_ok=true`,
`gateway_state=running`, `api_server_state=connected`, and `ok=true`. If it
fails with HTTP 401, set `HERMES_API_KEY` to the gateway `API_SERVER_KEY`. If
`tcp_reachable=false` / `api_server_state` is not `connected`, the gateway's
OpenAI-compatible api_server is not running at `HERMES_API_BASE` — run the
worker **on the host where the gateway api_server is enabled** (the Hetzner VM),
or enable it locally via `hermes gateway setup` + an `API_SERVER_KEY` and
`hermes gateway restart`.

## Shared data contract

| Table | Worker reads | Worker writes |
|---|---|---|
| `audits` | `handle, platform, goal, context, limitations, status=queued` | `status, report_path, report_url, pdf_url, tokens_in, tokens_out, cost_usd, model, milestone_label, admin_notes` |
| `audit_events` | — | one row per phase: `phase, event_type, detail, actor='worker'` |
| `refinements` | `section, instruction, status=queued` | `status (running/done/failed), error` |
| `app_settings` (`id=1`) | `hermes_model, hermes_api_base, enabled_toolsets, token_cap, cost_cap_usd` | — |

Status values: `draft, queued, running, ready, needs_review, blocked, failed`.
Event phases: `intake, queued, approved, started, researching, metrics, peers,
scoring, composing, uploaded, succeeded, failed, refinement`.

Storage buckets (private): `reports` (text/html), `pdfs` (application/pdf).

### Intake gating (on claim)

On claim, the worker re-applies `evaluate_intake` (platform detection, milestone
tiering, limitations). **No credential/PhD gate** — general media creators are
queued normally. `needs_review` only when platform stays `unknown`; bare handles
like `iamsrk` default to Instagram. Keep rules aligned with `web/src/lib/domain.ts`.

## Refinements

Section-scoped refinements reuse `refine_section` + `replace_section` with the
same guardrails (no scripts, fragment-only output, no pricing/prompt/config
edits). The worker downloads the current report from the `reports` bucket,
replaces exactly one `<section>`, and re-uploads.

## Deploy

### Option A — Hetzner (always-on gateway + worker)

Set `HERMES_MODE=http` and run the gateway via systemd (`hermes gateway start`).
See `infra/auditlayer-worker.service`. Copy the repo to `/opt/auditlayer`, fill
`/opt/auditlayer/worker/.env`, then:

```bash
sudo cp worker/infra/auditlayer-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now auditlayer-worker
journalctl -u auditlayer-worker -f
```

### Option B — Colocated / ephemeral gateway (no dedicated VM)

Set `HERMES_MODE=subprocess` on any long-lived host that has Hermes installed
(same machine as your ops box, a Fly/Railway worker, etc.). The worker starts
the gateway only when the queue has work and tears it down after idle timeout.

```bash
# worker/.env
HERMES_MODE=subprocess
HERMES_SUBPROCESS_IDLE_SECONDS=120
```

Install Chromium for PDF rendering (`apt-get install -y chromium`) and set
`AUDITLAYER_PDF_MODE=browser` (default). Without Chromium the worker emits a
clearly-marked stub PDF and continues.

## CLI reference

| Command | Purpose |
|---|---|
| `run` | Long-lived queue loop |
| `run --once` | Process one audit/refinement and exit |
| `demo --handle X --generator mock` | Offline pipeline smoke |
| `diagnose-hermes` | Gateway reachability + auth |
| `validate-hermes` | Tiny live completion |
| `regen-pdf --audit-id <uuid>` | Re-render PDF from stored HTML |

From repo root: `make worker-run`, `make worker-once`.

## Tests

```bash
uv run pytest          # 20 offline tests — mock generator, guardrails, calibration, PDF
make worker-check      # from repo root
```
