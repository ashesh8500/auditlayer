"""Bounded typed manifest projecting an immutable report version onto its
canonical intelligence-run provenance.

An immutable report version may reference at most one same-subject completed
intelligence run (``audit_report_versions.intelligence_run_id``). This module
owns the seven canonical pinned version fields and the deterministic manifest
vocabulary used by report readers (web/MCP projections) and the provenance
contract artifact. It never reads report prose and never backfills: missing or
legacy provenance projects explicit UNKNOWN with a correction tip and never
blocks retrieval. Fixtures prove the software contract only — never live FK
behavior, RLS, or customer value.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

# Canonical manifest vocabulary version. Bump only on a breaking vocabulary
# change (never for spelling fixes; keep parity with web/src/lib/report-provenance.ts).
REPORT_PROVENANCE_MANIFEST_VERSION = "1.0"

# The seven canonical pinned fields, in manifest order. Each maps to exactly
# one intelligence_runs kernel column; the same ordered tuple is mirrored by
# the web projection module (drift is caught by the focused parity tests).
REPORT_PROVENANCE_FIELDS: tuple[str, ...] = (
    "living_brief_version",  # intelligence_runs.brief_version
    "evidence_snapshot_id",  # intelligence_runs.evidence_snapshot_id
    "methodology_version",  # intelligence_runs.methodology_version
    "expertise_pack_version",  # intelligence_runs.expertise_pack_version
    "prompt_version",  # intelligence_runs.prompt_version
    "model_config_hash",  # intelligence_runs.model_config_hash
    "output_schema_version",  # intelligence_runs.output_schema_version
)

# Manifest field -> authoritative intelligence_runs column.
INTELLIGENCE_RUN_COLUMN: dict[str, str] = {
    "living_brief_version": "brief_version",
    "evidence_snapshot_id": "evidence_snapshot_id",
    "methodology_version": "methodology_version",
    "expertise_pack_version": "expertise_pack_version",
    "prompt_version": "prompt_version",
    "model_config_hash": "model_config_hash",
    "output_schema_version": "output_schema_version",
}

CORRECTION_TIP_UNKNOWN = (
    "This report version is not pinned to a same-subject completed "
    "intelligence run; provenance is UNKNOWN. The report is legacy or was "
    "produced outside the subject ledger bridge."
)


def project_report_provenance(run_row: Mapping[str, Any] | None) -> dict[str, Any]:
    """Project one ``intelligence_runs`` row into the bounded typed manifest.

    Pinned only when every canonical field is present and non-empty. Any
    missing field returns explicit UNKNOWN with a correction tip — never a
    partial manifest and never prose-derived backfill. The manifest is a
    read-side projection; it never becomes canonical state.
    """
    if run_row is None:
        return {
            "manifest_version": REPORT_PROVENANCE_MANIFEST_VERSION,
            "status": "unknown",
            "correction_tip": CORRECTION_TIP_UNKNOWN,
        }
    run_id = str(run_row.get("id") or "")
    manifest: dict[str, Any] = {}
    for field in REPORT_PROVENANCE_FIELDS:
        column = INTELLIGENCE_RUN_COLUMN[field]
        value = run_row.get(column)
        if value is None or (isinstance(value, str) and not value.strip()):
            return {
                "manifest_version": REPORT_PROVENANCE_MANIFEST_VERSION,
                "status": "unknown",
                "correction_tip": (
                    f"Intelligence run {run_id or 'unknown'} is missing "
                    f"{field}; provenance cannot be pinned."
                ),
            }
        manifest[field] = value
    return {
        "manifest_version": REPORT_PROVENANCE_MANIFEST_VERSION,
        "status": "pinned",
        "intelligence_run_id": run_id,
        "manifest": manifest,
    }
