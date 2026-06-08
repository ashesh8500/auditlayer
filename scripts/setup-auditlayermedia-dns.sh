#!/usr/bin/env bash
# Point auditlayermedia.com DNS at Vercel (Cloudflare DNS, proxy off).
# Requires CLOUDFLARE_API_TOKEN with Zone.DNS Edit on auditlayermedia.com.
set -euo pipefail

ZONE_ID="${CLOUDFLARE_ZONE_ID:-ac4cbe1f58aaca8ed7e25c42bd55a77a}"
DOMAIN="${AUDITLAYER_DOMAIN:-auditlayermedia.com}"
VERCEL_A="${VERCEL_A_RECORD:-76.76.21.21}"
VERCEL_CNAME="${VERCEL_WWW_CNAME:-cname.vercel-dns.com}"

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "CLOUDFLARE_API_TOKEN is required (Edit zone DNS template for ${DOMAIN})." >&2
  echo "Create one: https://dash.cloudflare.com/profile/api-tokens" >&2
  exit 1
fi

api() {
  local method="$1" path="$2" body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -fsS -X "$method" "https://api.cloudflare.com/client/v4${path}" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "$body"
  else
    curl -fsS -X "$method" "https://api.cloudflare.com/client/v4${path}" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"
  fi
}

record_body() {
  python3 - "$1" "$2" "$3" <<'PY'
import json, sys
print(json.dumps({
    "type": sys.argv[1],
    "name": sys.argv[2],
    "content": sys.argv[3],
    "ttl": 1,
    "proxied": False,
}))
PY
}

ensure_record() {
  local type="$1" name="$2" content="$3"
  local list existing body
  list="$(api GET "/zones/${ZONE_ID}/dns_records?type=${type}&name=${name}")"
  existing="$(echo "$list" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result'][0]['id'] if d.get('result') else '')")"
  body="$(record_body "$type" "$name" "$content")"
  if [[ -n "$existing" ]]; then
    api PATCH "/zones/${ZONE_ID}/dns_records/${existing}" "$body" >/dev/null
    echo "updated ${type} ${name} -> ${content} (dns only)"
  else
    api POST "/zones/${ZONE_ID}/dns_records" "$body" >/dev/null
    echo "created ${type} ${name} -> ${content} (dns only)"
  fi
}

ensure_record A "${DOMAIN}" "${VERCEL_A}"
ensure_record CNAME "www.${DOMAIN}" "${VERCEL_CNAME}"
echo "DNS ready. Verify: dig +short ${DOMAIN} A && dig +short www.${DOMAIN} CNAME"
