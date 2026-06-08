# Architecture Contract

This is the **authoritative, shared contract** for the AuditLayer production
rebuild. Every agent — web app, Supabase, Python Hermes worker, billing — must
conform to the schema, enums, event phases, storage layout, RLS intent, and plan
limits defined here. If code and this document disagree, this document wins until
it is deliberately revised.

**Operational context:** [`agent-handoff.md`](agent-handoff.md) (live URLs, quick commands, open work).

The rebuild stack:

- `web/` — Next.js (App Router, TypeScript, Tailwind, shadcn/ui), deployed on Vercel.
- `worker/` — Python Hermes worker on Hetzner (reuses the legacy `domain.py` +
  `hermes.py`). **Reserved**; owned by the worker agent.
- `supabase/` — Postgres + RLS + Storage + Realtime migrations, config, seed.
- `legacy/` — archived v1 stdlib WSGI app (see `legacy/README.md`).

Supabase is the control plane: Postgres (data), Auth (magic link + Google OAuth),
Row Level Security, Storage (report HTML/PDF), and Realtime (live generation
stream). The Python worker claims queued audits via the **service-role** key
(which bypasses RLS), runs the Hermes agent, streams `audit_events`, and uploads
the final self-contained HTML + PDF to Storage.

---

## Postgres schema (`public`)

> The SQL implementation lives in `supabase/migrations/0001_init.sql`. Column
> definitions below are normative.

### `profiles`
One row per `auth.users` user (1:1). Auto-created on first sign-in via the
`handle_new_user` trigger; new users default to `role = 'client'`.

| column | type | default / constraints |
|---|---|---|
| `id` | uuid | **PK**, references `auth.users(id)` on delete cascade |
| `email` | text | |
| `full_name` | text | not null, default `''` |
| `role` | text | not null, default `'client'`, check in (`client`,`admin`) |
| `plan` | text | not null, default `'free'` |
| `subscription_status` | text | not null, default `'trial'` |
| `stripe_customer_id` | text | |
| `stripe_subscription_id` | text | |
| `current_period_end` | timestamptz | |
| `onboarding_status` | text | not null, default `'lead'` |
| `created_at` | timestamptz | default `now()` |

### `audits`
One row per requested audit, owned by a profile.

| column | type | default / constraints |
|---|---|---|
| `id` | uuid | **PK**, default `gen_random_uuid()` |
| `user_id` | uuid | not null, references `profiles(id)` on delete cascade |
| `handle` | text | not null |
| `platform` | text | not null, default `'unknown'` |
| `goal` | text | not null, default `'growth'` |
| `context` | text | not null, default `''` |
| `status` | text | not null, default `'queued'` |
| `limitations` | jsonb | not null, default `'[]'::jsonb` |
| `admin_notes` | text | not null, default `''` |
| `milestone_label` | text | |
| `model` | text | |
| `report_path` | text | |
| `report_url` | text | |
| `pdf_url` | text | |
| `cost_usd` | numeric | not null, default `0` |
| `tokens_in` | int | not null, default `0` |
| `tokens_out` | int | not null, default `0` |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | default `now()` (auto-maintained by trigger) |

### `audit_events`
Append-only event trail that powers the live generation stream (via Realtime).

| column | type | default / constraints |
|---|---|---|
| `id` | uuid | **PK**, default `gen_random_uuid()` |
| `audit_id` | uuid | not null, references `audits(id)` on delete cascade |
| `actor` | text | not null, default `'system'` |
| `event_type` | text | not null |
| `phase` | text | (see Event phases) |
| `detail` | text | not null, default `''` |
| `created_at` | timestamptz | default `now()` |

### `refinements`
Section-scoped refinement requests against a generated report.

| column | type | default / constraints |
|---|---|---|
| `id` | uuid | **PK**, default `gen_random_uuid()` |
| `audit_id` | uuid | not null, references `audits(id)` on delete cascade |
| `user_id` | uuid | |
| `section` | text | not null |
| `instruction` | text | not null |
| `status` | text | not null, default `'queued'` |
| `error` | text | not null, default `''` |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | default `now()` (auto-maintained by trigger) |

### `app_settings`
Single-row (`id = 1`) admin configuration for the Hermes worker.

| column | type | default / constraints |
|---|---|---|
| `id` | int | **PK**, default `1`, check `id = 1` |
| `hermes_model` | text | not null, default `'deepseek-v4-pro'` |
| `hermes_api_base` | text | not null, default `'http://127.0.0.1:8642/v1'` |
| `enabled_toolsets` | jsonb | not null, default `'["web","browser","x_search"]'::jsonb` |
| `token_cap` | int | not null, default `32000` |
| `cost_cap_usd` | numeric | not null, default `3` |
| `updated_at` | timestamptz | default `now()` (auto-maintained by trigger) |

---

## Enums (string values)

These mirror the legacy `domain.py` and are the canonical set. They are stored as
plain `text` columns (validated in app/worker code), except `profiles.role` which
has a DB check constraint.

