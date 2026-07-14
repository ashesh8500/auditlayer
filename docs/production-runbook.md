# AuditLayer Production Runbook

Concise operator procedures for common production incidents. Commands assume you are on a laptop with repo access, Vercel CLI auth, and `Host hermes-vm` configured in `~/.ssh/config`, unless a step says "on VM". Do not paste secrets into tickets, chat, or logs.

Useful production surfaces:

- Web: https://auditlayermedia.com
- Fallback Vercel URL: https://web-delta-dun-29.vercel.app
- Admin console: https://auditlayermedia.com/admin
- Worker host: `hermes-vm`
- Worker systemd unit: `auditlayer-worker.service`
- Worker repo path on VM: `~/projects/auditlayer`
- Hermes production profile on VM: `~/.hermes/profiles/alm-production`

## 1. Worker down

Use when audits remain `queued`, `/admin` shows no fresh worker events, or the worker unit is inactive.

### Restart

```bash
ssh hermes-vm 'systemctl status auditlayer-worker --no-pager'
ssh hermes-vm 'sudo systemctl restart auditlayer-worker'
ssh hermes-vm 'sleep 3; systemctl status auditlayer-worker --no-pager'
```

If the unit fails again, inspect recent logs:

```bash
ssh hermes-vm 'journalctl -u auditlayer-worker -n 200 --no-pager'
```

If Hermes connectivity is suspected:

```bash
ssh hermes-vm 'export PATH=$HOME/.local/bin:$PATH; cd ~/projects/auditlayer/worker && uv run python -m auditlayer_worker diagnose-hermes'
```

### Verify recovery

```bash
ssh hermes-vm 'systemctl is-active auditlayer-worker'
ssh hermes-vm 'journalctl -u auditlayer-worker -n 50 --no-pager'
```

Expected: `systemctl is-active` prints `active`; `/admin` shows new worker events or queued audits start moving to `running` / `ready`.

## 2. Stuck audit

Use when an audit has stayed `running` for more than 30 minutes. The salvage command only promotes audits that already have a valid local HTML report artifact; it does not regenerate missing reports.

### Salvage one known audit

Replace `<audit-uuid>` with the audit id from `/admin`.

```bash
ssh hermes-vm 'cd ~/projects/auditlayer/worker && uv run python -m auditlayer_worker salvage --audit-id <audit-uuid>'
```

### Bulk salvage stale running audits

```bash
ssh hermes-vm 'cd ~/projects/auditlayer/worker && uv run python -m auditlayer_worker salvage --cutoff-minutes 30'
```

If salvage reports no artifact, review worker logs and either let the worker retry normally or fail/requeue from the admin console if that control exists for the incident.

### Verify completion

```bash
ssh hermes-vm 'journalctl -u auditlayer-worker -n 100 --no-pager'
```

Expected: the salvage command prints `salvaged 1 audit: ...` for a single recovery or `salvaged N stale audit(s)` for bulk recovery. In `/admin`, the audit status should be `ready`, `report_path` should be populated, and the event stream should include `succeeded`.

## 3. Profile update

Use when the production Hermes profile or worker repo needs the latest committed changes.

### Pull latest worker code

```bash
ssh hermes-vm 'cd ~/projects/auditlayer && git pull --ff-only origin master'
ssh hermes-vm 'cd ~/projects/auditlayer/worker && uv sync'
ssh hermes-vm 'sudo systemctl restart auditlayer-worker'
```

### Pull latest Hermes production profile

```bash
ssh hermes-vm 'cd ~/.hermes/profiles/alm-production && git pull --ff-only'
ssh hermes-vm 'sudo systemctl restart auditlayer-worker'
```

If both repo and profile changed, run both pull sequences before the restart.

### Verify update

```bash
ssh hermes-vm 'cd ~/projects/auditlayer && git status --short && git rev-parse --short HEAD'
ssh hermes-vm 'cd ~/.hermes/profiles/alm-production && git status --short && git rev-parse --short HEAD'
ssh hermes-vm 'systemctl is-active auditlayer-worker'
ssh hermes-vm 'export PATH=$HOME/.local/bin:$PATH; cd ~/projects/auditlayer/worker && uv run python -m auditlayer_worker diagnose-hermes'
```

