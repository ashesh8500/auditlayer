#!/usr/bin/env bash
# Run reviewed standalone drain code using the existing production dependencies.
set -euo pipefail
: "${DRAIN_TOKEN:?Set DRAIN_TOKEN to a retained UUID for this release/recovery}"
HERE=$(cd -- "$(dirname -- "$0")" && pwd)
exec sudo --preserve-env=DRAIN_TOKEN /opt/auditlayer/worker/.venv/bin/python "$HERE/drain.py" "$@"
