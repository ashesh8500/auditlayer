#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8000}"
ADMIN_TOKEN="${AUDITLAYER_ADMIN_TOKEN:-}"

health="$(curl -fsS "$BASE_URL/health")"
printf '%s\n' "$health" | grep -q '"ok": true'

if [[ -n "$ADMIN_TOKEN" ]]; then
  curl -fsS "$BASE_URL/admin?token=$ADMIN_TOKEN" >/dev/null
fi

echo "auditlayer smoke check passed for $BASE_URL"

