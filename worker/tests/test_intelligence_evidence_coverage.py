"""Evidence-coverage contract tests for the six customer answers.

P1 · C1/C2 · D3: every material metric, finding, score rationale, comparison,
and recommendation walks to a known evidence ID with complete provenance;
unknown/missing/stale-without-limitation references fail closed; unavailable
answers render ``Data needed`` only.

Fixture corpus: ``tests/fixtures/intelligence/answer_coverage/*.json``. Each
fixture is self-contained: ``{"payload": ..., "evidence": ...}``. All data is
synthetic. Fixtures prove the software contract, never creator efficacy or
report calibration.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from auditlayer_worker.intelligence import (
    ANSWER_KIND_LABELS,
    ANSWER_KINDS,
    DATA_NEEDED_MARKER,
    EvidenceValidationError,
    coverage_summary,
    validate_answer_coverage,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "intelligence" / "answer_coverage"

# Deterministic "now" so freshness/expiry checks never depend on wall clock.
NOW = datetime(2026, 8, 1, 12, 0, 0, tzinfo=timezone.utc)


def _load(name: str) -> dict:
    return json.loads((FIXTURES_DIR / name).read_text())


def _run(name: str) -> dict:
    """Validate one self-contained fixture at the fixed NOW."""
    fixture = _load(name)
    return validate_answer_coverage(
        fixture["payload"],
        evidence_records=fixture["evidence"],
        now=NOW,
    )


# ---------------------------------------------------------------------------
# valid corpus: all six answer kinds, complete provenance
# ---------------------------------------------------------------------------


def test_valid_fixture_covers_all_six_answer_kinds() -> None:
    result = _run("valid_all_six.json")

    assert set(result["answers"]) == set(ANSWER_KINDS)
    assert len(result["answers"]) == 6

    summary = coverage_summary(result)
    assert summary["answer_kinds"] == 6
    assert summary["answered"] == 6
    assert summary["data_needed"] == 0
    assert summary["material_claims"] >= 6  # at least one material claim per kind

    # Every answer kind resolves to a known label (the six customer questions).
    for kind in ANSWER_KINDS:
        assert kind in ANSWER_KIND_LABELS
        assert result["answers"][kind]["answer_kind"] == kind


def test_valid_fixture_every_material_claim_resolves_to_complete_provenance() -> None:
    result = _run("valid_all_six.json")

    for kind in ANSWER_KINDS:
        answer = result["answers"][kind]
        assert answer["state"] == "answered"
        assert answer["summary"].strip()
        assert answer["claims"], f"{kind} must carry material claims"
        for claim in answer["claims"]:
            assert claim["evidence_ids"], f"{kind} claim has no evidence ids"
            # Registry completeness is enforced by the validator; re-derive the
            # evidence registry from the fixture and confirm each referenced id
            # has observed_at, expiry, confidence, and limitation metadata.
            for evidence_id in claim["evidence_ids"]:
                record = _load("valid_all_six.json")["evidence"][evidence_id]
                assert record["observed_at"]
                assert record["expires_at"]
                assert record["confidence"] in {"low", "medium", "high", "authoritative"}
                assert isinstance(record["limitations"], list)


def test_valid_fixture_material_claim_kinds_are_represented() -> None:
    result = _run("valid_all_six.json")
    kinds_seen = {
        claim["claim_kind"]
        for answer in result["answers"].values()
        for claim in answer["claims"]
    }
    # The claim contract covers metrics, findings, score rationales,
    # comparisons, and recommendations across the six answers.
    assert "metric" in kinds_seen
    assert "finding" in kinds_seen
    assert "score_rationale" in kinds_seen
    assert "comparison" in kinds_seen
    assert "recommendation" in kinds_seen


# ---------------------------------------------------------------------------
# honest null: unavailable answers render Data needed, never fabricated precision
# ---------------------------------------------------------------------------


def test_honest_null_fixture_renders_data_needed() -> None:
    result = _run("honest_null_data_needed.json")

    summary = coverage_summary(result)
    assert summary["answer_kinds"] == 6
    assert summary["answered"] == 3
    assert summary["data_needed"] == 3

    for kind, answer in result["answers"].items():
        if answer["state"] == "data_needed":
            assert answer["claims"] == []
            assert any(DATA_NEEDED_MARKER in lim for lim in answer["limitations"])
        else:
            assert answer["claims"]


# ---------------------------------------------------------------------------
# fail closed: unknown, missing, stale-without-limitation, incomplete provenance
# ---------------------------------------------------------------------------


def test_unknown_evidence_reference_fails_closed() -> None:
    with pytest.raises(EvidenceValidationError, match="unknown evidence ID"):
        _run("invalid_unknown_evidence.json")


def test_missing_evidence_reference_fails_closed() -> None:
    with pytest.raises(EvidenceValidationError, match="must not be empty"):
        _run("invalid_missing_evidence.json")


def test_stale_without_limitation_fails_closed() -> None:
    with pytest.raises(EvidenceValidationError, match="stale evidence"):
        _run("invalid_stale_without_limitation.json")


def test_incomplete_provenance_fails_closed() -> None:
    with pytest.raises(EvidenceValidationError, match="confidence is invalid"):
        _run("invalid_incomplete_provenance.json")


def test_fabricated_precision_in_data_needed_fails_closed() -> None:
    with pytest.raises(EvidenceValidationError, match="data_needed must not carry"):
        _run("invalid_fabricated_precision.json")


def test_answered_without_material_claims_fails_closed() -> None:
    with pytest.raises(EvidenceValidationError, match="must carry at least one material claim"):
        _run("invalid_answered_without_claims.json")


# ---------------------------------------------------------------------------
# structural fail-closed checks (built in code, not fixtures)
# ---------------------------------------------------------------------------


def test_missing_answer_kind_fails_closed() -> None:
    fixture = _load("valid_all_six.json")
    payload = fixture["payload"]
    del payload["answers"]["money_move"]
    with pytest.raises(EvidenceValidationError, match="missing kind"):
        validate_answer_coverage(payload, evidence_records=fixture["evidence"], now=NOW)


def test_unknown_answer_kind_fails_closed() -> None:
    fixture = _load("valid_all_six.json")
    payload = fixture["payload"]
    payload["answers"]["not_a_real_answer"] = {
        "answer_kind": "not_a_real_answer",
        "state": "answered",
        "summary": "x",
        "claims": [],
        "limitations": [],
    }
    with pytest.raises(EvidenceValidationError, match="unknown kind"):
        validate_answer_coverage(payload, evidence_records=fixture["evidence"], now=NOW)


def test_data_needed_without_marker_fails_closed() -> None:
    fixture = _load("honest_null_data_needed.json")
    payload = fixture["payload"]
    payload["answers"]["blockers"]["limitations"] = ["No data yet"]  # no marker
    with pytest.raises(EvidenceValidationError, match=DATA_NEEDED_MARKER):
        validate_answer_coverage(payload, evidence_records=fixture["evidence"], now=NOW)


def test_stale_evidence_declared_in_limitation_is_allowed() -> None:
    # Same stale shape as the invalid fixture, but the answer declares the
    # staleness by naming the evidence id in a limitation — fail open with a
    # visible limitation, never silent reuse.
    fixture = _load("invalid_stale_without_limitation.json")
    payload = fixture["payload"]
    payload["answers"]["current_state"]["limitations"] = [
        "ev-stale-metrics expired; treat follower count as unverified.",
    ]
    result = validate_answer_coverage(
        payload, evidence_records=fixture["evidence"], now=NOW
    )
    assert result["answers"]["current_state"]["limitations"][0].startswith("ev-stale-metrics")


def test_coverage_summary_requires_six_kinds() -> None:
    result = _run("valid_all_six.json")
    summary = coverage_summary(result)
    assert summary == {
        "answer_kinds": 6,
        "answered": 6,
        "data_needed": 0,
        "material_claims": 10,
        "limitations": 2,
    }
