"""Deterministic audit-to-audit change-classification contract tests.

P2 · C5 · F5 · D3: each material score delta is classified from pinned
prior/current metadata as evidence, brief/lens, methodology, or prior
correction ONLY when that cause is supported. Missing, contradictory,
or multiply changed metadata produces explicit UNKNOWN plus a correction
tip; it never defaults silently to evidence. UNKNOWN stays backward
compatible at the ledger boundary (projected to NULL, never a new
persisted vocabulary).

Fixture corpus: ``tests/fixtures/intelligence/change_classifier/*.json``.
Each fixture is self-contained: ``{"metadata": ..., "expected": ...}``.
All data is synthetic. Fixtures prove the software contract, never real
creator change or causality.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from auditlayer_worker.intelligence import (
    BoundedIntelligenceRuntime,
    CHANGE_KINDS,
    UNKNOWN_CHANGE,
    ChangeMetadata,
    ChannelInput,
    DeltaClassification,
    IntelligenceRunRequest,
    LedgerCommitError,
    ModelResponse,
    classify_change,
    normalize_evidence,
    score_ledger_rows,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "intelligence" / "change_classifier"

SUBJECT_ID = "11111111-1111-4111-8111-111111111111"
SNAPSHOT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
CHANNEL_ID = "22222222-2222-4222-8222-222222222222"


def _load(name: str) -> dict:
    path = FIXTURES_DIR / name
    if path.suffix != ".json":
        path = path.with_suffix(".json")
    return json.loads(path.read_text())


def _classify(name: str) -> DeltaClassification:
    fixture = _load(name)
    metadata = fixture["metadata"]
    return classify_change(
        ChangeMetadata(
            prior_result=metadata["prior_result"],
            prior_evidence_hashes=(
                tuple(metadata["prior_evidence_hashes"])
                if metadata["prior_evidence_hashes"] is not None
                else None
            ),
            current_evidence_hashes=tuple(metadata["current_evidence_hashes"]),
            current_brief_version=metadata["current_brief_version"],
            current_methodology_version=metadata["current_methodology_version"],
        )
    )


FIXTURE_NAMES = sorted(
    path.name for path in FIXTURES_DIR.glob("*.json") if path.name != "_gen_fixtures.py"
)
# Cause counts declared by the corpus (evidence 2, brief_lens 1,
# methodology 1, prior_correction 2, unknown 8 = 14 fixtures).
EXPECTED_COUNTS = {
    "evidence": 2,
    "brief_lens": 1,
    "methodology": 1,
    "prior_correction": 2,
    "unknown": 8,
}


# ---------------------------------------------------------------------------
# fixture corpus: every case classifies exactly as the contract declares
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("name", FIXTURE_NAMES)
def test_fixture_classifies_as_declared(name: str) -> None:
    fixture = _load(name)
    expected = fixture["expected"]
    result = _classify(name)

    assert result.cause == expected["cause"], (
        f"{name}: expected {expected['cause']!r}, got {result.cause!r}"
    )
    assert result.correction_tip is not None if expected["correction_tip_present"] else result.correction_tip is None
    assert tuple(result.supported_causes) == tuple(sorted(expected["supported_causes"]))


def test_corpus_covers_every_supported_cause_and_unknown() -> None:
    counts: dict[str, int] = {}
    for name in FIXTURE_NAMES:
        cause = _classify(name).cause
        counts[cause] = counts.get(cause, 0) + 1

    assert counts == EXPECTED_COUNTS
    assert set(counts) == set(CHANGE_KINDS) | {UNKNOWN_CHANGE}


# ---------------------------------------------------------------------------
# named assertions for the four supported causes
# ---------------------------------------------------------------------------


def test_evidence_cause_requires_differing_evidence_hashes() -> None:
    result = _classify("evidence_changed")
    assert result.cause == "evidence"
    assert result.correction_tip is None
    assert result.supported_causes == ("evidence",)


def test_brief_cause_requires_differing_brief_version() -> None:
    result = _classify("brief_changed")
    assert result.cause == "brief_lens"
    assert result.correction_tip is None


def test_methodology_cause_requires_differing_methodology_version() -> None:
    result = _classify("methodology_changed")
    assert result.cause == "methodology"
    assert result.correction_tip is None


def test_prior_correction_cause_requires_prior_correction_flag() -> None:
    result = _classify("prior_correction")
    assert result.cause == "prior_correction"
    assert result.correction_tip is None


def test_empty_prior_evidence_set_supports_evidence_cause() -> None:
    # An empty prior evidence set is present metadata: adding the first
    # evidence item is a real evidence change, unlike absent hashes.
    result = _classify("empty_prior_evidence_hashes")
    assert result.cause == "evidence"
    assert result.supported_causes == ("evidence",)


def test_prior_correction_survives_null_prior_versions() -> None:
    result = _classify("prior_correction_only_with_null_versions")
    assert result.cause == "prior_correction"
    assert result.correction_tip is None


# ---------------------------------------------------------------------------
# honest UNKNOWN: first run, unchanged, absent, contradictory, malformed
# ---------------------------------------------------------------------------


def test_first_run_with_no_prior_is_unknown_with_tip() -> None:
    result = _classify("first_run_no_prior")
    assert result.cause == UNKNOWN_CHANGE
    assert result.correction_tip
    assert "No prior result" in result.correction_tip
    assert result.supported_causes == ()


def test_unchanged_metadata_is_unknown_with_tip() -> None:
    result = _classify("unchanged_metadata")
    assert result.cause == UNKNOWN_CHANGE
    assert result.correction_tip
    assert "matches the current run" in result.correction_tip


def test_multiple_changes_are_unknown_with_tip() -> None:
    result = _classify("multiple_changed_brief_methodology")
    assert result.cause == UNKNOWN_CHANGE
    assert result.correction_tip is not None
    assert "brief_lens" in result.correction_tip
    assert "methodology" in result.correction_tip
    assert result.supported_causes == ("brief_lens", "methodology")

    correction_and_evidence = _classify("multiple_changed_correction_evidence")
    assert correction_and_evidence.cause == UNKNOWN_CHANGE
    assert correction_and_evidence.correction_tip is not None
    assert "prior_correction" in correction_and_evidence.correction_tip
    assert "evidence" in correction_and_evidence.correction_tip


def test_absent_evidence_hashes_never_becomes_evidence() -> None:
    # The baseline silently labeled insufficient metadata as evidence; the
    # classifier must fail closed to UNKNOWN with a tip naming the gap.
    result = _classify("absent_evidence_hashes")
    assert result.cause == UNKNOWN_CHANGE
    assert result.correction_tip is not None
    assert "prior evidence hashes" in result.correction_tip


def test_malformed_evidence_hashes_are_treated_absent_and_fail_closed() -> None:
    result = _classify("malformed_evidence_hashes")
    assert result.cause == UNKNOWN_CHANGE
    assert result.correction_tip


def test_null_prior_versions_are_unknown_with_tip() -> None:
    result = _classify("null_prior_versions")
    assert result.cause == UNKNOWN_CHANGE
    assert result.correction_tip is not None
    assert "prior brief version" in result.correction_tip
    assert "prior methodology version" in result.correction_tip


def test_reordered_evidence_hashes_are_not_a_change() -> None:
    # Ordering must never change the verdict: the same evidence set in a
    # different order is unchanged metadata, not an evidence delta.
    result = _classify("reordered_evidence_hashes")
    assert result.cause == UNKNOWN_CHANGE
    assert result.correction_tip


# ---------------------------------------------------------------------------
# typed invariants and determinism
# ---------------------------------------------------------------------------


def test_classification_vocabulary_is_locked() -> None:
    for name in FIXTURE_NAMES:
        result = _classify(name)
        assert result.cause in set(CHANGE_KINDS) | {UNKNOWN_CHANGE}


def test_unknown_always_carries_a_nonempty_tip_and_supported_never_does() -> None:
    for name in FIXTURE_NAMES:
        result = _classify(name)
        if result.cause == UNKNOWN_CHANGE:
            assert isinstance(result.correction_tip, str) and result.correction_tip.strip()
        else:
            assert result.correction_tip is None
            assert result.supported_causes == (result.cause,)


def test_classification_is_insensitive_to_metadata_insertion_order() -> None:
    fixture = _load("multiple_changed_brief_methodology")["metadata"]
    reversed_metadata = ChangeMetadata(
        prior_result=dict(reversed(list(fixture["prior_result"].items()))),
        prior_evidence_hashes=tuple(fixture["prior_evidence_hashes"]),
        current_evidence_hashes=tuple(reversed(fixture["current_evidence_hashes"])),
        current_brief_version=fixture["current_brief_version"],
        current_methodology_version=fixture["current_methodology_version"],
    )
    assert classify_change(reversed_metadata) == _classify(
        "multiple_changed_brief_methodology"
    )


def test_classification_rejects_unknown_cause_or_unknown_kind() -> None:
    with pytest.raises(ValueError, match="unknown change cause"):
        DeltaClassification(cause="fabricated", correction_tip=None)
    with pytest.raises(ValueError, match="correction tip"):
        DeltaClassification(cause=UNKNOWN_CHANGE, correction_tip=None)
    with pytest.raises(ValueError, match="correction tip"):
        DeltaClassification(cause=UNKNOWN_CHANGE, correction_tip="   ")
    with pytest.raises(ValueError, match="correction tip"):
        DeltaClassification(cause="evidence", correction_tip="unexpected tip")
    with pytest.raises(ValueError, match="persisted change kinds"):
        DeltaClassification(cause="evidence", correction_tip=None, supported_causes=("unknown",))


# ---------------------------------------------------------------------------
# runtime integration: canonical classifier runs before score serialization
# ---------------------------------------------------------------------------


def _evidence(suffix: str) -> dict:
    return normalize_evidence(
        subject_id=SUBJECT_ID,
        channel_id=CHANNEL_ID,
        source_type="official_web",
        source_url=f"https://example.com/{suffix}",
        observed_at="2026-07-23T01:02:03Z",
        confidence="high",
        payload={"text": suffix},
    )


def _request(run_id: str, *, prior_result=None) -> IntelligenceRunRequest:
    evidence = _evidence("a")
    return IntelligenceRunRequest(
        run_id=run_id,
        subject_id=SUBJECT_ID,
        brief_version=2,
        evidence_snapshot_id=SNAPSHOT_ID,
        subject_context={
            "schema_version": "1.0",
            "subject_id": SUBJECT_ID,
            "version": 2,
            "subject_type": "creator",
            "identity": {"name": "Ada"},
            "audience": {},
            "positioning": {},
            "offers": [],
            "goals": ["growth"],
            "constraints": [],
            "channels": [
                {
                    "channel_id": CHANNEL_ID,
                    "channel_type": "website",
                    "locator": "https://example.com",
                    "managed": True,
                }
            ],
        },
        channels=(ChannelInput(channel_id=CHANNEL_ID, channel_type="website", evidence=(evidence,)),),
        methodology_version="moat-1",
        expertise_pack_version="wellness-1",
        prompt_version="1.0",
        model_config_hash="c" * 64,
        output_schema_version="1.0",
        score_dimensions=("profile_clarity",),
        prior_result=prior_result,
    )


class _StaticModel:
    def analyze_channel(self, payload, *, policy):
        evidence_id = payload["channel"]["evidence"][0]["evidence_id"]
        return ModelResponse(
            {
                "schema_version": "1.0",
                "channel_type": "website",
                "evidence_coverage": {"used": [evidence_id], "unavailable": []},
                "findings": [
                    {
                        "id": "f1",
                        "claim": "A typed finding",
                        "evidence_ids": [evidence_id],
                        "confidence": "high",
                        "dimension_impacts": {"profile_clarity": 20},
                    }
                ],
                "recommendations": [],
                "context_update_proposals": [],
                "limitations": [],
            },
            10,
            5,
            0.001,
        )

    def synthesize(self, payload, *, policy):
        return ModelResponse(
            {"findings": [], "recommendations": [], "change_explanations": [], "limitations": []},
            1,
            1,
            0.0,
        )


def test_runtime_first_run_emits_unknown_with_tip_and_limitation() -> None:
    completed = BoundedIntelligenceRuntime(model=_StaticModel()).run(_request("run-first"))

    score = completed.result["scores"][0]
    assert score["change_cause"] == UNKNOWN_CHANGE
    assert isinstance(score["change_correction_tip"], str) and score["change_correction_tip"]
    assert any(score["change_correction_tip"] in limitation for limitation in completed.result["limitations"])


def test_runtime_supported_cause_is_emitted_without_tip() -> None:
    prior = {"brief_version": 1, "methodology_version": "moat-1", "prior_correction": False}
    completed = BoundedIntelligenceRuntime(model=_StaticModel()).run(
        _request("run-brief", prior_result=prior)
    )

    score = completed.result["scores"][0]
    assert score["change_cause"] == "brief_lens"
    assert score["change_correction_tip"] is None
    assert not any("No supported change cause" in limitation for limitation in completed.result["limitations"])


def test_runtime_pins_prior_evidence_hashes_through_the_adapter() -> None:
    # The runtime adapter extracts evidence_hashes from the pinned prior
    # result; differing hashes must surface as the evidence cause.
    prior = {
        "brief_version": 2,
        "methodology_version": "moat-1",
        "prior_correction": False,
        "evidence_hashes": ["0" * 64],
    }
    completed = BoundedIntelligenceRuntime(model=_StaticModel()).run(
        _request("run-evidence", prior_result=prior)
    )
    assert completed.result["scores"][0]["change_cause"] == "evidence"


# ---------------------------------------------------------------------------
# ledger adapter: UNKNOWN projects through the nullable path, never widens SQL
# ---------------------------------------------------------------------------


def test_ledger_projects_unknown_to_null_and_keeps_supported_kinds() -> None:
    run_id = "44444444-4444-4444-8444-444444444444"
    rows = score_ledger_rows(
        [
            {
                "dimension": "profile_clarity",
                "value": 70.0,
                "evidence_ids": ["e1"],
                "methodology_version": "moat-1",
                "previous_value": None,
                "change_cause": UNKNOWN_CHANGE,
                "change_correction_tip": "No supported change cause: prior metadata matches the current run.",
            },
            {
                "dimension": "audience_fit",
                "value": 55.0,
                "evidence_ids": ["e1"],
                "methodology_version": "moat-1",
                "previous_value": 50.0,
                "change_cause": "evidence",
            },
        ],
        run_id=run_id,
    )
    assert rows[0]["change_kind"] is None  # nullable projection, schema unchanged
    assert rows[1]["change_kind"] == "evidence"  # existing persisted value unchanged


def test_ledger_rejects_unknown_without_a_correction_tip() -> None:
    run_id = "44444444-4444-4444-8444-444444444444"
    with pytest.raises(LedgerCommitError, match="change_correction_tip is required"):
        score_ledger_rows(
            [
                {
                    "dimension": "profile_clarity",
                    "value": 70.0,
                    "evidence_ids": ["e1"],
                    "methodology_version": "moat-1",
                    "change_cause": UNKNOWN_CHANGE,
                }
            ],
            run_id=run_id,
        )


def test_ledger_rejects_out_of_vocabulary_change_kinds() -> None:
    run_id = "44444444-4444-4444-8444-444444444444"
    with pytest.raises(LedgerCommitError, match="change_kind is invalid"):
        score_ledger_rows(
            [
                {
                    "dimension": "profile_clarity",
                    "value": 70.0,
                    "evidence_ids": ["e1"],
                    "methodology_version": "moat-1",
                    "change_cause": "fabricated",
                }
            ],
            run_id=run_id,
        )
