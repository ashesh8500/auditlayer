#!/usr/bin/env bash
# Canonical worker release entry point. Never infer a checkout, revision, or drain.
set -euo pipefail
: "${REVIEWED_REVISION:?Set REVIEWED_REVISION to the reviewed full commit SHA}"
: "${AUDITLAYER_REPO_DIR:?Set AUDITLAYER_REPO_DIR to the reviewed clean repository}"
: "${DRAIN_HOOK:?Set DRAIN_HOOK to the reviewed worker/infra/drain.sh}"
: "${DRAIN_TOKEN:?Set DRAIN_TOKEN to a retained UUID for this release/recovery}"
export DRAIN_TOKEN
[[ "$REVIEWED_REVISION" =~ ^[0-9a-f]{40}$ ]] || { echo 'Full commit SHA required' >&2; exit 1; }
[[ "$DRAIN_HOOK" = /* && -x "$DRAIN_HOOK" ]] || { echo 'Absolute executable drain hook required' >&2; exit 1; }
[[ "$(git -C "$AUDITLAYER_REPO_DIR" rev-parse HEAD)" = "$REVIEWED_REVISION" ]] || { echo 'Reviewed revision differs from HEAD' >&2; exit 1; }
[[ -z "$(git -C "$AUDITLAYER_REPO_DIR" status --porcelain)" ]] || { echo 'Dirty release checkout rejected' >&2; exit 1; }
ROOT=/opt/auditlayer
SERVICES=(auditlayer-worker@1.service auditlayer-worker@2.service)
# No deployments over the obsolete singleton/PDF topology.
for unit in auditlayer-worker.service auditlayer-pdf-worker.service; do
  if systemctl is-active --quiet "$unit" || systemctl is-enabled --quiet "$unit"; then
    echo "Drain and disable legacy unit $unit first" >&2; exit 1
  fi
done
# This release contract is the reviewed two-instance topology, not an implicit
# assumption that extra instances/hosts have been drained by stopping these two.
TOPOLOGY=$(systemctl list-units --all --plain --no-legend 'auditlayer-worker@*.service')
while read -r unit rest; do
  [[ -n "$unit" ]] || continue
  case "$unit" in
    auditlayer-worker@1.service|auditlayer-worker@2.service) ;;
    *) echo "Unreviewed worker topology: $unit" >&2; exit 1 ;;
  esac
done <<< "$TOPOLOGY"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
git -C "$AUDITLAYER_REPO_DIR" archive "$REVIEWED_REVISION" | tar -x -C "$STAGE"
[[ -d "$STAGE/hermes-profile" && -f "$ROOT/worker/.env" ]] || { echo 'Release bundle or production environment missing' >&2; exit 1; }
# Test the exact archived source, never another mutable checkout. No inference.
# Worker cross-language tests also consume this release's web dependencies.
(cd "$STAGE/web" && pnpm install --frozen-lockfile && pnpm test && pnpm typecheck)
(cd "$STAGE/worker" && uv sync --frozen --extra embedded --extra dev &&
  .venv/bin/python -m pytest tests/ -q && .venv/bin/python _verify_s06.py)
python3 "$STAGE/scripts/check-migrations.py"
# Reject arbitrary success hooks and run the immutable reviewed copy.
cmp -- "$DRAIN_HOOK" "$STAGE/worker/infra/drain.sh"
cmp -- "$(dirname -- "$DRAIN_HOOK")/drain.py" "$STAGE/worker/infra/drain.py"
DRAIN_HOOK="$STAGE/worker/infra/drain.sh"
# The DB migration fences canonical claims on every host. Local health guards
# against a reaper hiding still-running processes in this reviewed @1/@2 fleet.
# Any failure retains the fence; no automatic resume or rollback.
"$DRAIN_HOOK"
"$DRAIN_HOOK" verify
for unit in "${SERVICES[@]}"; do
  state=$(systemctl show "$unit" -p ActiveState --value)
  [[ "$state" = inactive ]] || { echo "Drain incomplete: $unit is $state" >&2; exit 1; }
done
# Backup BEFORE overwrite, including the previous dependency environment/unit.
BACKUP=$(sudo mktemp -d "$ROOT/rollback-XXXXXXXX")
sudo cp -a "$ROOT/worker" "$BACKUP/worker"
sudo cp -a "$ROOT/hermes-profile" "$BACKUP/hermes-profile"
sudo cp -a /etc/systemd/system/auditlayer-worker@.service "$BACKUP/"
printf 'Rollback snapshot: %s\n' "$BACKUP"
# Failures before start leave workers stopped. A health failure after start
# requires incident reconciliation, NOT an automatic rollback over active jobs.
sudo rsync -a --delete --exclude .env --exclude .venv --exclude var/ --exclude __pycache__ --exclude '*.pyc' "$STAGE/worker/" "$ROOT/worker/"
sudo rsync -a --delete --exclude __pycache__ --exclude '*.pyc' "$STAGE/hermes-profile/" "$ROOT/hermes-profile/"
sudo chown -R auditlayer:auditlayer "$ROOT/worker" "$ROOT/hermes-profile"
sudo -u auditlayer bash -c 'cd /opt/auditlayer/worker && /usr/local/bin/uv sync --frozen --no-dev --extra embedded'
sudo diff -qr -x .env -x .venv -x var -x __pycache__ -x '*.pyc' -x .pytest_cache "$STAGE/worker" "$ROOT/worker"
sudo diff -qr -x __pycache__ -x '*.pyc' "$STAGE/hermes-profile" "$ROOT/hermes-profile"
sudo -u auditlayer bash -c 'cd /opt/auditlayer/worker && .venv/bin/python -m auditlayer_worker release-preflight'
sudo install -m 644 "$STAGE/worker/infra/auditlayer-worker@.service" /etc/systemd/system/auditlayer-worker@.service
sudo systemctl daemon-reload
for unit in "${SERVICES[@]}"; do
  [[ "$(systemctl show "$unit" -p WorkingDirectory --value)" = "$ROOT/worker" ]]
  [[ "$(systemctl show "$unit" -p User --value)" = auditlayer ]]
  [[ "$(systemctl show "$unit" -p ExecStart --value)" = *"$ROOT/worker/.venv/bin/python -m auditlayer_worker run"* ]]
done
sudo systemctl start "${SERVICES[@]}"
for unit in "${SERVICES[@]}"; do systemctl is-active --quiet "$unit"; done
for port in 8788 8789; do curl --retry 5 --retry-connrefused --retry-delay 2 --fail --silent "http://127.0.0.1:$port/healthz"; done
"$DRAIN_HOOK" resume
printf '\nReleased %s; rollback snapshot %s. Inspect fresh logs before closure.\n' "$REVIEWED_REVISION" "$BACKUP"
