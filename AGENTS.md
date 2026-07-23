# AGENTS.md — AuditLayer

Guidelines for AI agents (Hermes, Claude Code, Codex, Cursor) working on this repository.

**Handoff / quick commands / live state:** [`docs/agent-handoff.md`](docs/agent-handoff.md) — read before starting work.

**Active canonical implementation plan:** [`docs/implementation/alm-intelligence-v1/README.md`](docs/implementation/alm-intelligence-v1/README.md) — required context for the longitudinal-intelligence, bounded-runtime, and customer UI/UX mission.

---

## What This Repo Is

AuditLayer is a social media competitive intelligence platform for evidence-based biohacking, health, and wellness creators. It generates deep, structured HTML audit reports calibrated by domain expertise. The product is the report — a beautiful, self-contained HTML file that answers six questions: Where you're at, What's holding you back, Who's doing it better, What to post next week, When you hit the next milestone, The money move.

**Founders:** Ashesh Kaji (tech/infra) + Narin (domain — biohacking, med-tech, wellness, content strategy)

---

## Architecture (v2 — production rebuild)

```
User Browser
    ↓
Next.js portal on Vercel (`web/`)
    ↓
Supabase — Postgres + RLS + Auth + Storage + Realtime
    ↓
Hetzner Hermes worker (`worker/`) claims queued audits via service-role
    ↓
Hermes Gateway API (`127.0.0.1:8642/v1`) → social-media-audit skill → HTML report
    ↓
Result: self-contained HTML in Supabase Storage; served through authorized app routes
```

| Layer | Location | Role |
|---|---|---|
| **Web app** | `web/` | Next.js (App Router, TS, Tailwind, shadcn). Auth, intake, billing, live stream, report viewer, admin console. Deployed on **Vercel**. |
| **Control plane** | `supabase/` | Postgres schema, RLS, private report Storage, Realtime on `audit_events`. Contract: `docs/architecture-contract.md`. |
| **Hermes worker** | `worker/` | Python service on **Hetzner CX22**. Claims `queued` audits, runs generation, streams `audit_events.phase`, uploads HTML. Self-contained (`auditlayer_worker/core.py`). |
| **Legacy v1** | `legacy/` | Archived stdlib WSGI + SQLite portal. Reference only — do not extend for new features. |

- **Auth:** Supabase magic link + Google OAuth. Admin gating via `profiles.role = 'admin'` (Ashesh + Narin).
- **Billing:** Stripe Checkout ($30 Starter, $50 Pro) + Customer Portal + webhook → `profiles.plan` via service-role. Plan limits in `web/src/lib/domain.ts` / worker `core.py`.
- **Reports:** Private buckets; **re-sign per request** from `report_path` (not long-lived stored URLs). Sandboxed iframe viewer.
- **Live stream:** Supabase Realtime on `audit_events`; timeline keyed off `phase` (not just `event_type`).
- **Refinements:** `queued → running → done/failed`; web enqueues with `status='queued'` via service-role; treats `done` as success.
- **Intake:** `evaluateIntake` in `web/src/lib/domain.ts` + `worker/auditlayer_worker/core.py`. No credential gate; `needs_review` only when platform is unknown. Bare handles default to Instagram.
- **Magic link auth:** Use Resend (`RESEND_API_KEY`) or Supabase `token_hash` email template — default Supabase PKCE links fail in mail apps. Callback: `web/src/app/auth/callback/route.ts`.
- **Hermes:** Worker reads `app_settings` (model, toolsets, caps). `HERMES_API_KEY` must match Gateway `API_SERVER_KEY`. Real generation runs on Hetzner only.
- **Infra:** Cloudflare DNS → Vercel. Hetzner worker behind systemd (`worker/infra/auditlayer-worker.service`). No open ports on the VM for the portal.

---

## Design Philosophy

