#!/usr/bin/env bash
# DEVELOPMENT CHECKOUT ONLY. Does not install/start services, copy credentials,
# mutate a production environment, link providers, or invoke inference.
set -euo pipefail
: "${HERMES_VM_REPO:?Set HERMES_VM_REPO to the development checkout}"
REPO=$(realpath "$HERMES_VM_REPO")
[[ "$REPO" != /opt/auditlayer && "$REPO" != /opt/auditlayer/* ]] || { echo 'Use worker/infra/deploy.sh for production' >&2; exit 1; }
command -v uv >/dev/null || { echo 'Install a reviewed uv version first' >&2; exit 1; }
cd "$REPO/worker"
uv sync --frozen --extra embedded --extra dev
# Require the fixed current contract explicitly; do not silently rewrite .env.
# No credentials are printed.
.venv/bin/python - <<'PY'
from dotenv import dotenv_values
from pathlib import Path
values = dotenv_values('.env') if Path('.env').exists() else {}
if values.get('HERMES_MODE') != 'inprocess':
    raise SystemExit('Set HERMES_MODE=inprocess explicitly in the development environment.')
import openai
print('Embedded dependencies available; required HERMES_MODE=inprocess.')
PY
printf 'Development dependencies ready. Production releases use worker/infra/deploy.sh with a reviewed SHA and drain hook.\n'
