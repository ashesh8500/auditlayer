# Production Portal

> **v2 (current):** The production portal is the Next.js app in `web/`, deployed on
> Vercel, backed by Supabase. See `docs/architecture-contract.md`,
> `docs/deployment.md`, and `AGENTS.md`. The Hermes generation engine runs on the
> Hetzner worker in `worker/`.
>
> **v1 (archived):** The stdlib WSGI + SQLite portal lives in `legacy/`. The
> sections below describe v1 behavior for reference only.
> PDF export described below is legacy-only and is not a current product or roadmap feature.

---

## v1 reference (archived)

The archived v1 portal lives under `legacy/` (`legacy/src/auditlayer/`). It was intentionally dependency-light: stdlib WSGI, SQLite, Jinja2 templates, and an optional Hermes HTTP adapter. Run the v1 commands below from the repo root with `PYTHONPATH=legacy/src` (or `cd legacy` and use `PYTHONPATH=src`).

## What It Covers

- Client intake with the required three questions: handle, goal, context
- Founder/admin tracking for clients, onboarding state, audit status, limitations, and report links
- Token-protected founder/admin and worker routes
- Client-safe audit status pages with progress events and limitation disclosures
- Magic-link client login backed by SQLite auth tokens and HTTP-only session cookies
- Scoped client dashboard showing only that client's audits and usage
- Report access restricted to the owning client session or founder/admin token
- Section-scoped report refinement with prompt/backend guardrails
- Outbound delivery abstraction for magic links and report-ready notifications
- Local JSONL email outbox for deterministic QA; SMTP mode for production delivery
- Append-only event trail for intake, review, generation, failures, and worker idles
- Founder actions for approving, running, blocking, and annotating audits, plus client onboarding status updates
- Business rule enforcement for plan limits, credential uncertainty, and same-tier comparison policy
- Explicit UI disclosure for known data limitations, especially Instagram login-walled collection
- Durable SQLite storage for clients and audits
- Stripe webhook ingestion for checkout, subscription, and payment failure events
- Stripe Checkout creation for Starter and Pro self-serve upgrades
- Founder-visible billing status, paid client count, Stripe IDs, and current period end
- Deterministic mock report generation for QA and demos
- Configurable Hermes generation via OpenAI-compatible `/chat/completions`
- Production config validation, systemd unit examples, and smoke-check script
- PDF export using Chromium headless in production and deterministic stub mode for QA
- Global security headers, generic 500 responses, CSRF checks on authenticated browser POSTs, and a configurable request body limit

## Run Locally

```bash
python3 -m pip install -r legacy/requirements.txt
PYTHONPATH=legacy/src python3 -m auditlayer serve
```

Open `http://127.0.0.1:8000`.

Founder admin is protected by `AUDITLAYER_ADMIN_TOKEN`:

```text
http://127.0.0.1:8000/admin?token=<token>
```

For scripted calls, pass `X-AuditLayer-Admin-Token: <token>`.

The founder admin table preserves authentication through report/PDF links when token-query access is used. Audit rows support approve, run, block, and note actions. Client rows support onboarding status updates so founder operations can track leads through login, review, paid status, report readiness, refinement, block, or churn-risk states without editing SQLite directly.

Clients can request a magic link at `/login`. Local development renders the link directly for QA. Production should send the generated link via the email provider before hiding the inline development link.

## Email Delivery

Default delivery mode is a JSONL outbox:

```env
AUDITLAYER_EMAIL_MODE=outbox
AUDITLAYER_EMAIL_OUTBOX=var/email-outbox.jsonl
```

Each sent message is appended as one JSON object containing recipient, subject, text/html body, and optional attachment path. This makes local QA deterministic and avoids sending real email during tests.

For production SMTP:

```env
AUDITLAYER_EMAIL_MODE=smtp
AUDITLAYER_EMAIL_FROM=AuditLayer <noreply@yourdomain.com>
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=...
SMTP_PASSWORD=...
SMTP_USE_TLS=true
```

