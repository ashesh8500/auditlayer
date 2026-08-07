"""Adversarial runtime contract tests — targets invariant boundaries not covered
by the existing contract/inference/runtime/website suites.

All inference and network activity is mocked. No live models or customer data.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Any

import pytest

from auditlayer_worker.intelligence import (
    BoundedIntelligenceRuntime,
    ChannelInput,
    EvidenceValidationError,
    InferencePolicy,
    IntelligenceRunRequest,
    ModelResponse,
    RuntimePolicyError,
    RuntimeTelemetry,
    normalize_evidence,
    validate_channel_analysis,
)
from auditlayer_worker.intelligence.evidence import canonical_json
from auditlayer_worker.intelligence.validation import (
    validate_context_proposals,
    validate_findings,
    validate_recommendations,
)

# ---------------------------------------------------------------------------
# shared fixtures
# ---------------------------------------------------------------------------

SUBJECT_ID = "11111111-1111-4111-8111-111111111111"
SNAPSHOT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
CH_IDS = (
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
    "44444444-4444-4444-8444-444444444444",
    "55555555-5555-4555-8555-555555555555",
    "66666666-6666-4666-8666-666666666666",
    "77777777-7777-4777-8777-777777777777",
    "88888888-8888-4888-8888-888888888888",
    "99999999-9999-4999-8999-999999999999",
    "00000000-0000-4000-8000-000000000000",
)


def _evidence(channel_id: str, suffix: str) -> dict[str, Any]:
    return normalize_evidence(
        subject_id=SUBJECT_ID,
        channel_id=channel_id,
        source_type="official_web",
        source_url=f"https://example.com/{suffix}",
        observed_at="2026-07-23T01:02:03Z",
        confidence="high",
        payload={"text": suffix},
    )


def _context(channel_ids: tuple[str, ...]) -> dict[str, Any]:
    types = ("instagram", "website", "youtube", "linkedin", "x", "tiktok")
    return {
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
                "channel_id": ch_id,
                "channel_type": types[i % len(types)],
                "locator": "public locator",
                "managed": True,
            }
            for i, ch_id in enumerate(channel_ids)
        ],
    }


def _request(
    run_id: str,
    *,
    channel_count: int = 1,
    prompt_version: str = "1.0",
    channel_ids: tuple[str, ...] | None = None,
) -> IntelligenceRunRequest:
    types = ("instagram", "website", "youtube", "linkedin", "x", "tiktok")
    if channel_ids is None:
        channel_ids = CH_IDS[:channel_count]
    channels = tuple(
        ChannelInput(
            channel_id=channel_ids[i],
            channel_type=types[i % len(types)],
            evidence=(_evidence(channel_ids[i], chr(97 + i)),),
        )
        for i in range(channel_count)
    )
    return IntelligenceRunRequest(
        run_id=run_id,
        subject_id=SUBJECT_ID,
        brief_version=2,
        evidence_snapshot_id=SNAPSHOT_ID,
        subject_context=_context(channel_ids),
        channels=channels,
        methodology_version="moat-1",
        expertise_pack_version="wellness-1",
        prompt_version=prompt_version,
        model_config_hash="c" * 64,
        output_schema_version="1.0",
    )


def _model_response(channel_type: str, evidence_id: str) -> dict[str, Any]:
    return {
        "schema_version": "1.0",
        "channel_type": channel_type,
        "evidence_coverage": {"used": [evidence_id], "unavailable": []},
        "findings": [
            {
                "id": f"finding-{channel_type}",
                "claim": "A finding.",
                "evidence_ids": [evidence_id],
                "confidence": "high",
                "dimension_impacts": {"profile_clarity": 20},
            }
        ],
        "recommendations": [
            {
                "id": f"rec-{channel_type}",
                "action": "Do something.",
                "evidence_ids": [evidence_id],
            }
        ],
        "context_update_proposals": [],
        "limitations": [],
    }


class _FixedModel:
    """Returns a valid analysis for every channel."""

    def __init__(self) -> None:
        self.channel_calls = 0
        self.synthesis_calls = 0

    def analyze_channel(self, payload: dict[str, Any], *, policy: InferencePolicy) -> ModelResponse:
        self.channel_calls += 1
        channel = payload["channel"]
        return ModelResponse(
            _model_response(
                channel["channel_type"],
                channel["evidence"][0]["evidence_id"],
            ),
            20,
            10,
            0.001,
        )

    def synthesize(self, payload: dict[str, Any], *, policy: InferencePolicy) -> ModelResponse:
        self.synthesis_calls += 1
        return ModelResponse(
            {"findings": [], "recommendations": [], "change_explanations": [], "limitations": []},
            10,
            5,
            0.0,
        )


# ===================================================================
# Channel count enforcement
# ===================================================================


def test_zero_channels_rejected() -> None:
    with pytest.raises(RuntimePolicyError, match="at most eight channels and at least one"):
        BoundedIntelligenceRuntime(model=_FixedModel()).run(
            _request("zero-ch", channel_count=0, channel_ids=())
        )


def test_nine_channels_rejected() -> None:
    with pytest.raises(RuntimePolicyError, match="at most eight channels"):
        BoundedIntelligenceRuntime(model=_FixedModel()).run(
            _request("nine-ch", channel_count=9, channel_ids=CH_IDS)
        )


def test_duplicate_channel_ids_rejected() -> None:
    dup_ids = (CH_IDS[0], CH_IDS[0])
    with pytest.raises(RuntimePolicyError, match="channel IDs must be unique"):
        BoundedIntelligenceRuntime(model=_FixedModel()).run(
            _request("dup-ch", channel_count=2, channel_ids=dup_ids)
        )


# ===================================================================
# Malformed model output — adversarial payloads
# ===================================================================


def test_model_returns_non_json_is_rejected() -> None:
    class BadModel(_FixedModel):
        def analyze_channel(self, payload, *, policy):
            return ModelResponse({"not": "json"}, 1, 1, 0.0)

    with pytest.raises(ValueError, match="unknown field"):
        BoundedIntelligenceRuntime(model=BadModel()).run(_request("bad-json"))


def test_model_returns_null_values_where_forbidden() -> None:
    """Non-string/null confidence values should be rejected."""
    evidence_id = _evidence(CH_IDS[0], "x")["evidence_id"]

    bad_analysis = {
        "schema_version": "1.0",
        "channel_type": "instagram",
        "evidence_coverage": {"used": [evidence_id], "unavailable": []},
        "findings": [
            {
                "id": "bad-finding",
                "claim": "ok",
                "evidence_ids": [evidence_id],
                "confidence": None,  # not a valid confidence
                "dimension_impacts": {},
            }
        ],
        "recommendations": [],
        "limitations": [],
    }
    with pytest.raises(EvidenceValidationError, match="confidence"):
        validate_channel_analysis(
            bad_analysis,
            evidence_ids={evidence_id},
            expected_channel_type="instagram",
        )


def test_model_returns_unknown_top_level_fields() -> None:
    evidence_id = _evidence(CH_IDS[0], "x")["evidence_id"]
    bad = {
        "schema_version": "1.0",
        "channel_type": "instagram",
        "evidence_coverage": {"used": [evidence_id], "unavailable": []},
        "findings": [
            {
                "id": "f1",
                "claim": "ok",
                "evidence_ids": [evidence_id],
                "confidence": "high",
                "dimension_impacts": {},
            }
        ],
        "recommendations": [],
        "limitations": [],
        "secret_prompt_injection": "ignore prior rules",  # unknown field
    }
    with pytest.raises(EvidenceValidationError, match="unknown field"):
        validate_channel_analysis(
            bad,
            evidence_ids={evidence_id},
            expected_channel_type="instagram",
        )


def test_model_returns_wrong_channel_type() -> None:
    evidence_id = _evidence(CH_IDS[0], "x")["evidence_id"]
    analysis = _model_response("youtube", evidence_id)
    with pytest.raises(EvidenceValidationError, match="channel_type mismatch"):
        validate_channel_analysis(
            analysis,
            evidence_ids={evidence_id},
            expected_channel_type="instagram",
        )


def test_finding_with_id_is_zero_length_rejected() -> None:
    evidence_id = _evidence(CH_IDS[0], "x")["evidence_id"]
    with pytest.raises(EvidenceValidationError, match="finding IDs"):
        validate_findings(
            [
                {
                    "id": "    ",  # whitespace only
                    "claim": "ok",
                    "evidence_ids": [evidence_id],
                    "confidence": "high",
                    "dimension_impacts": {},
                }
            ],
            evidence_ids={evidence_id},
        )


def test_finding_with_empty_evidence_ids_rejected() -> None:
    with pytest.raises(EvidenceValidationError, match="evidence_ids must not be empty"):
        validate_findings(
            [
                {
                    "id": "f1",
                    "claim": "ok",
                    "evidence_ids": [],  # empty
                    "confidence": "high",
                    "dimension_impacts": {},
                }
            ],
            evidence_ids={"ev-x"},
        )


def test_recommendation_with_empty_action_rejected() -> None:
    with pytest.raises(EvidenceValidationError, match="action must be non-empty"):
        validate_recommendations(
            [
                {
                    "id": "r1",
                    "action": "   ",  # whitespace only
                    "evidence_ids": ["ev-x"],
                }
            ],
            evidence_ids={"ev-x"},
        )


def test_dimension_impact_beyond_bounds_rejected() -> None:
    evidence_id = _evidence(CH_IDS[0], "x")["evidence_id"]
    with pytest.raises(EvidenceValidationError, match="dimension impacts"):
        validate_findings(
            [
                {
                    "id": "f1",
                    "claim": "ok",
                    "evidence_ids": [evidence_id],
                    "confidence": "high",
                    "dimension_impacts": {"profile_clarity": 150},
                }
            ],
            evidence_ids={evidence_id},
        )

    with pytest.raises(EvidenceValidationError, match="dimension impacts"):
        validate_findings(
            [
                {
                    "id": "f2",
                    "claim": "ok",
                    "evidence_ids": [evidence_id],
                    "confidence": "high",
                    "dimension_impacts": {"profile_clarity": -150},
                }
            ],
            evidence_ids={evidence_id},
        )


def test_dimension_impact_bool_rejected() -> None:
    evidence_id = _evidence(CH_IDS[0], "x")["evidence_id"]
    with pytest.raises(EvidenceValidationError, match="dimension impacts"):
        validate_findings(
            [
                {
                    "id": "f1",
                    "claim": "ok",
                    "evidence_ids": [evidence_id],
                    "confidence": "high",
                    "dimension_impacts": {"profile_clarity": True},
                }
            ],
            evidence_ids={evidence_id},
        )


# ===================================================================
# Item count enforcement (max findings 30, recommendations 20, proposals 20)
# ===================================================================


def test_exactly_30_findings_accepted_31_rejected() -> None:
    evidence_id = _evidence(CH_IDS[0], "x")["evidence_id"]
    ok = validate_findings(
        [
            {
                "id": f"f{i}",
                "claim": f"finding {i}",
                "evidence_ids": [evidence_id],
                "confidence": "high",
                "dimension_impacts": {},
            }
            for i in range(30)
        ],
        evidence_ids={evidence_id},
    )
    assert len(ok) == 30

    with pytest.raises(EvidenceValidationError, match="at most 30"):
        validate_findings(
            [
                {
                    "id": f"f{i}",
                    "claim": "x",
                    "evidence_ids": [evidence_id],
                    "confidence": "high",
                    "dimension_impacts": {},
                }
                for i in range(31)
            ],
            evidence_ids={evidence_id},
        )


def test_exactly_20_recommendations_accepted_21_rejected() -> None:
    evidence_id = _evidence(CH_IDS[0], "x")["evidence_id"]
    ok = validate_recommendations(
        [
            {"id": f"r{i}", "action": f"rec {i}", "evidence_ids": [evidence_id]}
            for i in range(20)
        ],
        evidence_ids={evidence_id},
    )
    assert len(ok) == 20

    with pytest.raises(EvidenceValidationError, match="at most 20"):
        validate_recommendations(
            [
                {"id": f"r{i}", "action": f"rec {i}", "evidence_ids": [evidence_id]}
                for i in range(21)
            ],
            evidence_ids={evidence_id},
        )


def test_exactly_20_proposals_accepted_21_rejected() -> None:
    evidence_id = _evidence(CH_IDS[0], "x")["evidence_id"]
    from uuid import uuid4

    def _proposal(idx: int) -> dict[str, Any]:
        return {
            "schema_version": "1.0",
            "proposal_id": str(uuid4()),
            "subject_id": SUBJECT_ID,
            "base_version": 2,
            "path": f"/goals/{idx}",
            "operation": "add",
            "proposed_value": f"goal-{idx}",
            "evidence_ids": [evidence_id],
            "reason": "needed",
            "status": "proposed",
        }

    ok = validate_context_proposals(
        [_proposal(i) for i in range(20)],
        evidence_ids={evidence_id},
        subject_id=SUBJECT_ID,
        base_version=2,
    )
    assert len(ok) == 20

    with pytest.raises(EvidenceValidationError, match="at most 20"):
        validate_context_proposals(
            [_proposal(i) for i in range(21)],
            evidence_ids={evidence_id},
            subject_id=SUBJECT_ID,
            base_version=2,
        )


# ===================================================================
# Double correction rejection
# ===================================================================


def test_double_correction_on_channel_is_refused() -> None:
    class DoubleCorrupt(_FixedModel):
        def analyze_channel(self, payload, *, policy):
            raise ValueError("not json")

        def correct_channel(self, payload, *, invalid_payload, error, policy):
            # Returns still-invalid output
            return ModelResponse({"bad": "still invalid"}, 1, 1, 0.0)

    runtime = BoundedIntelligenceRuntime(model=DoubleCorrupt())
    with pytest.raises(ValueError):
        runtime.run(_request("double-correct"))


def test_double_correction_on_synthesis_is_refused() -> None:
    class DoubleCorruptSynth(_FixedModel):
        def synthesize(self, payload, *, policy):
            raise ValueError("not json")

        def correct_synthesis(self, payload, *, invalid_payload, error, policy):
            return ModelResponse({"bad": "still invalid"}, 1, 1, 0.0)

    runtime = BoundedIntelligenceRuntime(model=DoubleCorruptSynth())
    with pytest.raises(ValueError):
        runtime.run(_request("double-correct-synth", channel_count=2))


# ===================================================================
# Synthesis is never called for single channel
# ===================================================================


def test_synthesis_never_called_for_single_channel() -> None:
    model = _FixedModel()
    BoundedIntelligenceRuntime(model=model).run(_request("single-no-synth"))
    assert model.synthesis_calls == 0


# ===================================================================
# Result determinism — same inputs produce identical outputs
# ===================================================================


def test_result_is_deterministic() -> None:
    runtime = BoundedIntelligenceRuntime(model=_FixedModel())
    first = runtime.run(_request("det-1"))
    second = runtime.run(_request("det-1"))

    assert first.result == second.result
    # Byte-identical serialization
    assert canonical_json(first.result) == canonical_json(second.result)


def test_result_is_deterministic_multi_channel() -> None:
    runtime = BoundedIntelligenceRuntime(model=_FixedModel())
    first = runtime.run(_request("det-multi-1", channel_count=2))
    second = runtime.run(_request("det-multi-1", channel_count=2))

    assert first.result == second.result
    assert canonical_json(first.result) == canonical_json(second.result)


def test_assembly_orders_channel_results_predictably() -> None:
    """Channel results in the output must mirror input channel order."""
    runtime = BoundedIntelligenceRuntime(model=_FixedModel())
    result = runtime.run(_request("order-check", channel_count=3))

    channel_types = [c["channel_type"] for c in result.result["channel_results"]]
    assert channel_types == ["instagram", "website", "youtube"]


# ===================================================================
# Scoring determinism and edge cases
# ===================================================================


def test_scores_clamp_at_0_and_100() -> None:
    """Dimension impacts should produce values strictly in [0, 100]."""
    from auditlayer_worker.intelligence.runtime import _scores

    # Extreme negative impacts
    evidence_id = _evidence(CH_IDS[0], "x")["evidence_id"]
    channel = {
        "findings": [
            {
                "id": "f1",
                "claim": "bad",
                "evidence_ids": [evidence_id],
                "confidence": "high",
                "dimension_impacts": {"clarity": -500},
            }
        ]
    }

    result = _scores(
        [channel],
        dimensions=("clarity",),
        methodology_version="moat-1",
        prior_scores={},
        change_cause="evidence",
    )
    assert result[0]["value"] == 0.0  # clamped at 0

    # Extreme positive impacts
    channel["findings"][0]["dimension_impacts"]["clarity"] = 500
    result = _scores(
        [channel],
        dimensions=("clarity",),
        methodology_version="moat-1",
        prior_scores={},
        change_cause="evidence",
    )
    assert result[0]["value"] == 100.0  # clamped at 100


def test_dimension_with_no_impacts_is_null() -> None:
    from auditlayer_worker.intelligence.runtime import _scores

    result = _scores(
        [{"findings": []}],
        dimensions=("clarity",),
        methodology_version="moat-1",
        prior_scores={},
        change_cause="evidence",
    )
    assert result[0]["value"] is None
    assert result[0]["evidence_ids"] == []


# ===================================================================
# InferencePolicy boundary attacks
# ===================================================================


def test_policy_rejects_zero_or_negative_tokens() -> None:
    with pytest.raises(RuntimePolicyError, match="token limits"):
        InferencePolicy(channel_max_tokens=0)
    with pytest.raises(RuntimePolicyError, match="token limits"):
        InferencePolicy(synthesis_max_tokens=-1)


def test_policy_rejects_timeout_zero_or_above_150() -> None:
    with pytest.raises(RuntimePolicyError, match="timeout"):
        InferencePolicy(timeout_seconds=0)
    with pytest.raises(RuntimePolicyError, match="timeout"):
        InferencePolicy(timeout_seconds=151)


def test_policy_rejects_non_deepseek_provider() -> None:
    with pytest.raises(RuntimePolicyError, match="DeepSeek"):
        InferencePolicy(provider="openai")


def test_policy_rejects_non_zero_temperature() -> None:
    with pytest.raises(RuntimePolicyError, match="temperature"):
        InferencePolicy(temperature=0.5)


def test_policy_rejects_any_tool() -> None:
    with pytest.raises(RuntimePolicyError, match="tool-free"):
        InferencePolicy(tools=("web",))


def test_policy_rejects_memory() -> None:
    with pytest.raises(RuntimePolicyError, match="stateless"):
        InferencePolicy(memory=True)


def test_policy_rejects_delegation() -> None:
    with pytest.raises(RuntimePolicyError, match="stateless"):
        InferencePolicy(delegation=True)


def test_policy_rejects_fallback_model() -> None:
    with pytest.raises(RuntimePolicyError, match="fallback"):
        InferencePolicy(fallback_model="gpt-4")


# ===================================================================
# Context update proposal validation
# ===================================================================


def test_proposal_rejects_wrong_subject_id() -> None:
    evidence_id = _evidence(CH_IDS[0], "x")["evidence_id"]
    with pytest.raises(EvidenceValidationError, match="violates contract"):
        validate_context_proposals(
            [
                {
                    "schema_version": "1.0",
                    "proposal_id": "99999999-9999-4999-8999-999999999999",
                    "subject_id": "wrong-subject-id-00000000000000",
                    "base_version": 2,
                    "path": "/goals/0",
                    "operation": "add",
                    "proposed_value": "goal",
                    "evidence_ids": [evidence_id],
                    "reason": "needed",
                    "status": "proposed",
                }
            ],
            evidence_ids={evidence_id},
            subject_id=SUBJECT_ID,
            base_version=2,
        )


def test_proposal_rejects_wrong_base_version() -> None:
    evidence_id = _evidence(CH_IDS[0], "x")["evidence_id"]
    with pytest.raises(EvidenceValidationError, match="violates contract"):
        validate_context_proposals(
            [
                {
                    "schema_version": "1.0",
                    "proposal_id": "99999999-9999-4999-8999-999999999999",
                    "subject_id": SUBJECT_ID,
                    "base_version": 3,  # doesn't match
                    "path": "/goals/0",
                    "operation": "add",
                    "proposed_value": "goal",
                    "evidence_ids": [evidence_id],
                    "reason": "needed",
                    "status": "proposed",
                }
            ],
            evidence_ids={evidence_id},
            subject_id=SUBJECT_ID,
            base_version=2,
        )


def test_proposal_rejects_non_proposed_status() -> None:
    evidence_id = _evidence(CH_IDS[0], "x")["evidence_id"]
    with pytest.raises(EvidenceValidationError, match="violates contract"):
        validate_context_proposals(
            [
                {
                    "schema_version": "1.0",
                    "proposal_id": "99999999-9999-4999-8999-999999999999",
                    "subject_id": SUBJECT_ID,
                    "base_version": 2,
                    "path": "/goals/0",
                    "operation": "add",
                    "proposed_value": "goal",
                    "evidence_ids": [evidence_id],
                    "reason": "needed",
                    "status": "accepted",  # must be proposed
                }
            ],
            evidence_ids={evidence_id},
            subject_id=SUBJECT_ID,
            base_version=2,
        )


def test_proposal_rejects_path_not_starting_with_slash() -> None:
    evidence_id = _evidence(CH_IDS[0], "x")["evidence_id"]
    with pytest.raises(EvidenceValidationError, match="violates contract"):
        validate_context_proposals(
            [
                {
                    "schema_version": "1.0",
                    "proposal_id": "99999999-9999-4999-8999-999999999999",
                    "subject_id": SUBJECT_ID,
                    "base_version": 2,
                    "path": "goals/0",  # no leading slash
                    "operation": "add",
                    "proposed_value": "goal",
                    "evidence_ids": [evidence_id],
                    "reason": "needed",
                    "status": "proposed",
                }
            ],
            evidence_ids={evidence_id},
            subject_id=SUBJECT_ID,
            base_version=2,
        )


def test_proposal_rejects_invalid_operation() -> None:
    evidence_id = _evidence(CH_IDS[0], "x")["evidence_id"]
    with pytest.raises(EvidenceValidationError, match="violates contract"):
        validate_context_proposals(
            [
                {
                    "schema_version": "1.0",
                    "proposal_id": "99999999-9999-4999-8999-999999999999",
                    "subject_id": SUBJECT_ID,
                    "base_version": 2,
                    "path": "/goals/0",
                    "operation": "update",  # not add/replace/remove
                    "proposed_value": "goal",
                    "evidence_ids": [evidence_id],
                    "reason": "needed",
                    "status": "proposed",
                }
            ],
            evidence_ids={evidence_id},
            subject_id=SUBJECT_ID,
            base_version=2,
        )


# ===================================================================
# Living Brief proposal path policy and semantic fingerprints
# ===================================================================


def _proposal_payload(
    *,
    path: str = "/goals/0",
    operation: str = "add",
    proposed_value: object = "goal",
    evidence_ids: list[str] | None = None,
    proposal_id: str = "99999999-9999-4999-8999-999999999999",
) -> dict[str, Any]:
    return {
        "schema_version": "1.0",
        "proposal_id": proposal_id,
        "subject_id": SUBJECT_ID,
        "base_version": 2,
        "path": path,
        "operation": operation,
        "proposed_value": proposed_value,
        "evidence_ids": evidence_ids or [],
        "reason": "needed",
        "status": "proposed",
    }


def test_proposal_path_outside_vocabulary_fails_closed() -> None:
    """Paths outside the Living Brief vocabulary must fail closed.

    The model may only propose RFC 6901 diffs into the editable brief fields.
    Decisions are user authority, channels live in a separate table, and
    metadata is not a brief field — none of them are proposable.
    """
    evidence_id = _evidence(CH_IDS[0], "x")["evidence_id"]
    for path in (
        "/decisions/0",
        "/channels/0",
        "/subject_id",
        "/version",
        "/subject_type",
        "/schema_version",
        "/name",
        "/unknown_field/0",
    ):
        with pytest.raises(EvidenceValidationError, match="brief_path_outside_vocabulary"):
            validate_context_proposals(
                [_proposal_payload(path=path)],
                evidence_ids={evidence_id},
                subject_id=SUBJECT_ID,
                base_version=2,
            )


def test_proposal_path_accepts_only_proposable_vocabulary() -> None:
    """Every proposable top-level brief field is accepted for any operation."""
    evidence_id = _evidence(CH_IDS[0], "x")["evidence_id"]
    for path in (
        "/identity/vision",
        "/identity/name",
        "/audience/primary",
        "/positioning/statement",
        "/offers/-",
        "/goals/0",
        "/constraints/0",
        "/experiments/-",
    ):
        validated = validate_context_proposals(
            [_proposal_payload(path=path)],
            evidence_ids={evidence_id},
            subject_id=SUBJECT_ID,
            base_version=2,
        )
        assert validated[0]["path"] == path


def test_brief_path_policy_classifies_protected_and_unprotected() -> None:
    """Identity (including vision), positioning, goals, constraints are
    protected; audience, offers, experiments are unprotected."""
    from auditlayer_worker.intelligence.validation import (
        is_protected_brief_path,
        brief_path_policy,
    )

    for protected in (
        "/identity/vision",
        "/identity/name",
        "/positioning/statement",
        "/goals/0",
        "/constraints/0",
    ):
        assert is_protected_brief_path(protected)
        assert brief_path_policy(protected) == "protected"
    for unprotected in (
        "/audience/primary",
        "/offers/-",
        "/experiments/-",
    ):
        assert not is_protected_brief_path(unprotected)
        assert brief_path_policy(unprotected) == "unprotected"


def test_brief_path_rejects_invalid_rfc6901_escapes() -> None:
    from auditlayer_worker.intelligence.validation import brief_path_top_field

    for path in ("/goals/~2bad", "/goals/~~", "/goals/0~"):
        with pytest.raises(EvidenceValidationError, match="invalid RFC 6901"):
            brief_path_top_field(path)


def test_proposal_fingerprint_is_evidence_linked_and_deterministic() -> None:
    """The semantic fingerprint binds path/operation/value to the evidence
    set: unchanged evidence yields the same fingerprint, new evidence yields a
    different one (new-evidence allowance), and a different value differs."""
    from auditlayer_worker.intelligence.validation import context_proposal_fingerprint

    evidence_id = _evidence(CH_IDS[0], "x")["evidence_id"]
    proposal = _proposal_payload(
        path="/goals/0",
        operation="replace",
        proposed_value={"text": "retention"},
        evidence_ids=[evidence_id],
    )
    same = context_proposal_fingerprint(proposal, subject_id=SUBJECT_ID)
    assert len(same) == 64
    assert context_proposal_fingerprint(proposal, subject_id=SUBJECT_ID) == same

    # New evidence changes the fingerprint -> proposal becomes admissible.
    other_evidence = _evidence(CH_IDS[1], "y")["evidence_id"]
    new_evidence = dict(proposal)
    new_evidence["evidence_ids"] = [evidence_id, other_evidence]
    assert context_proposal_fingerprint(new_evidence, subject_id=SUBJECT_ID) != same

    # Evidence set order must not matter (sorted canonical set).
    reordered = dict(proposal)
    reordered["evidence_ids"] = [other_evidence, evidence_id]
    assert context_proposal_fingerprint(reordered, subject_id=SUBJECT_ID) == context_proposal_fingerprint(
        new_evidence, subject_id=SUBJECT_ID
    )

    # Different proposed value changes the fingerprint.
    changed_value = dict(proposal)
    changed_value["proposed_value"] = {"text": "acquisition"}
    assert context_proposal_fingerprint(changed_value, subject_id=SUBJECT_ID) != same

    # Different subject changes the fingerprint (tenant isolation).
    assert context_proposal_fingerprint(proposal, subject_id="33333333-3333-4333-8333-333333333333") != same


def test_proposal_rejected_same_evidence_is_suppressed() -> None:
    """A proposal whose evidence-linked fingerprint was already rejected fails
    closed while its evidence set is unchanged."""
    from auditlayer_worker.intelligence.validation import context_proposal_fingerprint

    evidence_id = _evidence(CH_IDS[0], "x")["evidence_id"]
    proposal = _proposal_payload(
        path="/goals/0",
        operation="replace",
        proposed_value={"text": "retention"},
        evidence_ids=[evidence_id],
    )
    fingerprint = context_proposal_fingerprint(proposal, subject_id=SUBJECT_ID)
    with pytest.raises(EvidenceValidationError, match="proposal_rejected_same_evidence"):
        validate_context_proposals(
            [proposal],
            evidence_ids={evidence_id},
            subject_id=SUBJECT_ID,
            base_version=2,
            rejected_fingerprints=frozenset({fingerprint}),
        )


def test_proposal_new_evidence_is_admissible_after_rejection() -> None:
    """Genuinely new evidence changes the fingerprint, so the same semantic
    edit is admissible again."""
    from auditlayer_worker.intelligence.validation import context_proposal_fingerprint

    evidence_id = _evidence(CH_IDS[0], "x")["evidence_id"]
    old_evidence = _evidence(CH_IDS[1], "y")["evidence_id"]
    proposal = _proposal_payload(
        path="/goals/0",
        operation="replace",
        proposed_value={"text": "retention"},
        evidence_ids=[old_evidence],
    )
    rejected = context_proposal_fingerprint(proposal, subject_id=SUBJECT_ID)

    fresh = dict(proposal)
    fresh["evidence_ids"] = [old_evidence, evidence_id]  # genuinely new evidence
    validated = validate_context_proposals(
        [fresh],
        evidence_ids={old_evidence, evidence_id},
        subject_id=SUBJECT_ID,
        base_version=2,
        rejected_fingerprints=frozenset({rejected}),
    )
    assert validated[0]["semantic_fingerprint"] != rejected


def test_validated_proposal_carries_semantic_fingerprint() -> None:
    """Validation attaches the deterministic fingerprint to each proposal so
    the ledger boundary can persist it without recomputing."""
    evidence_id = _evidence(CH_IDS[0], "x")["evidence_id"]
    validated = validate_context_proposals(
        [_proposal_payload(proposal_id="99999999-9999-4999-8999-999999999999")],
        evidence_ids={evidence_id},
        subject_id=SUBJECT_ID,
        base_version=2,
    )
    assert len(validated[0]["semantic_fingerprint"]) == 64


# ===================================================================
# Telemetry completeness and non-leakage
# ===================================================================


def test_telemetry_to_dict_has_all_required_keys() -> None:
    telemetry = RuntimeTelemetry()
    data = telemetry.to_dict()
    required = {
        "status", "failure_code", "cache_mode", "channel_calls",
        "synthesis_calls", "correction_calls", "tokens_in", "tokens_out",
        "cost_usd", "evidence_items", "stage_timings", "model", "provider",
        "deadline_seconds", "deadline_exceeded",
        "queued_cancelled", "inflight_unknown", "cancellation_tip",
    }
    assert set(data) == required


def test_telemetry_repr_never_leaks_customer_data() -> None:
    """Ensure customer handles, evidence content, and context never appear in telemetry repr."""
    from datetime import datetime, timezone

    runtime = BoundedIntelligenceRuntime(
        model=_FixedModel(),
        now=lambda: datetime(2026, 7, 23, tzinfo=timezone.utc),
    )
    completed = runtime.run(_request("telemetry-leak"))
    telemetry = completed.telemetry.to_dict()
    rendered = repr(telemetry)

    # customer-scoped fields must never leak
    assert "Ada" not in rendered
    assert "public locator" not in rendered
    for ch_id in CH_IDS:
        assert ch_id not in rendered
    assert "evidence_id" not in rendered.lower()


def test_telemetry_sink_receives_allowlisted_dict() -> None:
    recorded: list[dict[str, Any]] = []

    def _sink(data: object) -> None:
        if isinstance(data, dict):
            recorded.append(data)

    runtime = BoundedIntelligenceRuntime(
        model=_FixedModel(),
        telemetry_sink=_sink,
    )
    runtime.run(_request("sink-test"))
    assert len(recorded) == 1
    data = recorded[0]
    assert data["status"] == "succeeded"
    assert "Ada" not in repr(data)
    for ch_id in CH_IDS:
        assert ch_id not in repr(data)


# ===================================================================
# Runtime rejects bad brief_version and output_schema_version
# ===================================================================


def test_brief_version_zero_rejected() -> None:
    request = replace(_request("bv-zero"), brief_version=0)
    with pytest.raises(RuntimePolicyError, match="brief_version must be positive"):
        BoundedIntelligenceRuntime(model=_FixedModel()).run(request)


def test_brief_version_negative_rejected() -> None:
    request = replace(_request("bv-neg"), brief_version=-1)
    with pytest.raises(RuntimePolicyError, match="brief_version must be positive"):
        BoundedIntelligenceRuntime(model=_FixedModel()).run(request)


def test_unsupported_output_schema_rejected() -> None:
    request = replace(_request("bad-schema"), output_schema_version="2.0")
    with pytest.raises(RuntimePolicyError, match="schema version"):
        BoundedIntelligenceRuntime(model=_FixedModel()).run(request)


# ===================================================================
# Evidence canonicality boundary
# ===================================================================


def test_evidence_rejects_non_uuid_subject_id() -> None:
    with pytest.raises(EvidenceValidationError, match="must be a UUID"):
        normalize_evidence(
            subject_id="not-a-uuid",
            channel_id=CH_IDS[0],
            source_type="user_context",
            observed_at="2026-07-23T01:02:03Z",
            confidence="low",
            payload={"key": "value"},
        )


def test_evidence_rejects_non_iso_observed_at() -> None:
    with pytest.raises(EvidenceValidationError, match="ISO-8601"):
        normalize_evidence(
            subject_id=SUBJECT_ID,
            channel_id=CH_IDS[0],
            source_type="user_context",
            observed_at="23rd July 2026",
            confidence="low",
            payload={"key": "value"},
        )


def test_evidence_rejects_naive_datetime() -> None:
    from datetime import datetime
    with pytest.raises(EvidenceValidationError, match="timezone"):
        normalize_evidence(
            subject_id=SUBJECT_ID,
            channel_id=CH_IDS[0],
            source_type="user_context",
            observed_at=datetime(2026, 7, 23),
            confidence="low",
            payload={"key": "value"},
        )


def test_evidence_rejects_non_object_payload() -> None:
    with pytest.raises(EvidenceValidationError, match="payload must be an object"):
        normalize_evidence(
            subject_id=SUBJECT_ID,
            channel_id=CH_IDS[0],
            source_type="user_context",
            observed_at="2026-07-23T01:02:03Z",
            confidence="low",
            payload="not-an-object",
        )


def test_evidence_rejects_url_with_credentials() -> None:
    with pytest.raises(EvidenceValidationError, match="credentials"):
        normalize_evidence(
            subject_id=SUBJECT_ID,
            channel_id=CH_IDS[0],
            source_type="user_context",
            source_url="https://user:pass@example.com",
            observed_at="2026-07-23T01:02:03Z",
            confidence="low",
            payload={"key": "value"},
        )


def test_evidence_rejects_non_http_url() -> None:
    with pytest.raises(EvidenceValidationError, match="absolute HTTP"):
        normalize_evidence(
            subject_id=SUBJECT_ID,
            channel_id=CH_IDS[0],
            source_type="user_context",
            source_url="ftp://example.com/file",
            observed_at="2026-07-23T01:02:03Z",
            confidence="low",
            payload={"key": "value"},
        )


def test_evidence_rejects_unsupported_value_type_in_payload() -> None:
    with pytest.raises(EvidenceValidationError, match="unsupported value type"):
        normalize_evidence(
            subject_id=SUBJECT_ID,
            channel_id=CH_IDS[0],
            source_type="user_context",
            observed_at="2026-07-23T01:02:03Z",
            confidence="low",
            payload={"set": {1, 2, 3}},  # sets not supported
        )


# ===================================================================
# Channel rejects unsupported channel_type
# ===================================================================


def test_unsupported_channel_type_rejected() -> None:
    request = _request("bad-ctype")
    bad_channel = replace(
        request.channels[0],
        channel_type="snapchat",  # not in allowed set
    )
    with pytest.raises(RuntimePolicyError, match="unsupported channel type"):
        BoundedIntelligenceRuntime(model=_FixedModel()).run(
            replace(request, channels=(bad_channel,))
        )


# ===================================================================
# Channel rejects zero evidence
# ===================================================================


def test_channel_without_evidence_rejected() -> None:
    request = _request("no-evidence")
    bad_channel = replace(request.channels[0], evidence=())
    with pytest.raises(RuntimePolicyError, match="at least one evidence"):
        BoundedIntelligenceRuntime(model=_FixedModel()).run(
            replace(request, channels=(bad_channel,))
        )


# ===================================================================
# Synthesis validation — unknown fields, invalid change_explanations
# ===================================================================


def test_synthesis_rejects_unknown_fields() -> None:
    from auditlayer_worker.intelligence.runtime import _validate_synthesis

    with pytest.raises(EvidenceValidationError, match="unknown field"):
        _validate_synthesis(
            {
                "findings": [],
                "recommendations": [],
                "change_explanations": [],
                "limitations": [],
                "prompt_injection": [],
            },
            evidence_ids=set(),
        )


def test_synthesis_rejects_invalid_change_cause() -> None:
    from auditlayer_worker.intelligence.runtime import _validate_synthesis

    with pytest.raises(EvidenceValidationError, match="change_explanations"):
        _validate_synthesis(
            {
                "findings": [],
                "recommendations": [],
                "change_explanations": [
                    {"cause": "unknown_cause", "detail": "should not pass"}
                ],
                "limitations": [],
            },
            evidence_ids=set(),
        )


def test_synthesis_rejects_non_string_limitations() -> None:
    from auditlayer_worker.intelligence.runtime import _validate_synthesis

    with pytest.raises(EvidenceValidationError, match="limitations must be strings"):
        _validate_synthesis(
            {
                "findings": [],
                "recommendations": [],
                "change_explanations": [],
                "limitations": [42],
            },
            evidence_ids=set(),
        )


# ===================================================================
# Evidence ID collision detection in validate_channel_analysis
# ===================================================================


def test_analysis_rejects_duplicate_finding_ids() -> None:
    evidence_id = _evidence(CH_IDS[0], "x")["evidence_id"]
    with pytest.raises(EvidenceValidationError, match="finding IDs"):
        validate_channel_analysis(
            {
                "schema_version": "1.0",
                "channel_type": "instagram",
                "evidence_coverage": {"used": [evidence_id], "unavailable": []},
                "findings": [
                    {
                        "id": "same-id",
                        "claim": "first",
                        "evidence_ids": [evidence_id],
                        "confidence": "high",
                        "dimension_impacts": {},
                    },
                    {
                        "id": "same-id",  # duplicate
                        "claim": "second",
                        "evidence_ids": [evidence_id],
                        "confidence": "high",
                        "dimension_impacts": {},
                    },
                ],
                "recommendations": [],
                "limitations": [],
            },
            evidence_ids={evidence_id},
            expected_channel_type="instagram",
        )


def test_analysis_rejects_duplicate_recommendation_ids() -> None:
    evidence_id = _evidence(CH_IDS[0], "x")["evidence_id"]
    with pytest.raises(EvidenceValidationError, match="recommendation IDs"):
        validate_channel_analysis(
            {
                "schema_version": "1.0",
                "channel_type": "instagram",
                "evidence_coverage": {"used": [evidence_id], "unavailable": []},
                "findings": [],
                "recommendations": [
                    {"id": "dup", "action": "first", "evidence_ids": [evidence_id]},
                    {"id": "dup", "action": "second", "evidence_ids": [evidence_id]},
                ],
                "limitations": [],
            },
            evidence_ids={evidence_id},
            expected_channel_type="instagram",
        )


# ===================================================================
# Duplicate evidence IDs within a channel
# ===================================================================


def test_channel_rejects_duplicate_evidence_ids() -> None:
    ev = _evidence(CH_IDS[0], "x")
    request = _request("dup-ev")
    dup_channel = replace(
        request.channels[0],
        evidence=(ev, ev),  # same evidence twice
    )
    with pytest.raises(RuntimePolicyError, match="canonical evidence"):
        BoundedIntelligenceRuntime(model=_FixedModel()).run(
            replace(request, channels=(dup_channel,))
        )


# ===================================================================
# JSON store corruption detection
# ===================================================================


def test_json_stage_store_rejects_corrupt_checkpoint(tmp_path) -> None:
    from auditlayer_worker.intelligence.storage import JsonStageStore
    import hashlib

    root = tmp_path / "stages"
    run_id = "corrupt-run"
    channel_id = CH_IDS[0]
    digest = hashlib.sha256(f"{run_id}\0{channel_id}".encode("utf-8")).hexdigest()

    # Write malformed JSON
    path = root / "channels" / f"{digest}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("not json at all {{{")

    store = JsonStageStore(root)
    with pytest.raises(RuntimeError, match="corrupt"):
        store.load_channel(run_id, channel_id)


# ===================================================================
# Runtime concurrency guard
# ===================================================================


def test_runtime_rejects_zero_workers() -> None:
    with pytest.raises(RuntimePolicyError, match="between one and three"):
        BoundedIntelligenceRuntime(model=_FixedModel(), max_channel_workers=0)


def test_runtime_rejects_four_workers() -> None:
    with pytest.raises(RuntimePolicyError, match="between one and three"):
        BoundedIntelligenceRuntime(model=_FixedModel(), max_channel_workers=4)


# ===================================================================
# Channel evidence count maximum (100)
# ===================================================================


def test_channel_accepts_100_evidence_rejects_101() -> None:
    """Channel input must accept exactly 100 evidence and reject 101."""
    evidence_items = tuple(
        normalize_evidence(
            subject_id=SUBJECT_ID,
            channel_id=CH_IDS[0],
            source_type="user_context",
            observed_at="2026-07-23T01:02:03Z",
            confidence="low",
            payload={"idx": i},
        )
        for i in range(100)
    )

    # 100 should be accepted
    BoundedIntelligenceRuntime(model=_FixedModel()).run(
        replace(
            _request("ev-100"),
            channels=(ChannelInput(channel_id=CH_IDS[0], channel_type="instagram", evidence=evidence_items),),
        )
    )

    # 101 should be rejected
    evidence_items_101 = evidence_items + (
        normalize_evidence(
            subject_id=SUBJECT_ID,
            channel_id=CH_IDS[0],
            source_type="user_context",
            observed_at="2026-07-23T01:02:03Z",
            confidence="low",
            payload={"idx": 100},
        ),
    )
    with pytest.raises(RuntimePolicyError, match="at most 100 evidence"):
        BoundedIntelligenceRuntime(model=_FixedModel()).run(
            replace(
                _request("ev-101"),
                channels=(ChannelInput(channel_id=CH_IDS[0], channel_type="instagram", evidence=evidence_items_101),),
            )
        )


# ===================================================================
# Evidence with mismatched subject_id / channel_id is rejected
# ===================================================================


def test_evidence_subject_id_mismatch_rejected() -> None:
    ev = normalize_evidence(
        subject_id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",  # different subject
        channel_id=CH_IDS[0],
        source_type="user_context",
        observed_at="2026-07-23T01:02:03Z",
        confidence="low",
        payload={"text": "mismatch"},
    )
    request = _request("subj-mismatch")
    bad_channel = replace(request.channels[0], evidence=(ev,))
    with pytest.raises(RuntimePolicyError, match="canonical evidence"):
        BoundedIntelligenceRuntime(model=_FixedModel()).run(
            replace(request, channels=(bad_channel,))
        )


def test_evidence_channel_id_mismatch_rejected() -> None:
    ev = normalize_evidence(
        subject_id=SUBJECT_ID,
        channel_id=CH_IDS[1],  # different channel
        source_type="user_context",
        observed_at="2026-07-23T01:02:03Z",
        confidence="low",
        payload={"text": "mismatch"},
    )
    request = _request("ch-mismatch")
    bad_channel = replace(request.channels[0], evidence=(ev,))
    with pytest.raises(RuntimePolicyError, match="canonical evidence"):
        BoundedIntelligenceRuntime(model=_FixedModel()).run(
            replace(request, channels=(bad_channel,))
        )


# ===================================================================
# Channel projection payload size enforcement
# ===================================================================


def test_oversized_channel_projection_rejected() -> None:
    """A channel whose inference projection exceeds 200KB should be rejected."""
    # Evidence payloads must be < 128KB individually, but many of them
    # combined with subject_context can exceed the 200KB projection limit.
    # Each must have unique content to avoid duplicate evidence IDs.
    evidence_items = tuple(
        normalize_evidence(
            subject_id=SUBJECT_ID,
            channel_id=CH_IDS[0],
            source_type="user_context",
            observed_at="2026-07-23T01:02:03Z",
            confidence="low",
            payload={"text": "x" * 125_000, "idx": i},
        )
        for i in range(3)
    )
    request = _request("oversized-proj")
    bad_channel = replace(request.channels[0], evidence=evidence_items)
    with pytest.raises(RuntimePolicyError, match="200000 bytes"):
        BoundedIntelligenceRuntime(model=_FixedModel()).run(
            replace(request, channels=(bad_channel,))
        )
