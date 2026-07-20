# Agent Handoff — AuditLayer v2

**Read this first** when picking up work in this repo. It points to the authoritative
docs, live environment facts, quick commands, and known gaps so you do not rediscover
context.

**Also read:** `AGENTS.md` (repo-wide rules), `docs/architecture-contract.md`
(schema/enums — **code must match this**), `docs/deployment.md` (env + hosting).

---

## What exists today (June 2026)

| Piece | Status | Notes |
|---|---|---|
| **Web** (`web/`) | Deployed on Vercel | Target: https://auditlayermedia.com (fallback: https://web-delta-dun-29.vercel.app) |
| **Supabase** | Live project linked | Ref `eamnfmtkvglbnugzmotw`, region Singapore |
| **Worker** (`worker/`) | **hermes-vm** | Embedded Hermes (`deepseek-v4-flash`, `deepseek`); deployment is gated by `release-preflight` |
| **Stripe** | Configured code path | Starter/Pro via webhook; enterprise is founder-assigned in admin, without automatic Stripe seats/invoices |
| **Custom domain** | DNS pending | `auditlayermedia.com` on Vercel; Cloudflare A/CNAME not set yet — `make dns-vercel` |
| **MCP connector** | Read only implementation | Remote endpoint `/mcp`, Supabase OAuth 2.1 with dynamic registration, consent `/oauth/consent`; see `docs/mcp-connector.md` |
| **Magic link email** | Needs Resend **or** Supabase template fix | Google OAuth works; see § Auth below |
| **Legacy v1** (`legacy/`) | Archived | Do not extend |

**Founders (admin):** `ashesh8500@gmail.com` promoted; also promote `narin@auditlayer.com`
after first sign-in via SQL in `supabase/seed.sql`.

**Example completed audit:** `2bd18417-d79c-4caf-acbe-1b1b9769768e` (@iamsrk, `ready`).

---

## Architecture (30-second version)

```
Browser → Vercel (web/) → Supabase (Auth, Postgres, Storage, Realtime)
                              ↑ claim queued / upload HTML
                         worker/ (Python, long-running, Hermes)
                              ↓
                         Hermes Gateway :8642/v1 → social-media-audit skill
```

- **Web never calls Hermes.** Only the worker does.
- **Reports** live as private self-contained HTML artifacts; the web app serves
  them through authorized same-origin report and immersive-reader routes.
- **Live timeline:** Realtime + 4s polling on `/api/audits/[id]/live`.

---

## Quick commands (copy-paste)

Run from repo root unless noted.

### One-shot QA (no live tokens)

```bash
make check-v2          # web build+lint+typecheck+e2e + worker pytest (20 tests)
```

### Web app

```bash
make dev-web           # localhost:3000
cd web && pnpm e2e     # Playwright smoke (4 tests, no Supabase required)
cd web && vercel deploy --prod
cd web && vercel env ls
cd web && vercel logs https://web-delta-dun-29.vercel.app --limit 30
```

### Hermes VM (Hetzner)

```bash
make hermes-vm-sync      # sync worker/.env + Vercel auth (+ optional Supabase PAT)
make hermes-vm-ssh
make hermes-vm-status
make hermes-vm-worker    # systemd queue worker on VM
```

Guide: `docs/hermes-vm.md`. SSH host `hermes-vm` is in `~/.ssh/config`.

### Worker (laptop or VM)

```bash
make worker-run        # long-lived queue loop (needs worker/.env + Supabase)
make worker-once       # drain one queued audit and exit
cd worker && uv run python -m auditlayer_worker diagnose-hermes
cd worker && uv run python -m auditlayer_worker validate-hermes
cd worker && uv run python -m auditlayer_worker release-preflight
cd worker && uv run python -m auditlayer_worker demo --handle iamsrk --generator mock

```

### Supabase CLI (via npx — no global install)

```bash
make supabase-push     # db migrations to linked project
npx supabase@latest config push --yes   # auth config + email templates (needs SMTP on free tier)
npx supabase@latest gen types typescript --linked > web/src/lib/supabase/types.ts
```

### Hermes gateway (local laptop)

```bash
hermes gateway status
hermes gateway restart   # after ~/.hermes/.env has API_SERVER_ENABLED=true, API_SERVER_KEY, API_SERVER_PORT=8642
```

### Legacy v1 only (do not use for new work)

```bash
make check             # legacy v1 tests (legacy/src/auditlayer) — archived path
```

---

## Cofounder / E2E test recipe

1. **Start worker:** `make worker-run` (keep terminal open).
2. **Open:** https://web-delta-dun-29.vercel.app/login — use **Google** until Resend is configured.
3. **New audit:** `/audits/new` — try `iamsrk` or `instagram.com/hemalpatelphd`.
4. **Watch:** `/audits/{id}` — status should move `queued → running → ready` (~5–10 min with Hermes).
5. **Report:** HTML in the workspace viewer, immersive reader, share link, and direct download.

If timeline stuck at `queued`, worker is not running or lacks `SUPABASE_SERVICE_ROLE_KEY`.

---

## File map for agents (where to edit)