The service currently sends:

| Trigger | Delivery |
|---|---|
| Magic-link login request | Login email with expiring verification link |
| Report generation success | Report-ready email with report link and HTML attachment path |

## Configuration

Copy `.env.example` into the process environment before running.

```env
AUDITLAYER_DB_PATH=var/data/auditlayer.db
AUDITLAYER_REPORT_DIR=var/reports
AUDITLAYER_GENERATOR=mock
AUDITLAYER_ADMIN_TOKEN=change-me-before-production
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SECRET_KEY=sk_live_or_test
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_SUCCESS_URL=https://yourdomain.com/dashboard?checkout=success
STRIPE_CANCEL_URL=https://yourdomain.com/dashboard?checkout=cancelled
AUDITLAYER_PDF_MODE=stub
AUDITLAYER_PDF_DIR=var/pdfs
CHROMIUM_PATH=
AUDITLAYER_MAX_REQUEST_BYTES=1048576
```

For production Hermes generation:

```env
AUDITLAYER_GENERATOR=hermes
HERMES_API_BASE=http://127.0.0.1:8642/v1
HERMES_API_KEY=...  # must match Hermes Gateway API_SERVER_KEY
HERMES_MODEL=deepseek-v4-flash
```

The Hermes adapter asks the worker to load the `social-media-audit` skill, use web/browser/x_search toolsets, and return a complete self-contained HTML report inline. The portal persists the returned report as `var/reports/<audit_id>.html`.

## PDF Export

Clients and founders can export a ready report from `/reports/<audit_id>/pdf`. Access control is identical to HTML report viewing: the owner session or founder/admin token is required.

Modes:

| Mode | Use |
|---|---|
| `stub` | Deterministic local/CI artifact that starts with `%PDF-1.4`; does not require Chromium |
| `browser` | Uses Chromium/Chrome headless with `--print-to-pdf` |

Production browser mode requires:

```env
AUDITLAYER_PDF_MODE=browser
CHROMIUM_PATH=/usr/bin/chromium
```

PDF exports are written to `AUDITLAYER_PDF_DIR` and logged as `pdf_exported`.

## Worker Operation

Run the oldest queued audit once:

```bash
PYTHONPATH=legacy/src python3 -m auditlayer run-next
```

Or call the protected HTTP worker endpoint:

```bash
curl -X POST \
  -H "X-AuditLayer-Admin-Token: $AUDITLAYER_ADMIN_TOKEN" \
  http://127.0.0.1:8000/worker/run-next
```

This is deliberately single-job execution. Use systemd timers, cron, or a process supervisor for repeated execution on the CX22 VM.

For a continuously supervised worker:

```bash
PYTHONPATH=legacy/src python3 -m auditlayer worker --interval 15
```

## Production Deployment

Systemd examples live in `infra/systemd/`:

- `auditlayer-web.service`
- `auditlayer-worker.service`
- `auditlayer.env.example`

Before starting services, validate configuration:

```bash
PYTHONPATH=legacy/src python3 -m auditlayer check-config
```

When `AUDITLAYER_GENERATOR=hermes`, validate the Hermes API path before accepting paid traffic:

```bash
make diagnose-hermes
PYTHONPATH=legacy/src python3 -m auditlayer validate-hermes
```

`diagnose-hermes` checks local Hermes Gateway state and TCP reachability without spending model tokens. `validate-hermes` then sends a tiny OpenAI-compatible `/chat/completions` request to the configured Hermes endpoint and verifies that the configured model responds. It does not run a full audit.

After services start, run:

```bash
AUDITLAYER_ADMIN_TOKEN=... scripts/smoke-check.sh http://127.0.0.1:8000
```

The health endpoint returns metrics, queue depth, database latency, report/outbox path checks, and non-secret configuration status. It returns HTTP 503 when required production config or writable paths are invalid. Hermes connectivity is validated by the explicit `validate-hermes` command rather than every health request, so health checks do not spend model tokens.

