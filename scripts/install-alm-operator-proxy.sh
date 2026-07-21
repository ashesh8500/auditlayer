#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${AUDITLAYER_REPO_DIR:-$HOME/projects/auditlayer}"
SOURCE="$REPO_ROOT/infra/nginx/hermes-dashboard"
TARGET="/etc/nginx/sites-available/hermes-dashboard"
BACKUP="${TARGET}.prev-$(date +%s)"

if [[ ! -f "$SOURCE" ]]; then
  printf 'Missing canonical nginx config: %s\n' "$SOURCE" >&2
  exit 1
fi

sudo cp -a "$TARGET" "$BACKUP"
sudo install -m 0644 "$SOURCE" "$TARGET"
if ! sudo nginx -t; then
  sudo cp -a "$BACKUP" "$TARGET"
  sudo nginx -t
  printf 'Nginx validation failed; restored %s\n' "$BACKUP" >&2
  exit 1
fi
sudo systemctl reload nginx
printf 'Installed operator API proxy. Rollback: sudo cp -a %q %q && sudo nginx -t && sudo systemctl reload nginx\n' "$BACKUP" "$TARGET"
