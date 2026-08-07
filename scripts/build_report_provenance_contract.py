#!/usr/bin/env python3
"""ALM report-intelligence provenance contract artifact — deterministic, no-secret.

One local command emits a byte-stable JSON artifact that pins the seven
canonical version fields of the report-version ↔ intelligence-run provenance
contract (ALM-I-025):

    living_brief_version, evidence_snapshot_id, methodology_version,
    expertise_pack_version, prompt_version, model_config_hash,
    output_schema_version

The artifact records ``provider_calls: 0`` and ``network_calls: 0`` because
the contract is exercised by recording/static fixtures only. It contains no
environment paths, no wall-clock timestamps, no report body, no handle, no
email, no URL, no credential, and no storage path — rerunning the builder
produces byte-identical output (``cmp``).

Usage:
    python3 scripts/build_report_provenance_contract.py [--output PATH]

Exit codes:
    0  artifact written (or stdout when --output is omitted)
    3  usage / output error

Fixtures prove the software contract only — never live FK behavior, RLS,
creator efficacy, or business value.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

MANIFEST_VERSION = "1.0"

# Canonical manifest vocabulary. Must stay in parity with
# worker/auditlayer_worker/intelligence/report_provenance.py and
# web/src/lib/report-provenance.ts (asserted by the focused tests).
REPORT_PROVENANCE_FIELDS: tuple[str, ...] = (
    "living_brief_version",  # intelligence_runs.brief_version
    "evidence_snapshot_id",  # intelligence_runs.evidence_snapshot_id
    "methodology_version",  # intelligence_runs.methodology_version
    "expertise_pack_version",  # intelligence_runs.expertise_pack_version
    "prompt_version",  # intelligence_runs.prompt_version
    "model_config_hash",  # intelligence_runs.model_config_hash
    "output_schema_version",  # intelligence_runs.output_schema_version
)

# Deterministic fixture run values — no real customer data, no secrets.
FIXTURE_RUN = {
    "intelligence_run_id": "33333333-3333-4333-8333-333333333333",
    "living_brief_version": 3,
    "evidence_snapshot_id": "22222222-2222-4222-8222-222222222222",
    "methodology_version": "alm-bridge-v1",
    "expertise_pack_version": "social-media-audit",
    "prompt_version": "1.1",
    "model_config_hash": "abc123def456",
    "output_schema_version": "1.0",
}


def build_contract() -> dict:
    """Return the deterministic non-secret provenance contract artifact."""
    manifest = {
        field: FIXTURE_RUN[field]
        for field in REPORT_PROVENANCE_FIELDS
    }
    return {
        "schema": "report-intelligence-provenance-contract",
        "manifest_version": MANIFEST_VERSION,
        "status": "pinned",
        "intelligence_run_id": FIXTURE_RUN["intelligence_run_id"],
        "manifest": manifest,
        "provider_calls": 0,
        "network_calls": 0,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Emit the deterministic report-intelligence provenance contract."
    )
    parser.add_argument(
        "--output",
        metavar="PATH",
        help="Write the artifact JSON to PATH (otherwise stdout).",
    )
    args = parser.parse_args()

    payload = json.dumps(
        build_contract(),
        indent=2,
        sort_keys=True,
        ensure_ascii=True,
    )
    if args.output:
        out = Path(args.output)
        try:
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(payload + "\n", encoding="utf-8")
        except OSError as exc:
            print(f"could not write {out}: {exc}", file=sys.stderr)
            return 3
    else:
        print(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
