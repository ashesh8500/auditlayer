# AuditLayer Web (`web/`)

Next.js portal for AuditLayer v2 — auth, intake, billing, live generation stream,
report viewer, and founder admin. Deployed on Vercel.

**Agent docs:** [`AGENTS.md`](./AGENTS.md) · [`../docs/agent-handoff.md`](../docs/agent-handoff.md)

---

## Quick start

```bash
cd web
cp .env.example .env.local   # fill Supabase keys for auth/dashboard
pnpm install
pnpm dev                     # http://localhost:3000
```

Without `.env.local`, the landing page and login UI still build and render.

---

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Local dev server |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm e2e` | Playwright smoke (starts dev server) |
| `pnpm e2e:ui` | Playwright UI mode |

From repo root: `make web-check` runs install + build + lint + typecheck + e2e.

---

## Deploy

```bash
vercel link          # once per machine — project: ashesh8500s-projects/web
vercel env pull      # optional
vercel deploy --prod
```

Prod URL (current): https://web-delta-dun-29.vercel.app

Env vars: `web/.env.example` and `docs/deployment.md`.

---

## Structure

```
src/app/
  page.tsx              # landing
  login/                # magic link + Google
  auth/callback/        # session exchange
  (app)/dashboard/      # client area
  (app)/audits/         # wizard + detail + live stream
  admin/                # founder console
  api/                  # Stripe webhook, report/pdf proxies, live polling
src/lib/
  domain.ts             # intake calibration (authoritative with worker)
  auth/                 # branded magic-link email (Resend)
  supabase/             # server/browser/admin clients
src/components/         # report viewer, live timeline, UI
```
