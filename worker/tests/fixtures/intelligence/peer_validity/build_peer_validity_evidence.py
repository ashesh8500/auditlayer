#!/usr/bin/env python3
"""Deterministic peer-validity evidence builder (ALM-I-024 / W015).

Loads the sanitized fixture matrix, runs the same-tier peer-validity auditor
over the cached benchmark/peer shape, and writes a byte-identical evidence
document. Run twice and `cmp` to prove determinism:

    cd worker
    uv run python tests/fixtures/intelligence/peer_validity/build_peer_validity_evidence.py \
        --output /tmp/alm-w015-peer-a.json
    uv run python tests/fixtures/intelligence/peer_validity/build_peer_validity_evidence.py \
        --output /tmp/alm-w015-peer-b.json
    cmp /tmp/alm-w015-peer-a.json /tmp/alm-w015-peer-b.json
    python3 -m json.tool /tmp/alm-w015-peer-a.json >/dev/null

The document records one classification per peer row, exact reason counts,
``provider_calls=0``, ``network_calls=0``, ``live_handle_validity=UNKNOWN``,
and no environment path or wall-clock timestamp (evaluated_at is the fixed
fixture time). Fixtures prove the software contract only.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
# Allow running from anywhere by importing the worker package when on sys.path
# (uv run from worker/ puts the editable package on sys.path).
try:  # pragma: no cover - import guard for standalone execution
    from auditlayer_worker.intelligence.peer_validity import (
        ADMISSIBLE,
        DATA_NEEDED,
        LIVE_HANDLE_VALIDITY,
        PEER_FRESHNESS_DAYS,
        REJECTED,
        audit_benchmark_cache,
    )
except ImportError:  # pragma: no cover
    sys.path.insert(0, str(HERE.parents[2]))  # worker/
    from auditlayer_worker.intelligence.peer_validity import (
        ADMISSIBLE,
        DATA_NEEDED,
        LIVE_HANDLE_VALIDITY,
        PEER_FRESHNESS_DAYS,
        REJECTED,
        audit_benchmark_cache,
    )

MATRIX_PATH = HERE / "peer_validity_matrix.json"
DEFAULT_OUTPUT = HERE / "peer_validity_evidence.json"


def load_matrix() -> dict:
    return json.loads(MATRIX_PATH.read_text(encoding="utf-8"))


def build_evidence_document(matrix: dict) -> dict:
    """Run the auditor over the matrix and produce the deterministic document."""
    evaluated_at = datetime.fromisoformat(
        matrix["evaluated_at"].replace("Z", "+00:00")
    ).astimezone(timezone.utc)
    benchmarks = matrix["benchmarks"]
    report = audit_benchmark_cache(benchmarks, now=evaluated_at)

    rows = []
    for verdict in report.rows:
        rows.append(
            {
                "handle": verdict.handle,
                "normalized_handle": verdict.normalized_handle,
                "classification": verdict.classification,
                "reason_code": verdict.reason_code,
                "framing": verdict.framing,
                "source_age_days": verdict.source_age_days,
                "rationale_present": verdict.rationale is not None,
                "benchmark_niche": verdict.niche,
                "bracket": verdict.bracket,
                "platform": verdict.platform,
            }
        )

    return {
        "schema_version": "1.0",
        "generated_by": "worker/tests/fixtures/intelligence/peer_validity/build_peer_validity_evidence.py",
        "live_provider": False,
        "provider_calls": 0,
        "network_calls": 0,
        "live_handle_validity": LIVE_HANDLE_VALIDITY,
        "freshness_days": PEER_FRESHNESS_DAYS,
        "evaluated_at": matrix["evaluated_at"],
        "summary": report.summary(),
        "reasons": report.reasons(),
        "rows": rows,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="output JSON path (default: the checked-in evidence fixture)",
    )
    args = parser.parse_args(argv)

    document = build_evidence_document(load_matrix())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(document, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(f"wrote {args.output}")
    print(
        f"summary={document['summary']} reasons={document['reasons']} "
        f"provider_calls={document['provider_calls']} "
        f"network_calls={document['network_calls']} "
        f"live_handle_validity={document['live_handle_validity']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