1. **Reports are the product.** Every decision serves report quality. The HTML report is what clients pay for — it must look like it came from a research institution.
2. **Domain calibration over generic analytics.** The technology isn't the differentiator. Narin's knowledge of biohacking benchmarks, audience psychology, and content formats is.
3. **Three screens max.** Handle input → goal selection → beautiful report. Not a dashboard, not a platform, not a SaaS app with 14 nav items.
4. **Static over dynamic.** Reports are self-contained HTML files that survive offline, in email, in print.
5. **No signup wall.** First audit is free. Paywall after that. Let the report sell itself.
6. **Agentic where it matters, deterministic where it must be.** Hermes does research and report synthesis. The portal owns auth, billing, state transitions, event logs, delivery, and safety checks.
7. **Founder-operable.** Ashesh/Narin should be able to see client onboarding state, audit status, limitations, billing status, generation events, and blocked-review notes from the admin console — no raw SQL required.

---

## Key Conventions

### Docs-first development
All product decisions, methodologies, design systems, and implementation patterns are documented in `docs/` before code is written. Read `docs/` before coding. Update docs when decisions change.

### Design system
- Light theme (not dark Hermes theme — client-facing, not dev-facing)
- Teal accent (`#0d9488`) — scientific/clinical credibility
- Inter for body, JetBrains Mono for numbers
- Zero external dependencies in reports — all CSS inline
- See `docs/report-design-system.md` for full component library and tokens

### App-layer boundaries
- The Next.js app is not the report-generation brain. It orchestrates intake, plan limits, auth, billing, queue state, delivery, report storage, refinements, and observability.
- Hermes is called only from the **worker** (`worker/auditlayer_worker/`). The web app never calls the gateway directly.
- Local tests must not spend model tokens. Use `AUDITLAYER_GENERATOR=mock` for worker QA; Hermes validation is explicit (`diagnose-hermes`, `validate-hermes` on Hetzner).
- Founder/admin actions must write `audit_events`. Silent state changes are not acceptable.
- Client-facing pages must reflect business limitations plainly: credential uncertainty, platform/data access limits, plan caps, same-tier comparison policy, and founder review states.
- **Service-role** for admin writes, Stripe webhook, refinement enqueue, signed URLs. Lock `profiles.plan` / Stripe columns from client mutation.
- Keep reports as static artifacts in Supabase Storage; viewing uses short-lived signed URLs, not live model calls.

### Git conventions
- Branch: `master` (not `main`)
- Commit messages: imperative, lowercase, descriptive
- One commit per comparison addition in audit reports
- Repo-local git identity: `git config user.email "ashesh@asheshkaji.com"` / `git config user.name "Ashesh Kaji"`

### The social-media-audit skill
The core engine lives in `~/.hermes/skills/productivity/social-media-audit/`. This repo documents the product layer — what the skill should produce, how reports should look, and what the UX should be. Don't modify the skill from this repo; modify the docs to reflect desired behavior and the skill gets updated separately.

### Report delivery
- When sending reports via messaging platforms, use native media delivery (never paste local filesystem paths)
- Check session context for the correct target (group vs. DM)
- See `docs/implementation-patterns.md` for delivery patterns

---

## File Map

| Location | Purpose |
|---|---|
| `docs/agent-handoff.md` | **Start here** — live URLs, quick scripts, file map, open work |
| `docs/architecture-contract.md` | **Authoritative** schema, enums, RLS, phases, plan limits |
| `docs/deployment.md` | Vercel + Supabase + Hetzner worker setup and env vars |
| `docs/hermes-vm.md` | SSH, `make hermes-vm-sync`, VM credentials, systemd |
| `web/AGENTS.md` | Next.js portal conventions and routes |
| `docs/data-sources-and-billing.md` | Inflow/outflow diagrams, per-audit cost drivers |
| `docs/product-spec.md` | Product vision, user flow, pricing, roadmap |
| `docs/audit-methodology.md` | 15-section framework, research sweep, scoring |
| `docs/report-design-system.md` | CSS tokens, component library, print styles |
| `docs/production-readiness-checklist.md` | Gates before paid traffic |
| `web/` | Next.js portal (Vercel) |
| `worker/` | Hetzner Hermes worker (`worker/AGENTS.md`) |
| `supabase/` | Migrations, seed, config (`supabase/README.md`) |
| `legacy/` | Archived v1 WSGI + SQLite app |
| `.hermes/SKILL.md` | Repo-local Hermes skill |

---

## Agent-Specific Notes

