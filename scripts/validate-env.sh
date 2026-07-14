#!/usr/bin/env bash
# validate-env.sh — check that required env vars are set for each component.
# Usage: bash scripts/validate-env.sh [web|worker|all]
# Exit code 0 = all good, 1 = missing variables found.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*"; MISSING=$((MISSING+1)); }

MISSING=0

check_var() {
  local component="$1" var="$2" hint="${3:-}"
  if [[ -z "${!var:-}" ]]; then
    fail "$component: \$$var is not set${hint:+ ($hint)}"
  else
    ok "$component: \$$var is set"
  fi
}

check_web() {
  echo "--- Web app (Next.js / Vercel) ---"
  check_var web NEXT_PUBLIC_SITE_URL "required for auth redirect + Stripe return URLs"
  check_var web NEXT_PUBLIC_SUPABASE_URL "from Supabase project settings"
  check_var web NEXT_PUBLIC_SUPABASE_ANON_KEY "public anon key"
  if [[ -n "${CI:-}" ]]; then
    ok "web: CI mode — SUPABASE_SERVICE_ROLE_KEY not required for build"
  else
    check_var web SUPABASE_SERVICE_ROLE_KEY "required for server actions, signed URLs"
  fi
}

check_worker() {
  echo "--- Worker (Hermes / Hetzner) ---"
  check_var worker SUPABASE_URL "Supabase project URL"
  check_var worker SUPABASE_SERVICE_ROLE_KEY "bypass RLS"
  check_var worker HERMES_MODEL "production: gpt-5.6-sol"
  check_var worker HERMES_PROVIDER "production: openai-codex"
  check_var worker AUDITLAYER_GENERATOR "hermes (prod) | mock (QA)"
  if [[ "${HERMES_MODEL:-}" != "gpt-5.6-sol" ]]; then
    fail "worker: HERMES_MODEL must be gpt-5.6-sol for this release"
  fi
  if [[ "${HERMES_PROVIDER:-}" != "openai-codex" ]]; then
    fail "worker: HERMES_PROVIDER must be openai-codex for this release"
  fi
  if [[ "${HERMES_MODE:-}" != "inprocess" ]]; then
    fail "worker: HERMES_MODE must be inprocess for embedded Hermes"
  fi
}

case "${1:-all}" in
  web)    check_web ;;
  worker) check_worker ;;
  all)    check_web; check_worker ;;
  *)
    echo "Usage: $0 [web|worker|all]" >&2
    exit 1
    ;;
esac

echo ""
if [[ "$MISSING" -eq 0 ]]; then
  echo "All required env vars are set."
else
  echo "${MISSING} variable(s) missing — check hints above."
  exit 1
fi
