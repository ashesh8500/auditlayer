#!/usr/bin/env bash
# Sync credentials + env from laptop → hermes-vm, then bootstrap.
# Requires SSH host `hermes-vm` in ~/.ssh/config (see docs/hermes-vm.md).
set -euo pipefail

HOST="${HERMES_VM_HOST:-hermes-vm}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "== Syncing AuditLayer → ${HOST} =="

ssh -o ConnectTimeout=15 "${HOST}" 'mkdir -p ~/.config/supabase ~/.local/share/com.vercel.cli ~/projects/auditlayer/supabase/.temp ~/projects/auditlayer/web/.vercel'

# Worker secrets (gitignored locally)
if [[ -f "${REPO_ROOT}/worker/.env" ]]; then
  rsync -az "${REPO_ROOT}/worker/.env" "${HOST}:~/projects/auditlayer/worker/.env"
  echo "✓ worker/.env"
else
  echo "⚠ worker/.env missing locally — copy worker/.env.example on VM manually"
fi

# Optional web secrets (for rare on-VM Next.js work)
if [[ -f "${REPO_ROOT}/web/.env.local" ]]; then
  rsync -az "${REPO_ROOT}/web/.env.local" "${HOST}:~/projects/auditlayer/web/.env.local"
  echo "✓ web/.env.local"
fi

# Supabase CLI access token (Personal Access Token — sbp_...)
# Create at https://supabase.com/dashboard/account/tokens
# Store locally in infra/hermes-vm/.supabase-access-token (gitignored) or export SUPABASE_ACCESS_TOKEN.
SUPABASE_TOKEN=""
TOKEN_FILE="${AUDITLAYER_SUPABASE_TOKEN_FILE:-${REPO_ROOT}/infra/hermes-vm/.supabase-access-token}"
if [[ -f "${TOKEN_FILE}" ]]; then
  SUPABASE_TOKEN="$(tr -d '[:space:]' < "${TOKEN_FILE}")"
elif [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  SUPABASE_TOKEN="${SUPABASE_ACCESS_TOKEN}"
fi
if [[ -n "${SUPABASE_TOKEN}" && "${SUPABASE_TOKEN}" == sbp_* ]]; then
  printf '%s' "${SUPABASE_TOKEN}" | ssh "${HOST}" 'cat > ~/.config/supabase/access-token && chmod 600 ~/.config/supabase/access-token'
  echo "✓ Supabase access token"
else
  echo "⚠ Supabase PAT skipped — create sbp_* token → infra/hermes-vm/.supabase-access-token (migrations still work from laptop)"
fi

# Supabase link metadata (no secrets)
if [[ -d "${REPO_ROOT}/supabase/.temp" ]]; then
  rsync -az "${REPO_ROOT}/supabase/.temp/" "${HOST}:~/projects/auditlayer/supabase/.temp/"
  echo "✓ supabase/.temp"
fi

# Vercel CLI auth (macOS)
VERCEL_AUTH="${HOME}/Library/Application Support/com.vercel.cli/auth.json"
if [[ -f "${VERCEL_AUTH}" ]]; then
  rsync -az "${VERCEL_AUTH}" "${HOST}:~/.local/share/com.vercel.cli/auth.json"
  chmod 600 "${VERCEL_AUTH}" 2>/dev/null || true
  echo "✓ Vercel auth.json"
elif [[ -f "${HOME}/.local/share/com.vercel.cli/auth.json" ]]; then
  rsync -az "${HOME}/.local/share/com.vercel.cli/auth.json" "${HOST}:~/.local/share/com.vercel.cli/auth.json"
  echo "✓ Vercel auth.json (linux path)"
else
  echo "⚠ Vercel auth missing — run: vercel login (on laptop), then re-sync"
fi

# Vercel project link (no secrets)
if [[ -d "${REPO_ROOT}/web/.vercel" ]]; then
  rsync -az "${REPO_ROOT}/web/.vercel/" "${HOST}:~/projects/auditlayer/web/.vercel/"
  echo "✓ web/.vercel"
fi

# Bootstrap script (repo file — syncthing may lag; rsync ensures latest)
rsync -az "${REPO_ROOT}/infra/hermes-vm/bootstrap.sh" "${HOST}:~/projects/auditlayer/infra/hermes-vm/bootstrap.sh"
ssh "${HOST}" 'chmod +x ~/projects/auditlayer/infra/hermes-vm/bootstrap.sh'

echo ""
echo "Running remote bootstrap..."
ssh "${HOST}" 'bash ~/projects/auditlayer/infra/hermes-vm/bootstrap.sh'

echo ""
echo "Done. SSH in: ssh ${HOST}"
