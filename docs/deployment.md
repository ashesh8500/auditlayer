# Deployment

**Agent handoff:** [`agent-handoff.md`](agent-handoff.md) has live URLs, quick commands, and open work.

## Quick reference

```bash
make check-v2                    # offline QA (web + worker)
make dev-web                     # local portal
make worker-run                  # process queued audits
make deploy-prod                 # Vercel production
make supabase-push               # apply migrations
npx supabase@latest config push --yes   # auth/email config (SMTP required on free tier)
```

| What | Where |
|---|---|
| Prod web | https://web-delta-dun-29.vercel.app |
| Vercel project | `ashesh8500s-projects/web` (root: `web/`) |
| Supabase ref | `eamnfmtkvglbnugzmotw` |
| Supabase dashboard | https://supabase.com/dashboard/project/eamnfmtkvglbnugzmotw |
| Google OAuth callback | `https://<domain>/auth/callback` |
| Stripe webhook | `https://<domain>/api/webhooks/stripe` |

---

AuditLayer v2 runs as three cooperating pieces:

| Component | Host | Role |
|---|---|---|
| **Web app** (`web/`) | Vercel | Next.js portal — auth, intake, billing, live stream, report viewer |
| **Control plane** (`supabase/`) | Supabase Cloud | Postgres + RLS + Auth + Storage + Realtime |
| **Hermes worker** (`worker/`) | Long-lived host (Hetzner CX22, Fly, Railway, colocated server) | Claims queued audits, runs generation, uploads artifacts |

The authoritative schema and enums live in `docs/architecture-contract.md`.

---

## 1. Supabase

1. Create a Supabase project (or link an existing one).
2. Apply migrations in order:

   ```bash
   python scripts/check-migrations.py
   supabase db push
   # or run SQL from supabase/migrations/*.sql in the dashboard SQL editor
   ```

3. Run `supabase/seed.sql` (inserts `app_settings` row; documents admin promotion).
4. After Ashesh/Narin first sign-in, promote founders:

   ```sql
   update public.profiles
   set role = 'admin'
   where email in ('ashesh@asheshkaji.com', 'narin@auditlayer.com');
   ```

