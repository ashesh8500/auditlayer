# Production Readiness Checklist

Use before accepting paid traffic on the **v2 stack** (Next.js + Supabase + worker).
Legacy WSGI portal in `legacy/` is archived.

**Handoff context:** [`agent-handoff.md`](agent-handoff.md)

---

## Local QA gate (run on every meaningful change)

```bash
make check-v2
```

Required result:

- Web: build, lint, typecheck, Playwright e2e (4 tests) — **no Supabase env needed**
- Worker: `uv run pytest` (20 tests) — **no model tokens**

---

## Environment gates

| Gate | Command / check | Required evidence |
|---|---|---|
| Supabase migrations | `make supabase-push` | Tables + RLS + private `reports` bucket exist |
| Founders admin | SQL in `supabase/seed.sql` | Ashesh + Narin `role = 'admin'` |
| Google OAuth | Supabase → Auth → Providers | Sign-in works; callback `https://<domain>/auth/callback` |
| Magic link email | Resend on Vercel **or** Supabase template | Link uses `token_hash`, not `ConfirmationURL` alone |
| `NEXT_PUBLIC_SITE_URL` | Vercel env | Matches prod domain (not preview URL in prod) |
| Stripe webhook | `https://<domain>/api/webhooks/stripe` | Events return `200`; `profiles.plan` updates |
| Vercel env | `web/.env.example` | All required vars set for Production |
| Hermes gateway | `cd worker && uv run python -m auditlayer_worker diagnose-hermes` | `ok=true`, `tcp_reachable=true`, `auth_ok=true`, `api_server_state=connected` |
| Hermes health | `cd worker && uv run python -m auditlayer_worker validate-hermes` | `ok=True`, `skipped=False` |
| Worker running | `make hermes-vm-worker` on hermes-vm | `systemctl is-active auditlayer-worker` = active |
| End-to-end audit | Intake → worker → ready | Workspace viewer, immersive reader, sharing, and HTML download work |

---

## Auth email checklist (rollout)

- [ ] **Resend path:** `RESEND_API_KEY` + `AUTH_EMAIL_FROM` on Vercel; domain verified
- [ ] **Or Supabase SMTP** + `supabase/templates/magic_link.html` pushed
- [ ] Magic link opens from **mail app** (not same browser) and lands on `/dashboard`
- [ ] Google OAuth still works after changes

---

## Hermes notes

- Real generation needs gateway with `HERMES_API_KEY` = `API_SERVER_KEY`.
- Local laptop: enable `API_SERVER_ENABLED=true` in `~/.hermes/.env`, `hermes gateway restart`.
- Offline pipeline: `cd worker && uv run python -m auditlayer_worker demo --generator mock`.
- Token pricing: `AUDITLAYER_PRICE_IN_PER_MTOK` / `OUT` — see `docs/data-sources-and-billing.md`.

---

## Known gaps (as of handoff)

| Item | Status |
|---|---|
| Hetzner systemd worker | `make hermes-vm-sync && make hermes-vm-worker` — see `docs/hermes-vm.md` |
| `auditlayer.com` DNS | Not on Vercel |
| Stripe webhook | Often `not_configured` in env |
| Enterprise seats | Manual SQL only |

---

## Legacy v1 (optional)

`make check` under archived `legacy/src/auditlayer` — reference only. Do not use for new traffic.
