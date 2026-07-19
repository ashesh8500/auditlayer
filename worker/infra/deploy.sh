#!/usr/bin/env bash
set -euo pipefail

echo "=== AuditLayer worker deploy ==="

REPO_DIR="${AUDITLAYER_REPO_DIR:-$HOME/projects/auditlayer}"
PROFILE_DIR="${AUDITLAYER_HERMES_PROFILE_DIR:-$HOME/.hermes/profiles/alm-production}"
WORKER_SERVICES="${AUDITLAYER_WORKER_SERVICES:-auditlayer-worker@1 auditlayer-worker@2}"
PDF_SERVICE="${AUDITLAYER_PDF_SERVICE:-auditlayer-pdf-worker}"

export PATH="$HOME/.local/bin:$PATH"

echo "== Pull latest repository code =="
cd "$REPO_DIR"
git pull --ff-only origin master

echo "== Sync alm-production Hermes profile =="
if [ -d "$PROFILE_DIR/.git" ]; then
  git -C "$PROFILE_DIR" pull origin main
else
  echo "Profile git checkout not found at $PROFILE_DIR; skipping profile sync"
fi

echo "== Sync worker dependencies =="
cd "$REPO_DIR/worker"
uv sync --extra embedded --extra dev

echo "== Run release checks before touching the service =="
uv run pytest tests/ -q
uv run python _verify_s06.py
uv run python "$REPO_DIR/scripts/check-migrations.py"
"$REPO_DIR/scripts/validate-env.sh" worker
uv run python -m auditlayer_worker release-preflight

echo "== Ensure worker account home root exists =="
ACCOUNTS_ROOT="$(uv run python - <<'PY'
from auditlayer_worker.config import WorkerSettings

print(WorkerSettings.from_env().alm_accounts_root)
PY
)"
if [ ! -w "$ACCOUNTS_ROOT" ]; then
  sudo mkdir -p "$ACCOUNTS_ROOT"
  sudo chown "$(id -u):$(id -g)" "$ACCOUNTS_ROOT"
fi

echo "== Run mock worker smoke test =="
uv run python -m auditlayer_worker demo --handle test --generator mock

echo "== Diagnose Hermes connectivity =="
uv run python -m auditlayer_worker diagnose-hermes

echo "== Validate live embedded Hermes completion =="
uv run python -m auditlayer_worker validate-hermes

echo "== Install canonical systemd units =="
sudo cp "$REPO_DIR/worker/infra/auditlayer-worker@.service" /etc/systemd/system/
sudo cp "$REPO_DIR/worker/infra/auditlayer-pdf-worker.service" /etc/systemd/system/
sudo systemctl daemon-reload

echo "== Restart worker services =="
for service in $WORKER_SERVICES $PDF_SERVICE; do
  sudo systemctl enable "$service"
  sudo systemctl restart "$service"
done

echo "== Verify worker service status =="
sleep 3
for service in $WORKER_SERVICES $PDF_SERVICE; do
  sudo systemctl status "$service" --no-pager
done

echo "=== Deploy complete ==="