All portal responses include defensive browser headers (`nosniff`, `DENY` framing, no-referrer, permissions policy, and a restrictive CSP compatible with the inline report styling model). Unhandled errors return a generic `500` body while details go to server logs. Requests larger than `AUDITLAYER_MAX_REQUEST_BYTES` are rejected with HTTP `413` before parsing form or webhook bodies.

Authenticated browser POSTs use signed CSRF tokens derived from the active client session or founder query-token context. This covers logout, self-serve billing checkout, section refinements, and founder admin actions. Public intake/login posts remain open by design; Stripe webhooks are protected by Stripe signature verification instead.

## Status Model

| Status | Meaning |
|---|---|
| `queued` | Accepted and ready for generation |
| `needs_review` | Founder should confirm credential fit, platform, or data context before spending generation cost |
| `running` | Generation in progress |
| `ready` | Report generated and viewable |
| `blocked` | Hard stop, usually invalid handle or plan limit |
| `failed` | Generation failed; admin notes include the error |

Every status transition writes an event row. The admin dashboard shows recent events so founder operations can be audited without reading logs.

## Report Refinement

Clients can request refinements from the audit status page after a report is `ready`. This is intentionally not general chat:

- It requires the owning client session.
- It accepts only known report section names.
- It rejects requests for prompts, backend configuration, token budgets, pricing changes, Stripe changes, shell execution, or other users' reports.
- It stores every request in `refinements` and logs events for started, succeeded, failed, and rejected refinements.
- It replaces only the selected HTML section in the saved report file.

Hermes mode sends a scoped refinement prompt and expects a single HTML fragment back. Mock mode writes a deterministic fragment so local QA can verify the workflow.

## Billing Webhooks

Clients can start self-serve billing from `/dashboard`, which posts to `/billing/checkout` and redirects to Stripe Checkout. The route requires a valid client session and supports the `starter` and `pro` plans. Enterprise remains a sales-led plan.

Stripe should POST webhook events to `/webhooks/stripe`.

Set `STRIPE_WEBHOOK_SECRET` from the Stripe endpoint signing secret. The portal verifies the `Stripe-Signature` header with HMAC SHA-256 and rejects invalid or stale payloads.

Supported events:

| Event | Effect |
|---|---|
| `checkout.session.completed` | Creates or updates the client, marks subscription active, records plan and Stripe IDs |
| `customer.subscription.created` | Updates plan/status/period from subscription metadata |
| `customer.subscription.updated` | Updates plan/status/period from subscription metadata |
| `customer.subscription.deleted` | Downgrades to free and marks canceled |
| `invoice.payment_failed` | Marks subscription `past_due` |

Plan inference prefers Stripe metadata `auditlayer_plan` or `plan`. If metadata is missing, the app falls back to scanning the event payload for `enterprise`, `pro`, or `starter`.

## QA

```bash
PYTHONPATH=legacy/src pytest
```

The test suite covers intake normalization, credential review behavior, plan caps, tiered milestone logic, persistence, report generation, report-ready delivery, section-scoped refinement, refinement guardrails, admin auth, worker execution, magic-link auth, Stripe signature verification, billing updates, and the WSGI health/intake surface.

Before deploy, run the full local gate:

```bash
make check
```

This runs:

- unit/integration tests
- in-process E2E smoke workflow covering intake, login, dashboard, worker generation, report access, PDF export, refinement, and admin access
- config validation
- Hermes validation command in the configured mode

## Known Remaining Production Work

- Production SMTP credentials and deliverability have not been validated from the deployment host.
- Admin uses a shared token; replace with Cloudflare Access or a founder identity provider before broad production access.
- Browser-mode PDF export requires Chromium to be installed and validated on the deployment host.
- Live Hermes validation must pass on the deployment host with `AUDITLAYER_GENERATOR=hermes`.