**Audit status** (`audits.status`):
```
draft, queued, running, ready, needs_review, blocked, failed
```

**Plans** (`profiles.plan`):
```
free, starter, pro, enterprise
```

**Goals** (`audits.goal`):
```
growth, monetization, rebrand, launch_readiness
```

**Platforms** (`audits.platform`):
```
instagram, tiktok, youtube, x, linkedin, unknown
```

**Role** (`profiles.role`): `client`, `admin`.

---

## Event phases (ordered for the live stream)

`audit_events.phase` uses this ordered vocabulary. The frontend renders the live
agentic timeline in this order:

```
intake → queued → approved → started → researching → metrics →
peers → scoring → composing → uploaded → succeeded → failed → refinement
```

- `intake` — request captured / decision evaluated.
- `queued` — accepted and waiting for the worker.
- `approved` — founder-gated approval to run.
- `started` — worker claimed the audit.
- `researching` — gathering signals on the handle.
- `metrics` — pulling/estimating account metrics.
- `peers` — same-tier peer/competitor analysis.
- `scoring` — computing the performance score.
- `composing` — synthesizing the self-contained HTML report.
- `uploaded` — HTML/PDF written to Storage.
- `succeeded` — terminal success (status → `ready`).
- `failed` — terminal failure (status → `failed`).
- `refinement` — a section-scoped refinement pass.

---

## Storage buckets (private)

Both buckets are **private** (`public = false`); access is via signed URLs or the
ownership RLS policies in `supabase/migrations/0003_storage.sql`.

| bucket | mime | size limit | purpose |
|---|---|---|---|
| `reports` | `text/html` | 10 MB | self-contained HTML reports |
| `pdfs` | `application/pdf` | 25 MB | rendered PDF exports |

**Path convention:** `<bucket>/<audit_id>/<filename>` — the first path segment is
the owning audit id, used by ownership checks. The worker uploads with the
service-role key; `audits.report_path` stores the object path, and
`audits.report_url` / `audits.pdf_url` hold signed or canonical URLs.

---

## RLS intent

RLS is **enabled on every table**. The browser uses the `anon` key as the
`authenticated` role and is constrained by policy. The Python worker and trusted
Next.js server actions use the **service-role** key, which **bypasses RLS**.
Implementation: `supabase/migrations/0002_rls.sql`.

- **profiles**: a user (`auth.uid()`) can `select`/`update` their own row. Admins
  (`role = 'admin'`) can `select`/`update` all rows.
- **audits**: a user can `select` their own audits and `insert` audits they own
  (`user_id = auth.uid()`). Admins have full access.
- **audit_events**: a user can `select` events for audits they own (via
  `owns_audit()`). Admins have full access. Writes come from the worker
  (service-role).
- **refinements**: a user can `select` refinements for audits they own. Admins
  have full access.
- **app_settings**: readable/updatable by **admins only**. The worker reads via
  service-role.

Helpers (both `SECURITY DEFINER` to avoid RLS recursion):
- `public.is_admin()` → true if the caller's profile has `role = 'admin'`.
- `public.owns_audit(uuid)` → true if the caller owns the given audit.

### Security notes for downstream agents
- `profiles.update_own` currently permits the user to update any column on their
  own row (per the contract). **Plan, subscription, and Stripe columns must only
  be written by the Stripe webhook via service-role**, and `role` must only be
  changed by an admin/service-role. The billing and auth agents should keep those
  writes server-side and SHOULD tighten this with column-level protection.
- **Refinement enqueue** is intentionally not granted to the browser role;
  create refinements through a trusted server action (service-role) so guardrails
  and plan checks run server-side.

---

## Plan limits

Maximum completed audits per plan (from legacy `src/auditlayer/domain.py`,
`PLAN_LIMITS`). Enforced on intake by the app/worker:

| plan | limit |
|---|---|
| `free` | 1 |
| `starter` | 5 |
| `pro` | 15 |
| `enterprise` | 10000 |

Pricing (from the rebuild plan): Starter $30, Pro $50, Enterprise (contact).

---

## Domain calibration (canonical in the worker)

The intake decision logic — `normalize_handle`, `detect_platform`,
`infer_credential_signal`, `next_milestone`, `evaluate_intake`, and the Instagram
data limitation — is retained in `legacy/src/auditlayer/domain.py` and is the
source of truth for the Python worker. The worker writes the resulting
`limitations` (jsonb array), `platform`, `status`, and `milestone_label` onto the
audit row. The web app may mirror the lightweight, read-only hints (handle
normalization, platform detection, credential prompt) for inline UX, but must not
duplicate the authoritative decision.

---

## Seed

`supabase/seed.sql` inserts the single `app_settings` row (`id = 1`) and documents
promoting founders (Ashesh + Narin) to `role = 'admin'` after first sign-in:

```sql
update public.profiles
set role = 'admin'
where email in ('ashesh@asheshkaji.com', 'narin@auditlayer.com');
```
