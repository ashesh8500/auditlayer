# Archived operations, not deployment instructions

The duplicate WSGI/SQLite units formerly in this directory were the same units as
`legacy/infra/systemd/`. Those archived units run `python -m auditlayer`, NOT the
current `auditlayer_worker` package. Their env examples belong to that legacy
application (the remaining legacy example also contains old PDF/model settings).
Do not use them for the Next.js + Supabase worker deployment.

Current production source of truth: `worker/infra/auditlayer-worker@.service` and
`worker/infra/deploy.sh`. See `docs/admin-ops-remediation-20260919.md` for the drain,
reviewed-revision and rollback gates. No new compatibility wrapper is provided.