5. Enable Auth providers in the Supabase dashboard:
   - **Email** (magic link)
   - **Google OAuth** — set redirect URL to `https://<your-domain>/auth/callback`
   - **Magic link email (production):** Supabase's default mailer is branded
     "Supabase" and uses a PKCE link that fails when opened from mail apps.
     Recommended rollout path:
     1. Create a [Resend](https://resend.com) API key and verify
        `auditlayer.com` (or your rollout domain).
     2. Set `RESEND_API_KEY` and `AUTH_EMAIL_FROM=AuditLayer <noreply@auditlayer.com>`
        in Vercel (server env). The app then sends branded magic links itself.
     3. **Or** configure custom SMTP in Supabase → Authentication → SMTP, then
        push `supabase/templates/magic_link.html` via `supabase config push`
        (uses `token_hash` server verification — see `web/src/app/auth/callback/route.ts`).
6. Confirm private Storage buckets `reports` and `pdfs` exist (see `0003_storage.sql`).
7. Enable **Realtime** on `audit_events` and `audits` for the live generation stream.

---

## 2. Vercel (web app)

The project is linked as `ashesh8500s-projects/web` (root directory: `web/`).

```bash
cd web
vercel link          # once per machine
vercel env pull      # optional: sync env to .env.local
vercel deploy        # preview
vercel deploy --prod # production (after env + DNS)
```

Set these in **Vercel → Project → Settings → Environment Variables** (see also `web/.env.example`):

| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | All | `https://auditlayer.com` in prod |
| `NEXT_PUBLIC_SUPABASE_URL` | All | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All | Publishable anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Service role — never expose to browser |
| `STRIPE_SECRET_KEY` | Server only | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Server only | From Stripe webhook endpoint |
| `STRIPE_PRICE_STARTER` | Server only | Recurring price ID ($30/mo) |
| `STRIPE_PRICE_PRO` | Server only | Recurring price ID ($50/mo) |
| `RESEND_API_KEY` | Server only | Branded magic-link email (recommended) |
| `AUTH_EMAIL_FROM` | Server only | e.g. `AuditLayer <noreply@auditlayer.com>` |

**Stripe webhook:** point at `https://<your-domain>/api/webhooks/stripe`. Subscribe to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.

**DNS:** point the Cloudflare domain (A/CNAME) at Vercel per Vercel's custom-domain wizard.

The app builds without secrets (landing + login render). Auth, dashboard, billing, and reports require the env vars above.

---

## 3. Hermes worker (separate from Vercel)

The worker is a **long-running process** (~7 min per audit, 1M+ tokens). It
cannot run inside Vercel serverless functions. Deploy it on any host with
≥2 GB RAM and network access to Supabase + your inference provider.

### Hermes connectivity (`HERMES_MODE`)

| Mode | Deployment pattern |
|---|---|
| `http` | Worker talks to an already-running gateway api_server — alternate deployment |
| `subprocess` | Worker spawns `hermes gateway run` on first queued job, stops after idle timeout — **no dedicated gateway VM** |
| `inprocess` (production) | Worker imports `run_agent.AIAgent` directly; no loopback gateway hop |

```bash
cd worker
cp .env.example .env   # fill SUPABASE_* and HERMES_* (see mode-specific notes)
uv sync --extra embedded --extra dev
uv run python -m auditlayer_worker diagnose-hermes
uv run python -m auditlayer_worker validate-hermes
```

**Option A — Hetzner CX22 (production, embedded Hermes)**

Set `HERMES_MODE=inprocess`, `HERMES_MODEL=deepseek-v4-flash`, and
`HERMES_PROVIDER=deepseek`. `worker/infra/deploy.sh` runs tests, migration
contract checks, non-mutating production schema/RPC probes, and a real model
validation before restarting systemd. A failed gate leaves the service untouched.

From the **laptop**, sync credentials and bootstrap the VM:

```bash
make hermes-vm-sync      # worker/.env + Supabase/Vercel auth
make hermes-vm-worker    # systemd auditlayer-worker
make hermes-vm-status
```

On the VM, use `worker/infra/auditlayer-worker.vm.service` (Syncthing path +
user `asheshkaji`). Full guide: [`docs/hermes-vm.md`](hermes-vm.md).

```bash
journalctl -u auditlayer-worker -f
```

**Option B — Colocated / ephemeral gateway (no dedicated VM)**

Set `HERMES_MODE=subprocess` on a Fly machine, Railway worker, or any server
where Hermes CLI + `~/.hermes` config are installed. The worker manages gateway
lifecycle; `HERMES_API_KEY` must still match `API_SERVER_KEY` in gateway config.

**Option C — In-process (advanced)**

Set `HERMES_MODE=inprocess` and `HERMES_AGENT_ROOT` to the hermes-agent checkout.
No HTTP gateway required; couples the worker tightly to the Hermes Agent install.

Worker env vars: see `worker/.env.example`. Token pricing for cost display on audits uses:

- `AUDITLAYER_PRICE_IN_PER_MTOK` (default `0.27`)
- `AUDITLAYER_PRICE_OUT_PER_MTOK` (default `1.10`)

### PDF export (`AUDITLAYER_PDF_MODE`)

| Mode | When to use |
|---|---|
| `browser` (recommended) | Host has Chromium or Google Chrome — renders the stored HTML report to a real PDF via headless `--print-to-pdf` |
| `stub` | CI/local QA without a browser binary — emits a valid minimal placeholder PDF |

On macOS with Chrome installed, set `AUDITLAYER_PDF_MODE=browser` (default). Optionally pin
`CHROMIUM_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
On Hetzner, install `chromium` and keep `AUDITLAYER_PDF_MODE=browser`.

Re-render a stored report after switching modes:

```bash
cd worker
uv run python -m auditlayer_worker regen-pdf --audit-id <uuid>
```

---

## 4. Hermes verification

| Command | Where | Required evidence |
|---|---|---|
| `uv run python -m auditlayer_worker diagnose-hermes` | Hetzner (or local gateway) | `tcp_reachable=true`, `auth_ok=true`, `api_server_state=connected`, `ok=true` |
| `uv run python -m auditlayer_worker validate-hermes` | Same host | `ok=True`, `skipped=False` |
| `uv run python -m auditlayer_worker demo --generator mock` | Anywhere | Offline pipeline smoke (no tokens) |

Real `deepseek-v4-flash` generation requires Hermes (`http` or `subprocess` mode with
a valid `HERMES_API_KEY` matching `API_SERVER_KEY`, or `inprocess` with a local
hermes-agent install). Local laptops without Hermes should use
`--generator mock` for QA.

---

## 5. QA gates

```bash
make check-v2          # preferred — web build+lint+typecheck+e2e + worker pytest
make vercel-logs       # recent production function logs
```

Individual steps:

```bash
cd web && pnpm e2e
cd worker && uv run pytest
cd worker && uv run python -m auditlayer_worker diagnose-hermes
cd worker && uv run python -m auditlayer_worker validate-hermes
cd worker && uv run python -m auditlayer_worker release-preflight
uv run python scripts/check-migrations.py
```

Legacy v1 (archived): `make check`

See `docs/production-readiness-checklist.md` for the full pre-launch gate list.
