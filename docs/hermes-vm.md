# Hermes VM (Hetzner)

Long-running host for **Hermes Gateway** + **AuditLayer worker**. Syncthing keeps
`~/projects/auditlayer` in sync with the laptop; credentials are synced explicitly
via `make hermes-vm-sync`.

---

## SSH (local laptop)

Already in `~/.ssh/config`:

```
Host hermes-vm
  HostName 178.104.182.4
  User asheshkaji
  IdentityFile ~/.ssh/id_ed25519_hetzner
```

```bash
ssh hermes-vm
# or
make hermes-vm-ssh
```

Tailscale IP `100.83.195.75` exists but public IP is preferred when mesh is flaky.

---

## Quick commands (laptop)

```bash
make hermes-vm-sync       # push worker/.env + Supabase/Vercel auth → VM, bootstrap
make hermes-vm-ssh        # open shell
make hermes-vm-status     # gateway + worker + diagnose-hermes
make hermes-vm-worker     # install + start systemd worker
```

After first sync, on the VM:

```bash
al                        # cd ~/projects/auditlayer
alworker run              # manual queue loop
alworker diagnose-hermes
alworker run --once
cd ~/projects/auditlayer/web && vercel deploy --prod
cd ~/projects/auditlayer && npx supabase@latest db push
```

---

## What gets synced (secrets — never committed)

| Source (laptop) | Destination (VM) |
|---|---|
| `worker/.env` | `~/projects/auditlayer/worker/.env` |
| `web/.env.local` (optional) | `~/projects/auditlayer/web/.env.local` |
| `infra/hermes-vm/.supabase-access-token` (gitignored `sbp_*` PAT) | `~/.config/supabase/access-token` |
| `~/Library/Application Support/com.vercel.cli/auth.json` | `~/.local/share/com.vercel.cli/auth.json` |
| `supabase/.temp/` | linked project metadata |
| `web/.vercel/` | Vercel project link |

**GitHub:** `gh` is already logged in on the VM as `ashesh8500`.

**Hermes:** `~/.hermes/.env` lives on the VM only (gateway API key). Worker
`HERMES_API_KEY` in `worker/.env` must match `API_SERVER_KEY` there.

---

## Bootstrap (on VM)

`infra/hermes-vm/bootstrap.sh` installs/checks:

- `uv` + `worker` Python deps
- Chromium (`/snap/bin/chromium`) + `CHROMIUM_PATH` in `worker/.env`
- Supabase CLI via `npx` (when token synced)
- Vercel CLI via `npm install -g`
- Shell aliases in `~/.bashrc`

---

## Systemd services

| Service | Role |
|---|---|
| `hermes-gateway.service` | Hermes api_server on `127.0.0.1:8642` |
| `auditlayer-worker.service` | Claims Supabase queue (install with `make hermes-vm-worker`) |

```bash
# On VM
sudo cp ~/projects/auditlayer/worker/infra/auditlayer-worker.vm.service \
  /etc/systemd/system/auditlayer-worker.service
sudo systemctl daemon-reload
sudo systemctl enable --now auditlayer-worker
journalctl -u auditlayer-worker -f
```

Use `auditlayer-worker.vm.service` (user `asheshkaji`, Syncthing path) — not the
generic `auditlayer-worker.service` which assumes `/opt/auditlayer` + user `auditlayer`.

---

## Verify

```bash
ssh hermes-vm 'export PATH=$HOME/.local/bin:$PATH; cd ~/projects/auditlayer/worker && uv run python -m auditlayer_worker diagnose-hermes'
```

Expected: `ok=True`, `tcp_reachable=True`, `auth_ok=True`, `api_server_state=connected`.

---

## Re-sync after laptop login changes

If tokens expire:

```bash
vercel login                 # laptop
make hermes-vm-sync          # push to VM
```

**Supabase CLI on VM** needs a Personal Access Token (`sbp_...`):

1. Create at https://supabase.com/dashboard/account/tokens
2. Save to `infra/hermes-vm/.supabase-access-token` (gitignored)
3. `make hermes-vm-sync`

Migrations can also run from the laptop with `make supabase-push` — the worker only
needs `SUPABASE_SERVICE_ROLE_KEY` in `worker/.env` (already synced).

---

## Agent handoff

VM work is optional for portal changes (Vercel builds from laptop). Use the VM for:

- Always-on `auditlayer_worker run`
- Hermes generation close to gateway
- `diagnose-hermes` / `validate-hermes` in production conditions

See also: [`agent-handoff.md`](agent-handoff.md), [`deployment.md`](deployment.md).
