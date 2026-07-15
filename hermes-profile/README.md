# ALM Hermes Production Profile

This directory contains the `alm-production` Hermes profile used by AuditLayer Media for report-generation workflows.

The profile is configured for the `deepseek-v4-pro` model and is intentionally limited to the production-safe toolsets needed for audit/report generation:

- `web`
- `browser`
- `x_search`

Included skills:

- `social-media-audit`
- `narin-brand-audits`

Runtime state and secrets are intentionally excluded from this monorepo copy. Do not commit profile-local sessions, logs, `auth.json`, `.env`, or `state.db*` files.
