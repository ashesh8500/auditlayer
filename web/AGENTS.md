# AGENTS.md — `web/` (Next.js portal)

Parent rules: [`../AGENTS.md`](../AGENTS.md) and [`../docs/agent-handoff.md`](../docs/agent-handoff.md).

---

## Stack

- Next.js 16 App Router, TypeScript, Tailwind 4, shadcn/ui
- Supabase Auth + Postgres (via `@supabase/ssr`)
- Stripe Checkout + Customer Portal + webhook
- Deployed on **Vercel** (root directory `web/`)

**This app does not call Hermes for report generation.** Report generation is the Python worker's job. The admin-only report workspace may call the restricted canonical `alm` operator through the API-key-protected server-side proxy; client code must never receive that key.

---

## Quick commands

```bash
cd web
pnpm dev              # http://localhost:3000
pnpm build && pnpm lint && pnpm typecheck && pnpm e2e
vercel deploy --prod
vercel env pull       # sync prod env → .env.local
```

From repo root: `make dev-web`, `make web-check`, `make deploy-prod`.

---

## Key routes

| Path | Purpose |
|---|---|
| `/` | Landing + pricing |
| `/login` | Google OAuth + magic link |
| `/auth/callback` | OAuth + magic link session (route handler) |
| `/dashboard` | Client audit list |
| `/audits/new` | 3-question intake wizard |
| `/audits/[id]` | Live timeline + report viewer + refinements |
| `/admin` | Founder console (requires `profiles.role=admin`) |
| `/api/webhooks/stripe` | Stripe → plan updates |
| `/api/audits/[id]/report` | Same-origin HTML proxy (iframe-safe) |
| `/api/audits/[id]/live` | Polling fallback for timeline |

Session refresh + protected-route redirect: `proxy.ts` → `src/lib/supabase/middleware.ts`.

---

## Auth

- **Google OAuth:** works in production.
- **Magic link:** requires `RESEND_API_KEY` on Vercel **or** Supabase email template
  with `token_hash` link (see `src/lib/auth/magic-link-email.ts`,
  `../supabase/templates/magic_link.html`).
- **Admin:** `profiles.role = 'admin'` — not middleware-only; re-check in server components.
- **Service role:** `src/lib/supabase/admin.ts` — Stripe webhook, refinement enqueue,
  admin writes only. Never import in client components.

---

## Conventions

- Light theme, teal `#0d9488` — see `docs/report-design-system.md` for reports; portal uses CSS vars in `globals.css`.
- Three screens max for intake — do not add wizard steps.
- Intake logic: `src/lib/domain.ts` — keep aligned with `worker/auditlayer_worker/core.py`.
- Every admin action should insert `audit_events`.
- Build must succeed **without** env vars (landing + login only).

---

## Tests

```bash
pnpm e2e    # 4 Playwright smokes — no Supabase credentials needed
```

Do not add tests that call live Hermes or spend model tokens.

---

## Env

Copy `web/.env.example` → `.env.local`. Required for full app:

`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`,
optional `RESEND_API_KEY` + `AUTH_EMAIL_FROM`, Stripe vars for billing.