| Task | Start here |
|---|---|
| Intake rules, plan limits, platform detection | `web/src/lib/domain.ts`, `worker/auditlayer_worker/core.py` |
| Auth (magic link, OAuth, callback) | `web/src/app/login/`, `web/src/app/auth/callback/route.ts`, `web/src/lib/auth/magic-link-email.ts` |
| Billing / Stripe | `web/src/lib/actions/billing.ts`, `web/src/app/api/webhooks/stripe/route.ts` |
| Report viewer / reader proxy | `web/src/components/report-viewer.tsx`, `web/src/app/api/audits/[id]/report/route.ts` |
| Live timeline | `web/src/components/live-timeline.tsx`, `web/src/app/api/audits/[id]/live/route.ts` |
| Admin console | `web/src/app/admin/` |
| DB schema / RLS | `supabase/migrations/*.sql` → update `docs/architecture-contract.md` |
| Worker generation | `worker/auditlayer_worker/pipeline.py`, `generation.py`, `hermes.py` |
| Hermes prompts / guardrails | `worker/auditlayer_worker/core.py` (`build_worker_prompt`, `build_refinement_prompt`) |
| Email template (Supabase path) | `supabase/templates/magic_link.html` |
| Env var reference | `web/.env.example`, `worker/.env.example` |

---

## Auth — magic link gotchas

**Symptom:** User clicks email link → lands on `/login?error=auth`.

**Cause:** Default Supabase `{{ .ConfirmationURL }}` uses PKCE. Mail apps open links
without the browser's PKCE verifier cookie.

**Fix (pick one):**

1. **Resend (recommended):** Set `RESEND_API_KEY` + `AUTH_EMAIL_FROM` on Vercel.
   App sends branded links via `web/src/lib/auth/magic-link-email.ts` (`token_hash` flow).

2. **Supabase template:** Dashboard → Auth → Email Templates → Magic Link. Link must be:
   `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`
   Full HTML: `supabase/templates/magic_link.html`. CLI `config push` needs custom SMTP on free tier.

**Callback handler:** `web/src/app/auth/callback/route.ts` — supports both OAuth `code` and `token_hash`.

**Redirect allow-list:** Supabase → Auth → URL configuration must include
`https://<domain>/auth/callback` (and localhost for dev).

---

## Environment variables (minimum for real E2E)

**Vercel (`web/`):** see `web/.env.example`

| Variable | Required for |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Auth redirects, Stripe return URLs |
| `NEXT_PUBLIC_SUPABASE_*` | All authenticated features |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin actions, webhooks, signed URLs |
| `RESEND_API_KEY` + `AUTH_EMAIL_FROM` | Branded magic links |
| `STRIPE_*` | Paid plans |

**Worker (`worker/.env`):** see `worker/.env.example`

| Variable | Required for |
|---|---|
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Claim audits, upload reports |
| `HERMES_API_KEY` | Must match gateway `API_SERVER_KEY` |
| `HERMES_MODE` | production `inprocess` |
| `HERMES_MODEL` + `HERMES_PROVIDER` | production `deepseek-v4-flash` + `deepseek` |


**Precedence:** `worker/.env` overrides repo root `.env` when both exist.

---

## Intake policy (current)

- **No PhD/credential gate** for general media creators.
- `needs_review` only when **platform is unknown** (cannot normalize handle).
- Bare handles like `iamsrk` default to **Instagram** → `queued`.
- Limitations copy is general media/marketing language (not health-credential specific).
- Worker re-runs `evaluate_intake` on claim; keep `web` and `worker` rules in sync.

---

## QA gates before claiming stability

```bash
make check-v2
cd worker && uv run python -m auditlayer_worker diagnose-hermes   # on gateway host
cd worker && uv run python -m auditlayer_worker validate-hermes
```

Playwright e2e does **not** need Supabase. Do **not** call live Hermes in unit tests.

Full launch checklist: `docs/production-readiness-checklist.md`.

---

## Open work (prioritized)

1. **Resend** — magic link emails for non-Google users.
2. **Stripe webhook** — wire `STRIPE_WEBHOOK_SECRET` on Vercel + Stripe dashboard.
3. **Hetzner worker** — run `worker/infra/deploy.sh`; it fails before restart if tests, schema/RPC probes, or model validation fail.
4. **Custom domain** — finish Cloudflare DNS: `CLOUDFLARE_API_TOKEN=... make dns-vercel` (A `@` → `76.76.21.21`, CNAME `www` → `cname.vercel-dns.com`, proxy off).
5. **Enterprise billing** — access is assignable in admin; invoicing/seats remain a manual commercial process.

---

## Completed features

| Feature | Date | Notes |
|---|---|---|
| **S0.6 Prompt version footer** | 2026-07-12 | `PROMPT_VERSION` is stored in `audits.prompt_version`; the current generation contract is `0.7`. Every report HTML footer shows `Prompt vX · timestamp · $cost · tokens`. Bump the constant + changelog when prompt templates change. Migration `0017_prompt_version.sql`. Tests: `worker/tests/test_prompt_version.py` (8), `worker/_verify_s06.py` (5). Handoff: `worker/AGENTS.md` § Prompt version. |

---

## Do not

- Import from `legacy/` in `web/`, `worker/`, or `supabase/`.
- Call Hermes from the Next.js app.
- Store long-lived report URLs in the DB (re-sign per request).
- Skip `audit_events` on founder/admin state changes.
- Run live Hermes in `pytest` / `pnpm e2e`.
- Modify `~/.hermes/skills/.../social-media-audit/` from this repo — update docs here; skill is maintained separately.

---

## Domain / product docs (read before changing report content)

| Doc | Use when |
|---|---|
| `docs/product-spec.md` | UX, pricing, user flow |
| `docs/audit-methodology.md` | 15-section report framework |
| `docs/report-design-system.md` | HTML report CSS (inline only) |
| `docs/creator-strategy.md` | Growth knowledge base |
| `docs/comparison-frameworks.md` | Peer comparison rules |
| `docs/data-sources-and-billing.md` | Cost drivers, billing diagrams |

---

## Git

- Branch: `master`
- Commits: imperative, lowercase
- Identity (repo-local): `ashesh@asheshkaji.com` / `Ashesh Kaji`
- Only commit when the user asks
