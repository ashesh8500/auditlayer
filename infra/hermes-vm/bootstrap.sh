#!/usr/bin/env bash
# Run on hermes-vm after sync (or via: make hermes-vm-bootstrap)
set -euo pipefail

export PATH="${HOME}/.local/bin:${HOME}/.npm-global/bin:/usr/local/bin:${PATH}"
# Load Supabase PAT for non-interactive CLI (optional)
if [[ -f "${HOME}/.config/supabase/access-token" ]]; then
  export SUPABASE_ACCESS_TOKEN="$(tr -d '[:space:]' < "${HOME}/.config/supabase/access-token")"
fi

REPO="${HERMES_VM_REPO:-${HOME}/projects/auditlayer}"
WORKER="${REPO}/worker"
WEB="${REPO}/web"

echo "== AuditLayer hermes-vm bootstrap =="
echo "repo: ${REPO}"

# --- uv (worker runtime) ---
if ! command -v uv >/dev/null 2>&1; then
  echo "Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="${HOME}/.local/bin:${PATH}"
fi

# --- worker env (Linux overrides) ---
if [[ -f "${WORKER}/.env" ]]; then
  if ! grep -q '^HERMES_MODE=' "${WORKER}/.env"; then
    sed -i '/^HERMES_API_BASE=/i HERMES_MODE=http' "${WORKER}/.env" 2>/dev/null || echo 'HERMES_MODE=http' >> "${WORKER}/.env"
  fi
fi

echo "Syncing worker Python deps..."
cd "${WORKER}"
uv sync

echo "Hermes diagnostics..."
uv run python -m auditlayer_worker diagnose-hermes

# --- Supabase CLI (npx, token from ~/.config/supabase/access-token) ---
if [[ -f "${HOME}/.config/supabase/access-token" ]]; then
  echo "Supabase CLI: access token present"
  cd "${REPO}"
  if [[ -f supabase/.temp/project-ref ]]; then
    REF="$(cat supabase/.temp/project-ref)"
    npx --yes supabase@latest link --project-ref "${REF}" 2>/dev/null || true
    npx --yes supabase@latest projects list 2>/dev/null | head -5 || true
  fi
else
  echo "Supabase CLI: no token — run 'make hermes-vm-sync' from laptop"
fi

# --- Vercel CLI ---
if ! command -v vercel >/dev/null 2>&1; then
  echo "Installing Vercel CLI..."
  npm install -g vercel@latest 2>/dev/null || npm install -g vercel@latest --prefix "${HOME}/.npm-global"
fi

if [[ -f "${HOME}/.local/share/com.vercel.cli/auth.json" ]]; then
  echo "Vercel CLI: auth present — $(vercel whoami 2>/dev/null || echo 'check auth')"
  if [[ -f "${WEB}/.vercel/project.json" ]]; then
    echo "Vercel project linked: ${WEB}/.vercel/project.json"
  fi
else
  echo "Vercel CLI: no auth — run 'make hermes-vm-sync' from laptop"
fi

# --- gh (usually already configured) ---
if command -v gh >/dev/null 2>&1; then
  gh auth status -h github.com 2>/dev/null | head -3 || true
fi

# --- shell convenience ---
MARKER="# auditlayer hermes-vm"
if ! grep -q "${MARKER}" "${HOME}/.bashrc" 2>/dev/null; then
  cat >> "${HOME}/.bashrc" <<'EOF'

# auditlayer hermes-vm
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$PATH"
[[ -f "$HOME/.config/supabase/access-token" ]] && export SUPABASE_ACCESS_TOKEN="$(tr -d '[:space:]' < "$HOME/.config/supabase/access-token")"
alias al='cd ~/projects/auditlayer'
alias alw='cd ~/projects/auditlayer/worker'
alias alworker='cd ~/projects/auditlayer/worker && uv run python -m auditlayer_worker'
alias alvercel='cd ~/projects/auditlayer/web && vercel'
alias alsupa='cd ~/projects/auditlayer && npx supabase@latest'
EOF
fi

echo ""
echo "Bootstrap complete."
echo "  Worker:  cd ${WORKER} && uv run python -m auditlayer_worker run"
echo "  Logs:    journalctl -u auditlayer-worker -f  (after systemd install)"
echo "  Hermes:  hermes gateway status"