### Kanban task granularity
- Prefer one large, outcome-oriented ticket per coherent change. The assigned agent owns investigation, implementation, tests, documentation, deployment preparation, and handoff.
- Keep the task body concise: desired outcome, non-negotiable constraints, acceptance checks, and rollback boundary. Agents should create and manage their own internal plan.
- Do not fan a ticket into micro-tasks just because it spans several files, layers, or sequential steps.
- Split only for genuinely parallel independent work, different credentials/workspaces, or an isolated high-risk production gate.
- One independent final gate is enough for production changes. Do not create review tickets after every implementation ticket.
- Keep no more than three project tickets active at once and no dependency graph deeper than two levels.

### When generating audit reports
- Load the `social-media-audit` skill — it has the 15-section framework, CSS patterns, delivery conventions
- Save reports to `~/projects/analyses/<subject-slug>-social-media-audit.md`
- Deliver via native media delivery, not local paths

### When editing existing reports
- Use the report's existing CSS classes — never introduce new styles
- Always update the `.subtitle` to include new benchmark handles
- Use Python scripts (not chained sed) for bulk find-and-replace
- Commit after each comparison addition

### When building portal features
- Light theme only — client-facing, not developer-facing
- Three screens max — no feature creep
- The guided question flow is sacrosanct — don't add steps to the wizard
- Preserve founder/admin operability: every new workflow needs a visible state, an event log entry, and a test.
- Preserve client isolation: reports, refinements, shares, and dashboard data must be owner-session or admin gated.
- Do not call live Hermes in ordinary tests.

### Deployment pipeline: dev → QA → production

**Never push directly to `master` with portal changes.** Every feature goes through
a preview deployment on Vercel, gets smoke-tested, then merges to production.

```
Feature branch → git push → Vercel preview deploy (automatic)
                    ↓
              QA smoke test (manual + automated)
                    ↓
              Merge to master → Vercel production deploy (manual: `make deploy-prod`)
```

**Rules:**
- **Feature branches:** `feat/descriptive-name` or `fix/descriptive-name`. Branch from `master`.
- **Preview deploy:** Every push to any branch auto-deploys to a unique Vercel preview URL. No manual step.
- **QA gate:** Before merging, verify on the preview URL:
  - Landing page loads (no errors)
  - Login / Google OAuth works
  - Core flow: new audit → timeline → report viewer → immersive reader/share
  - New feature works as expected
  - No regressions on existing features
- **Production deploy:** Merge to `master`, then `make deploy-prod` (or `cd web && npx vercel deploy --prod`).
- **Rollback:** `vercel rollback` reverts the production deployment instantly. Git `master` stays clean — fix forward in a new branch.
- **DB migrations:** Run against the linked Supabase project BEFORE merging portal code that depends on new tables. Use `npx supabase db push` after code review. Schema changes must be in `supabase/migrations/` with idempotent SQL.
- **Worker deploy:** Worker code on Hetzner syncs via Syncthing. Restart with `sudo systemctl restart auditlayer-worker` on the VM after worker changes land on `master`.

**Git commit conventions:**
- `feat:` — new feature
- `fix:` — bug fix
- `refactor:` — code restructure, no behavior change
- `docs:` — documentation only
- `chore:` — maintenance, deps, config
- One commit per logical change. Commits are independently revertible.

### Quick commands (full list in `docs/agent-handoff.md`)

```bash
make check-v2          # web QA + worker pytest — run before claiming stability
make dev-web           # local Next.js
make worker-run        # queue worker (needs worker/.env)
make worker-once       # single audit drain
make deploy-prod       # Vercel production deploy
```

```bash
# Worker Hermes checks (on gateway host)
cd worker && uv run python -m auditlayer_worker diagnose-hermes
cd worker && uv run python -m auditlayer_worker validate-hermes

```

`diagnose-hermes` must show `tcp_reachable=true`, `auth_ok=true`, `api_server_state=connected`, `ok=true`. `validate-hermes` must return `ok=True` and `skipped=False`. HTTP 401 → `HERMES_API_KEY` must match gateway `API_SERVER_KEY`.

### Component ownership

| Agent task | Primary path | Do not touch |
|---|---|---|
| Portal UI / auth / billing | `web/` | `worker/` Hermes prompts |
| Schema / RLS / storage | `supabase/` | — |
| Generation / refinements | `worker/` | `web/` calling Hermes |
| Report HTML content / CSS | docs + skill | Random new portal features |
| Legacy reference | `legacy/` | Production paths |
