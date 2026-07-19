# legacy/ — archived AuditLayer v1 (stdlib WSGI portal)

This directory is a **read-only archive** of the original AuditLayer v1 application: a
dependency-light Python WSGI service backed by SQLite that handled intake, auth,
founder admin, billing, the report worker, delivery, and report storage.

It was archived during the **production rebuild** (Next.js + Supabase + Stripe on
Vercel, with Hetzner retained only as the Hermes worker). The v1 app's hand-rolled
auth/session/CSRF/SQLite layer is **retired** — Supabase now owns auth, the database,
RLS, storage, and realtime.

## Why it is retained

Two modules are the source of truth that the new Python Hermes worker will reuse:

- **`src/auditlayer/domain.py`** — domain calibration logic: enums (`AuditStatus`,
  `Plan`, `Goal`, `Platform`), `PLAN_LIMITS`, handle normalization, platform
  detection, credential-signal inference, milestone calculation, and the
  `evaluate_intake` intake-decision policy. These rules are authoritative and are
  mirrored into the new architecture contract (`docs/architecture-contract.md`).
- **`src/auditlayer/hermes.py`** — the Hermes adapter: prompt construction, toolset
  configuration, the strict response contract (complete self-contained HTML for
  generation; section-scoped fragments for refinement), and guardrails.

The rest (`web.py`, `auth.py`, `billing.py`, `store.py`, `service.py`, `delivery.py`,
`pdf.py`, `factory.py`, `config.py`, templates, tests, scripts, infra) is kept for
reference only and is **not** part of the new build.

## Do not

- Do not import from `legacy/` in `web/`, `worker/`, or `supabase/`.
- Do not run the v1 app in production.
- Do not modify these files expecting them to affect the live product.

This archive is the only copy of the v1 app — the former root-level duplicates
(`src/`, `templates/`, `tests/`, `pyproject.toml`, `requirements.txt`, `uv.lock`)
were removed once the rebuild fully superseded them.
