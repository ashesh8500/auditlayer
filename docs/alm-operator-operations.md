# Canonical ALM operator operations

## Runtime shape

| Role | Hermes profile | Human-facing | Production mutation |
|---|---|---:|---:|
| Company operator | `alm` | Admin workspace; Telegram after token provisioning | No |
| Engineering | `alm-dev` | No | No; prepares and verifies fixes |
| Operations | `alm-ops` | No | Only after Ashesh approval |
| Report generation | `alm-report` | No | Generates reports in isolated account homes |

The source of truth is `hermes-profile/`. Runtime homes under
`~/.hermes/profiles/` contain mutable state and secrets and are deployments, not source.
The report worker seeds only the restricted report role into each account-scoped home and
records `manifest.yaml`'s bundle version on audits and immutable report versions.

## Admin operator route

The Vercel server action calls:

`https://alm-operator.kalanak.com/operator-api/p/alm/v1/chat/completions`

The dedicated hostname terminates at an API-only loopback listener (`127.0.0.1:9121`)
that never serves the Hermes dashboard. The dashboard remains on
`hermes.kalanak.com` behind its existing Cloudflare Access policy. The API bearer
key remains server-only. Nginx exposes only the exact `POST`
`/operator-api/p/alm/v1/chat/completions` endpoint, rejects every other
`/operator-api/` path, applies a 1 MiB body limit and 65-second timeouts, then proxies to
loopback Hermes port `8642`. Report threads use deterministic
`X-Hermes-Session-Id` values (`alm:report:<audit UUID>`). Free-form discussion cannot
mutate product state; typed requests are written to `operator_jobs` instead.
The API profile receives an explicit empty toolset, so report text cannot invoke web,
skills, memory, session search, shell, files, or other egress/persistence tools.

Report generation always uses an isolated account home. Anonymous audits receive an
audit-scoped `anonymous-<audit-id>` home rather than inheriting process-global Hermes
state. Every run verifies canonical config, context, skills, and bundle marker content;
drift and stale managed files are repaired atomically while sessions and account memory
remain untouched.
Operations jobs remain queued until approved through the Ashesh-only approval RPC.

## Profile materialization and drift

```bash
cd ~/projects/auditlayer
worker/.venv/bin/python hermes-profile/scripts/install_profile.py --all
worker/.venv/bin/python hermes-profile/scripts/install_profile.py --all --check
```

The materializer atomically updates only managed config, SOUL, context, and selected
skills. It preserves `.env`, sessions, memories, state databases, logs, and auth state.

## Nginx deployment and rollback

```bash
cd ~/projects/auditlayer
bash scripts/install-alm-operator-proxy.sh
```

The script prints the timestamped backup path. To roll back, restore that backup, run
`sudo nginx -t`, and reload Nginx. The existing dashboard proxy remains the default
location and is not replaced by the operator route.

## Web and schema order

1. Run local web, worker, profile, migration, and browser gates.
2. Apply `20260721170127_alm_operator_control_plane.sql`, then
   `20260721193000_operator_security_hardening.sql`.
3. Regenerate Supabase TypeScript types.
4. Configure `ALM_OPERATOR_API_BASE` and `ALM_OPERATOR_API_KEY` in Vercel.
5. Deploy web and verify unauthenticated admin access redirects.
6. Deploy the worker and sibling `hermes-profile/` bundle.
7. Restart worker instances sequentially and check stable restart counts and health.

## Sentry

Web and worker SDKs are inert without DSNs. Before-send hooks remove user identity,
request bodies, cookies, authentication values, report content, creator context, and
sensitive extras. The signed Sentry issue-alert webhook stores a bounded incident through
a service-role-only atomic RPC; an incident never authorizes execution.

External Sentry provisioning requires project DSNs and a webhook secret. Configure:

- Web: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ENVIRONMENT`, and optionally
  `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` for source maps.
- Worker: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`.
- Webhook: `SENTRY_WEBHOOK_SECRET`; point the Sentry issue alert at
  `https://auditlayermedia.com/api/sentry/webhook` with the same secret.

## Deferred Telegram activation

Telegram is intentionally disabled until a dedicated token is supplied. When provisioned:

1. Add the unique token only to `~/.hermes/profiles/alm/.env`.
2. Add Ashesh and Narin's numeric Telegram IDs to `bot_allowlist` in the runtime config.
3. Keep `alm-dev`, `alm-ops`, and `alm-report` without Telegram tokens.
4. Run `hermes profile list`, start only `alm`, and confirm no token conflict.
5. Send a DM smoke test, then verify it lands in the `alm` profile and not a report home.

Never commit the token or copy it into account-scoped report homes.