Expected: both `git status --short` outputs are empty or only show known local secret/config files; worker is `active`; `diagnose-hermes` reports `ok=True`, `tcp_reachable=True`, and `auth_ok=True`.

## 4. Cost spike

Use when `/admin` shows unusually high per-audit cost, token volume, repeated failures, or runaway retries.

### Investigate in admin

1. Open https://auditlayermedia.com/admin.
2. Check recent audits for `tokens_in`, `tokens_out`, `cost_usd`, status, retries/failures, and model/app settings.
3. Identify whether one audit is still running or whether many audits are queued/retrying.

### Stop spend if generation is still running

```bash
ssh hermes-vm 'sudo systemctl stop auditlayer-worker'
ssh hermes-vm 'systemctl is-active auditlayer-worker || true'
```

Then lower caps, change model/settings, pause intake, or clear bad queued work from `/admin` according to the incident.

### Restart after mitigation

```bash
ssh hermes-vm 'sudo systemctl start auditlayer-worker'
ssh hermes-vm 'sleep 3; systemctl status auditlayer-worker --no-pager'
```

### Verify spend is controlled

Expected: `/admin` no longer shows active runaway audits; new audit cost/token numbers are in the expected range; failed/retried audit count stops increasing. The worker should be `active` only after the mitigation is in place.

## 5. Rollback web

Use when the Vercel production web deployment is broken while Supabase and the worker are healthy.

### Roll back production deployment

From the repo root on a machine logged into the Vercel project:

```bash
cd web && npx vercel rollback
```

Follow the Vercel prompt to select the last known-good production deployment. If you already know the deployment URL/id, pass it explicitly:

```bash
cd web && npx vercel rollback <deployment-url-or-id>
```

### Verify rollback

```bash
curl -fsS -o /dev/null https://auditlayermedia.com
curl -fsS -o /dev/null https://auditlayermedia.com/login
BASE_URL=https://auditlayermedia.com make smoke-test
```

Expected: landing and login return 2xx, smoke test passes, and `/admin` confirms audits/reports still load.

## 6. Rollback worker

Use when a worker regression was deployed and web/Supabase are otherwise healthy.

### Check current state

```bash
ssh hermes-vm 'cd ~/projects/auditlayer && git status --short && git rev-parse --short HEAD'
ssh hermes-vm 'systemctl status auditlayer-worker --no-pager'
```

### Roll back to a known-good commit

Replace `<known-good-sha>` with the commit that should run in production.

```bash
ssh hermes-vm 'cd ~/projects/auditlayer && git checkout <known-good-sha>'
ssh hermes-vm 'cd ~/projects/auditlayer/worker && uv sync'
ssh hermes-vm 'sudo systemctl restart auditlayer-worker'
ssh hermes-vm 'sleep 3; systemctl status auditlayer-worker --no-pager'
```

### Verify rollback

```bash
ssh hermes-vm 'cd ~/projects/auditlayer && git rev-parse --short HEAD'
ssh hermes-vm 'export PATH=$HOME/.local/bin:$PATH; cd ~/projects/auditlayer/worker && uv run python -m auditlayer_worker demo --handle iamsrk --generator mock'
ssh hermes-vm 'export PATH=$HOME/.local/bin:$PATH; cd ~/projects/auditlayer/worker && uv run python -m auditlayer_worker diagnose-hermes'
```

Expected: `git rev-parse --short HEAD` matches `<known-good-sha>`; mock demo reaches `status: ready`; `diagnose-hermes` reports `ok=True`.

### Return to master after the fix merges

```bash
ssh hermes-vm 'cd ~/projects/auditlayer && git checkout master && git pull --ff-only origin master'
ssh hermes-vm 'cd ~/projects/auditlayer/worker && uv sync'
ssh hermes-vm 'sudo systemctl restart auditlayer-worker'
ssh hermes-vm 'sleep 3; systemctl status auditlayer-worker --no-pager'
```
