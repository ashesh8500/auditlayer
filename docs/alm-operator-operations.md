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

### Event contract

Web and worker capture is fail-closed: a DSN without an exact 40-hex deployed Git release
does not enable the SDK. The before-send hooks build a new event from an allowlist instead
of trying to redact a denylist. They retain only:

- structural event ID/timestamp/level;
- exception class and source frames (`filename`, `abs_path`, function/module, line/column,
  and `in_app`) without exception messages, local variables, or source-context lines;
- `environment`, exact `release`, and the diagnostic dimensions `service`, `surface`,
  `operation`, `error_class`, and `status`.

Grouping uses Sentry's default stack grouping plus those five dimensions. User identity,
handles, email, IPs, tokens, OAuth codes, auth/cookie headers, request URLs/bodies/query,
captions, reports, customer context, extras, breadcrumbs, arbitrary tags, replay, and
transactions are never sent. HTTP(S) frame URLs are stripped of credentials, query, and
fragment; every other absolute frame protocol, including `data:`, `blob:`, `file:`, and
`javascript:`, is dropped because it can embed private content or environment paths.
Do not pass customer values to a diagnostic dimension; use only the exported fixed helper
vocabularies in `web/src/lib/sentry.ts` and `worker/auditlayer_worker/observability.py`.

### Activation keys

Configure key names through the deployment control planes; never paste values into logs,
comments, screenshots, or Git. `web/sentry.env.example` and `worker/.env.example` are the
non-secret templates.

| Surface | Required key names | Release rule |
|---|---|---|
| Vercel server/edge | `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | `SENTRY_RELEASE` or automatic `VERCEL_GIT_COMMIT_SHA`, exactly 40 hex |
| Browser | `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | build-plugin `SENTRY_RELEASE`; non-Vercel builds also set `NEXT_PUBLIC_SENTRY_RELEASE` to the same exact SHA |
| Source maps | `SENTRY_ORG`, `SENTRY_PROJECT`, build-only `SENTRY_AUTH_TOKEN` | upload and runtime must use the same exact SHA |
| Worker systemd env file | `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE` | update to the exact deployed worker commit on every rollout |
| Incident webhook | `SENTRY_WEBHOOK_SECRET` plus existing Supabase service-role keys | no release key; event release is normalized from allowlisted Sentry tags |

On Vercel, do not pin a long-lived static release: use the deployment commit SHA. Source
maps upload only when org, project, auth token, and exact release are all present; uploaded
maps are widened for useful frames and deleted from public build artifacts after upload.
The runtime remains operational when Sentry is disabled.

Point a Sentry issue alert at `https://auditlayermedia.com/api/sentry/webhook` with the same
HMAC secret. Intake verifies the signature over the exact raw bytes, caps bodies at 256 KiB,
strips URL credentials/query/fragment, and sends only allowlisted incident metadata to the
service-role-only `ingest_operator_incident` RPC. It accepts official issue-alert
`data.event` payloads with tuple tags and standard `data.issue` payloads; unavailable
diagnostics on tagless issue payloads are recorded as `unknown`, never reconstructed from
titles, culprits, request data, or customer fields. The unique immutable
`sentry:<project>:<issue-id>` fingerprint makes repeated notifications increment one row;
an incident never authorizes execution.

### Verification and synthetic proof

Before deployment:

```bash
cd web
pnpm exec vitest run src/lib/sentry-privacy.test.ts src/lib/sentry.test.ts \
  src/lib/sentry-config.test.ts src/app/api/sentry/webhook/route.test.ts
pnpm typecheck && pnpm build

cd ../worker
uv run pytest tests/test_observability.py -q
```

At the exact preview/candidate commit, perform a safe synthetic proof with no customer
request or data:

1. Confirm configured key **names** only. Confirm the web runtime release, uploaded artifact
   release, and candidate Git SHA are identical. Confirm the worker process has the same
   exact worker SHA in `SENTRY_RELEASE`; never print any value except the non-secret SHA.
2. From an authenticated preview-only operator path, call `captureWebFailure(new
   Error("synthetic_sentry_probe"), { surface: "web_runtime", operation: "request",
   status: "failed", errorClass: "SyntheticProbeError" })`. Remove the temporary call before
   promotion. For the worker, define a local `SyntheticProbeError(RuntimeError)`, raise and
   catch it, then call `capture_worker_failure(error, surface="worker_runtime",
   operation="worker_loop", status="failed")` from a one-shot maintenance process, never
   the report generator.
3. Read back both Sentry events. Required: environment and exact release; five allowlisted
   tags; resolved application source frame for web; no user/request/extra/breadcrumb data;
   exception value exactly `[Filtered]`. Search the serialized event for the unique probe
   string: it must not appear outside the synthetic class/tag chosen above.
4. Send the same signed issue payload twice to the webhook in a non-production database and
   verify one `operator_incidents` fingerprint whose `event_count` increments to two. Verify
   an altered signature returns 401 and the RPC is not called.
5. Delete/resolve the synthetic issue and retain only event IDs, release SHA, check results,
   and rollback command as release evidence. Never retain payload exports.

Production activation, the proof, worker restart, and rollback remain release-gate actions;
this runbook does not grant permission to perform them.

### Known activation gaps (read-only inspection, 2026-08-27)

- The repository and current process expose no worker Sentry key names. The production
  `/opt/auditlayer/worker/.env` exists but was unreadable to the non-privileged review user,
  so production worker key presence is **unknown**, not absent.
- Vercel CLI had no local credentials and entered device login, so this lane could not
  re-read production key names. Prior mission evidence established `SENTRY_WEBHOOK_SECRET`
  only; it did not establish web DSNs, exact release, org/project, or source-map token.
- No Sentry organization/project was created and no environment was mutated. Activation is
  blocked until an authorized release operator verifies/adds the required names, then runs
  the exact-release synthetic proof above.

## Deferred Telegram activation

Telegram is intentionally disabled until a dedicated token is supplied. When provisioned:

1. Add the unique token only to `~/.hermes/profiles/alm/.env`.
2. Add Ashesh and Narin's numeric Telegram IDs to `bot_allowlist` in the runtime config.
3. Keep `alm-dev`, `alm-ops`, and `alm-report` without Telegram tokens.
4. Run `hermes profile list`, start only `alm`, and confirm no token conflict.
5. Send a DM smoke test, then verify it lands in the `alm` profile and not a report home.

Never commit the token or copy it into account-scoped report homes.
