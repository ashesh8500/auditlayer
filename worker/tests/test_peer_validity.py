"""Same-tier peer validity auditor tests (ALM-I-024 / W015).

Covers the fixture matrix required by the card: valid same-tier admission,
follower-bracket boundaries (inclusive min / exclusive max / open 500k+),
stale and missing provenance, malformed and unverifiable handles, duplicate
normalized handles, niche/platform mismatch, unknown relation → neutral
framing, contradictory collaborator/competitor evidence, and missing metrics.

Valid rows emit exactly one bounded rationale plus a deterministic source
age; every invalid row emits zero valid-peer lines and an exact correction
code. The evidence document is byte-identical across reruns and records
``provider_calls=0``, ``network_calls=0``, and ``live_handle_validity=UNKNOWN``
with no environment path or wall-clock timestamp.

Mock/static only: no live provider, network, browser, Supabase, or Hermes
call. Fixtures prove parser/admission/projection contracts only — never live
handle existence, metric freshness in production, relationship truth, report
calibration, creator efficacy, or business impact.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from auditlayer_worker.core import _format_benchmark_cache
from auditlayer_worker.intelligence.peer_validity import (
    ADMISSIBLE,
    DATA_NEEDED,
    LIVE_HANDLE_VALIDITY,
    NEUTRAL_FRAMING,
    PEER_DUPLICATE_HANDLE,
    PEER_FRESHNESS_DAYS,
    PEER_HANDLE_MALFORMED,
    PEER_HANDLE_MISSING,
    PEER_HANDLE_UNVERIFIABLE,
    PEER_MISSING_FOLLOWERS,
    PEER_MISSING_METRICS,
    PEER_MISSING_PROVENANCE,
    PEER_NICHE_MISMATCH,
    PEER_OFF_TIER,
    PEER_PLATFORM_UNSUPPORTED,
    PEER_RELATIONSHIP_CONTRADICTORY,
    PEER_RELATIONSHIP_UNSUPPORTED,
    PEER_STALE_PROVENANCE,
    REJECTED,
    audit_benchmark_cache,
    audit_peer,
    normalize_handle,
    parse_followers_bracket,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "intelligence" / "peer_validity"
MATRIX_PATH = FIXTURES / "peer_validity_matrix.json"
EVIDENCE_PATH = FIXTURES / "peer_validity_evidence.json"
BUILDER_PATH = FIXTURES / "build_peer_validity_evidence.py"

# Evaluated_at fixed in the matrix (not a wall-clock timestamp).
EVALUATED_AT = datetime(2026, 8, 7, 12, 0, 0, tzinfo=timezone.utc)

# Exact expected classification summary for the checked-in matrix.
EXPECTED_SUMMARY = {"admissible": 6, "data_needed": 4, "rejected": 10}
EXPECTED_REASONS = {
    PEER_OFF_TIER: 1,
    PEER_STALE_PROVENANCE: 1,
    PEER_MISSING_PROVENANCE: 2,
    PEER_HANDLE_MALFORMED: 1,
    PEER_HANDLE_MISSING: 1,
    PEER_HANDLE_UNVERIFIABLE: 1,
    PEER_NICHE_MISMATCH: 1,
    PEER_PLATFORM_UNSUPPORTED: 1,
    PEER_MISSING_METRICS: 1,
    PEER_MISSING_FOLLOWERS: 1,
    PEER_RELATIONSHIP_CONTRADICTORY: 1,
    PEER_RELATIONSHIP_UNSUPPORTED: 1,
    PEER_DUPLICATE_HANDLE: 1,
}


def _matrix() -> dict[str, Any]:
    return json.loads(MATRIX_PATH.read_text(encoding="utf-8"))


def _benchmark(matrix: dict[str, Any], niche: str, bracket: str) -> dict[str, Any]:
    for bm in matrix["benchmarks"]:
        if bm["niche"] == niche and bm["followers_bracket"] == bracket:
            return bm
    raise AssertionError(f"benchmark not found: {niche} {bracket}")


def _peer_row(**overrides: Any) -> dict[str, Any]:
    row: dict[str, Any] = {
        "handle": "longevitylab",
        "niche": "longevity",
        "followers": 24100,
        "platform": "instagram",
        "avg_likes": 890,
        "avg_comments": 45,
        "top_format": "reel",
        "source_url": "https://example.com/sources/longevitylab-profile",
        "source_observed_at": "2026-06-26T09:00:00Z",
        "verification_status": "unverified",
        "relationship_status": "unknown",
        "relationship_evidence": [],
    }
    row.update(overrides)
    return row


def _parent() -> dict[str, Any]:
    return {
        "id": "b-lon-10k",
        "niche": "longevity",
        "followers_bracket": "10k-50k",
        "avg_engagement": 3.2,
        "top_formats": ["carousel", "reel"],
    }


# ---------------------------------------------------------------------------
# Deterministic helpers
# ---------------------------------------------------------------------------


def test_normalize_handle_strips_case_at_and_whitespace() -> None:
    assert normalize_handle("@LongevityLab") == "longevitylab"
    assert normalize_handle("  LongevityLab  ") == "longevitylab"
    assert normalize_handle("@@longevitylab") == "@longevitylab"  # one leading @ only
    assert normalize_handle(123) == ""
    assert normalize_handle(None) == ""


def test_parse_followers_bracket_handles_all_canonical_shapes() -> None:
    assert parse_followers_bracket("1k-10k") == (1000, 10000)
    assert parse_followers_bracket("10k-50k") == (10000, 50000)
    assert parse_followers_bracket("50k-100k") == (50000, 100000)
    assert parse_followers_bracket("100k-500k") == (100000, 500000)
    assert parse_followers_bracket("500k+") == (500000, None)
    assert parse_followers_bracket("1m+") == (1_000_000, None)
    assert parse_followers_bracket("10k - 50k") == (10000, 50000)
    assert parse_followers_bracket("garbage") is None
    assert parse_followers_bracket(None) is None
    assert parse_followers_bracket("") is None


# ---------------------------------------------------------------------------
# Matrix classification
# ---------------------------------------------------------------------------


def test_matrix_classifies_every_row_exactly_once() -> None:
    matrix = _matrix()
    report = audit_benchmark_cache(matrix["benchmarks"], now=EVALUATED_AT)
    total_peers = sum(len(bm.get("peers") or []) for bm in matrix["benchmarks"])
    assert len(report.rows) == total_peers == 20
    assert all(v.classification in (ADMISSIBLE, DATA_NEEDED, REJECTED) for v in report.rows)
    assert report.summary() == EXPECTED_SUMMARY
    assert report.reasons() == EXPECTED_REASONS


def test_matrix_expected_case_codes() -> None:
    matrix = _matrix()
    report = audit_benchmark_cache(matrix["benchmarks"], now=EVALUATED_AT)

    def first(normalized: str):
        matches = [v for v in report.rows if v.normalized_handle == normalized]
        assert matches, f"no row for {normalized}"
        return matches[0]

    assert first("longevitylab").classification == ADMISSIBLE
    assert first("longevitylab").source_age_days == 42
    assert first("longevitylab").framing == NEUTRAL_FRAMING
    assert first("longevitylab").rationale is not None

    # Bracket boundaries: 10k is the inclusive lower bound, 50k the exclusive
    # upper bound of 10k-50k (so 50k belongs to the next bracket).
    assert first("bracketlowerboundary").classification == ADMISSIBLE
    assert first("upper_boundary").classification == REJECTED
    assert first("upper_boundary").reason_code == PEER_OFF_TIER
    assert first("openendedlongevity").classification == ADMISSIBLE

    # Provenance: stale and missing.
    assert first("stale_peer").classification == REJECTED
    assert first("stale_peer").reason_code == PEER_STALE_PROVENANCE
    assert first("no_source_url").classification == DATA_NEEDED
    assert first("no_source_url").reason_code == PEER_MISSING_PROVENANCE
    assert first("no_source_time").classification == DATA_NEEDED
    assert first("no_source_time").reason_code == PEER_MISSING_PROVENANCE

    # Handles: malformed, missing, unverifiable.
    assert first("bad handle").classification == REJECTED
    assert first("bad handle").reason_code == PEER_HANDLE_MALFORMED
    assert first("").classification == REJECTED
    assert first("").reason_code == PEER_HANDLE_MISSING
    assert first("failed_verify").classification == REJECTED
    assert first("failed_verify").reason_code == PEER_HANDLE_UNVERIFIABLE

    # Niche/platform mismatch.
    assert first("niche_wrong").classification == REJECTED
    assert first("niche_wrong").reason_code == PEER_NICHE_MISMATCH
    assert first("platform_odd").classification == REJECTED
    assert first("platform_odd").reason_code == PEER_PLATFORM_UNSUPPORTED

    # Missing data.
    assert first("missing_metrics").classification == DATA_NEEDED
    assert first("missing_metrics").reason_code == PEER_MISSING_METRICS
    assert first("missing_followers").classification == DATA_NEEDED
    assert first("missing_followers").reason_code == PEER_MISSING_FOLLOWERS

    # Relationship framing.
    assert first("contradictory_rel").classification == REJECTED
    assert first("contradictory_rel").reason_code == PEER_RELATIONSHIP_CONTRADICTORY
    assert first("claimed_no_evidence").classification == REJECTED
    assert first("claimed_no_evidence").reason_code == PEER_RELATIONSHIP_UNSUPPORTED
    assert first("collaborator_peer").classification == ADMISSIBLE
    assert first("collaborator_peer").framing == "collaborator"
    assert first("competitor_peer").classification == ADMISSIBLE
    assert first("competitor_peer").framing == "competitor"
    assert first("verified_peer").classification == ADMISSIBLE
    assert "stored verification: verified" in (first("verified_peer").rationale or "")

    # Duplicate normalized identity across benchmarks: first wins.
    dup = [v for v in report.rows if v.reason_code == PEER_DUPLICATE_HANDLE]
    assert len(dup) == 1
    assert dup[0].handle == "longevitylab" and dup[0].normalized_handle == "longevitylab"


def test_valid_rows_emit_one_bounded_rationale_plus_source_age() -> None:
    matrix = _matrix()
    report = audit_benchmark_cache(matrix["benchmarks"], now=EVALUATED_AT)
    for verdict in report.rows:
        if verdict.classification == ADMISSIBLE:
            assert verdict.rationale is not None
            assert 0 < len(verdict.rationale) <= 320
            assert verdict.source_age_days is not None
            assert verdict.framing in (NEUTRAL_FRAMING, "collaborator", "competitor")


def test_invalid_rows_emit_zero_rationale_and_exact_correction_code() -> None:
    matrix = _matrix()
    report = audit_benchmark_cache(matrix["benchmarks"], now=EVALUATED_AT)
    for verdict in report.rows:
        if verdict.classification != ADMISSIBLE:
            assert verdict.rationale is None
            assert verdict.reason_code is not None
            assert verdict.correction_tip is not None
            assert verdict.source_age_days is None


def test_audit_peer_unknown_relationship_defaults_to_neutral_framing() -> None:
    parent = _parent()
    verdict = audit_peer(
        _peer_row(), parent_benchmark=parent, now=EVALUATED_AT, seen_handles=set()
    )
    assert verdict.classification == ADMISSIBLE
    assert verdict.framing == NEUTRAL_FRAMING
    assert verdict.rationale is not None
    assert "relationship unknown → neutral framing" in verdict.rationale
    assert "source observed 42d ago" in verdict.rationale


def test_audit_peer_contradictory_evidence_rejected() -> None:
    verdict = audit_peer(
        _peer_row(
            relationship_evidence=[
                {"kind": "collaborator", "source_url": "https://example.com/a"},
                {"kind": "competitor", "source_url": "https://example.com/b"},
            ]
        ),
        parent_benchmark=_parent(),
        now=EVALUATED_AT,
        seen_handles=set(),
    )
    assert verdict.classification == REJECTED
    assert verdict.reason_code == PEER_RELATIONSHIP_CONTRADICTORY


def test_audit_peer_relationship_claim_without_evidence_rejected() -> None:
    verdict = audit_peer(
        _peer_row(relationship_status="collaborator", relationship_evidence=[]),
        parent_benchmark=_parent(),
        now=EVALUATED_AT,
        seen_handles=set(),
    )
    assert verdict.classification == REJECTED
    assert verdict.reason_code == PEER_RELATIONSHIP_UNSUPPORTED


def test_audit_peer_verification_failed_rejected_but_live_validity_unknown() -> None:
    verdict = audit_peer(
        _peer_row(verification_status="failed"),
        parent_benchmark=_parent(),
        now=EVALUATED_AT,
        seen_handles=set(),
    )
    assert verdict.classification == REJECTED
    assert verdict.reason_code == PEER_HANDLE_UNVERIFIABLE


def test_audit_peer_missing_metrics_never_renders_zero() -> None:
    for field in ("avg_likes", "avg_comments", "followers"):
        row = _peer_row(**{field: None})
        verdict = audit_peer(
            row, parent_benchmark=_parent(), now=EVALUATED_AT, seen_handles=set()
        )
        assert verdict.classification == DATA_NEEDED
        assert verdict.reason_code in (PEER_MISSING_METRICS, PEER_MISSING_FOLLOWERS)
        assert verdict.metrics is None
        assert verdict.rationale is None


def test_audit_peer_freshness_boundary_exact_threshold() -> None:
    # source observed exactly PEER_FRESHNESS_DAYS ago is still fresh.
    fresh = _peer_row(source_observed_at="2026-02-08T12:00:00Z")
    verdict = audit_peer(
        fresh, parent_benchmark=_parent(), now=EVALUATED_AT, seen_handles=set()
    )
    assert verdict.classification == ADMISSIBLE
    assert verdict.source_age_days == PEER_FRESHNESS_DAYS

    stale = _peer_row(source_observed_at="2026-02-07T12:00:00Z")
    verdict = audit_peer(
        stale, parent_benchmark=_parent(), now=EVALUATED_AT, seen_handles=set()
    )
    assert verdict.classification == REJECTED
    assert verdict.reason_code == PEER_STALE_PROVENANCE


# ---------------------------------------------------------------------------
# Deterministic evidence document
# ---------------------------------------------------------------------------


def _build_evidence() -> dict[str, Any]:
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "build_peer_validity_evidence", BUILDER_PATH
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.build_evidence_document(module.load_matrix())


def test_evidence_document_is_deterministic_and_redaction_safe() -> None:
    first = _build_evidence()
    second = _build_evidence()
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)

    rendered = json.dumps(first, sort_keys=True)
    # No environment path, no wall-clock timestamp, no secret-like payloads.
    assert "/home/" not in rendered
    assert str(Path.home()) not in rendered
    assert "provider_calls" in rendered and first["provider_calls"] == 0
    assert first["network_calls"] == 0
    assert first["live_handle_validity"] == LIVE_HANDLE_VALIDITY
    assert first["evaluated_at"] == "2026-08-07T12:00:00Z"
    assert "datetime.now" not in rendered
    assert "Bearer" not in rendered and "key=" not in rendered


def test_evidence_fixture_matches_rebuilt_document() -> None:
    rebuilt = _build_evidence()
    checked_in = json.loads(EVIDENCE_PATH.read_text(encoding="utf-8"))
    assert checked_in == rebuilt
    assert checked_in["summary"] == EXPECTED_SUMMARY
    assert checked_in["reasons"] == EXPECTED_REASONS
    assert checked_in["provider_calls"] == 0
    assert checked_in["network_calls"] == 0


# ---------------------------------------------------------------------------
# _format_benchmark_cache projection
# ---------------------------------------------------------------------------


def test_format_benchmark_cache_emits_only_admissible_candidate_leads() -> None:
    matrix = _matrix()
    rendered = _format_benchmark_cache(matrix["benchmarks"], now=EVALUATED_AT)

    # Only admissible handles appear as lead lines; rejected/data-needed rows
    # appear only as bounded Data needed/Rejected summaries.
    assert "@longevitylab" in rendered
    assert "@openendedlongevity" in rendered
    assert "@collaborator_peer" in rendered

    # Invalid rows are never rendered as valid peer lines with fabricated data.
    assert "[Rejected] @upper_boundary — PEER_OFF_TIER" in rendered
    # The off-tier row must not appear as a lead line with its stored metrics.
    assert "@upper_boundary — 50,000 followers" not in rendered
    assert "[Rejected] @stale_peer — PEER_STALE_PROVENANCE" in rendered
    assert "[Data needed] @no_source_url — PEER_MISSING_PROVENANCE" in rendered
    assert "[Data needed] @no_source_time — PEER_MISSING_PROVENANCE" in rendered
    assert "[Data needed] @missing_metrics — PEER_MISSING_METRICS" in rendered
    assert "[Data needed] @missing_followers — PEER_MISSING_FOLLOWERS" in rendered
    assert "[Rejected] @bad handle — PEER_HANDLE_MALFORMED" in rendered
    assert "[Rejected] @failed_verify — PEER_HANDLE_UNVERIFIABLE" in rendered
    assert "[Rejected] @niche_wrong — PEER_NICHE_MISMATCH" in rendered
    assert "[Rejected] @platform_odd — PEER_PLATFORM_UNSUPPORTED" in rendered
    assert "[Rejected] @contradictory_rel — PEER_RELATIONSHIP_CONTRADICTORY" in rendered
    assert "[Rejected] @claimed_no_evidence — PEER_RELATIONSHIP_UNSUPPORTED" in rendered
    assert "[Rejected] @longevitylab — PEER_DUPLICATE_HANDLE" in rendered

    # Unknown relationships never receive collaborator/competitor framing.
    assert "relationship unknown → neutral framing" in rendered
    # Missing metrics are never fabricated as zeros in a lead line: the exact
    # fabricated-zero patterns (a leading comma-space zero) must be absent,
    # while legitimate stored values like "890 avg likes" remain present.
    assert "0 avg likes, 0 avg comments" not in rendered
    assert "— 0 followers" not in rendered
    assert "— 0, " not in rendered
    assert "890 avg likes" in rendered


def test_format_benchmark_cache_empty_and_none() -> None:
    assert _format_benchmark_cache(None, now=EVALUATED_AT) == "No cached benchmark data available."
    assert _format_benchmark_cache([], now=EVALUATED_AT) == "No cached benchmark data available."


def test_format_benchmark_cache_valid_rows_carry_rationale_and_source_age() -> None:
    matrix = _matrix()
    rendered = _format_benchmark_cache(matrix["benchmarks"], now=EVALUATED_AT)
    assert "[peer-validity] same-tier peer @longevitylab in longevity (10k-50k)" in rendered
    assert "source observed 42d ago" in rendered
    assert "live handle validity UNKNOWN" in rendered
