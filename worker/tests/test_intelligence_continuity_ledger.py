"""Unit tests for continuity compiler and ledger commit shapes."""

from __future__ import annotations

from typing import Any

import pytest

from auditlayer_worker.intelligence import (
    BoundedIntelligenceRuntime,
    ChannelInput,
    CompletedIntelligenceRun,
    ContinuityError,
    ContinuityInputs,
    InferencePolicy,
    IntelligenceRunRequest,
    MemoryAnalysisCache,
    MemoryLedgerWriter,
    MemoryStageStore,
    ModelResponse,
    RuntimeTelemetry,
    build_ledger_commit,
    commit_ledger_batch,
    compile_continuity_packet,
    ensure_subject_home,
    normalize_evidence,
    rebuild_subject_home,
)
from auditlayer_worker.intelligence.validation import context_proposal_fingerprint

SUBJECT_ID = "11111111-1111-4111-8111-111111111111"
SNAPSHOT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
CHANNEL_ID = "22222222-2222-4222-8222-222222222222"
RUN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
PROPOSAL_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"


def _evidence(suffix: str = "a") -> dict[str, Any]:
    return normalize_evidence(
        subject_id=SUBJECT_ID,
        channel_id=CHANNEL_ID,
        source_type="official_web",
        source_url=f"https://example.com/{suffix}",
        observed_at="2026-07-23T01:02:03Z",
        confidence="high",
        payload={"text": suffix},
    )


def _context() -> dict[str, Any]:
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
                "channel_id": CHANNEL_ID,
                "channel_type": "instagram",
                "locator": "@ada",
                "managed": True,
            }
        ],
    }


def test_continuity_compiler_suppresses_rejected_recommendations() -> None:
    packet = compile_continuity_packet(
        subject_id=SUBJECT_ID,
        brief_version=2,
        subject_context=_context(),
        channel_ids=[CHANNEL_ID],
        prior_scores=[{"dimension": "profile_clarity", "value": 61.0}],
        prior_recommendations=[
            {
                "id": "keep-me",
                "status": "proposed",
                "action": "Post weekly",
                "evidence_ids": ["e1"],
                "fingerprint": "f1",
            },
            {
                "id": "old-rec",
                "status": "rejected",
                "action": "Buy ads",
                "evidence_ids": ["e1"],
                "fingerprint": "f-old",
            },
        ],
        prior_decisions=[
            {
                "target_type": "recommendation",
                "target_id": "decided-away",
                "decision": "rejected",
                "note": "not brand safe",
            }
        ],
        prior_result={"brief_version": 1, "methodology_version": "moat-1"},
        methodology_version="moat-1",
    )
    assert packet.change_cause_hint == "brief_lens"
    assert packet.prior_scores["profile_clarity"] == 61.0
    assert {row["id"] for row in packet.open_recommendations} == {"keep-me"}
    assert "old-rec" in packet.rejected_recommendation_ids
    assert "decided-away" in packet.rejected_recommendation_ids
    assert "f-old" in packet.rejected_recommendation_fingerprints
    assert len(packet.packet_hash) == 64
    assert packet.prior_state_hash == ContinuityInputs(
        subject_id=SUBJECT_ID,
        brief_version=2,
        subject_context=_context(),
        channel_ids=[CHANNEL_ID],
        prior_scores={"profile_clarity": 61.0},
        prior_result={"brief_version": 1, "methodology_version": "moat-1"},
        methodology_version="moat-1",
    ).compile().prior_state_hash


def test_continuity_rejects_brief_mismatch() -> None:
    with pytest.raises(ContinuityError, match="pinned brief"):
        compile_continuity_packet(
            subject_id=SUBJECT_ID,
            brief_version=3,
            subject_context=_context(),
            channel_ids=[CHANNEL_ID],
        )


def test_ledger_commit_shapes_match_kernel_rpcs() -> None:
    evidence = _evidence()
    completed = CompletedIntelligenceRun(
        result={
            "schema_version": "1.0",
            "subject_id": SUBJECT_ID,
            "brief_version": 2,
            "evidence_snapshot_id": SNAPSHOT_ID,
            "channel_results": [
                {
                    "schema_version": "1.0",
                    "channel_type": "instagram",
                    "evidence_coverage": {"used": [evidence["evidence_id"]], "unavailable": []},
                    "findings": [
                        {
                            "id": "f1",
                            "claim": "Bio is clear",
                            "evidence_ids": [evidence["evidence_id"]],
                            "confidence": "high",
                            "dimension_impacts": {"profile_clarity": 12},
                        }
                    ],
                    "recommendations": [
                        {
                            "id": "r1",
                            "action": "Tighten CTA",
                            "evidence_ids": [evidence["evidence_id"]],
                            "fingerprint": "abc",
                        }
                    ],
                    "limitations": [],
                }
            ],
            "scores": [
                {
                    "dimension": "profile_clarity",
                    "value": 62.0,
                    "evidence_ids": [evidence["evidence_id"]],
                    "methodology_version": "moat-1",
                    "previous_value": 55.0,
                    "change_cause": "evidence",
                }
            ],
            "findings": [
                {
                    "id": "f1",
                    "claim": "Bio is clear",
                    "evidence_ids": [evidence["evidence_id"]],
                    "confidence": "high",
                    "dimension_impacts": {"profile_clarity": 12},
                }
            ],
            "recommendations": [
                {
                    "id": "r1",
                    "action": "Tighten CTA",
                    "evidence_ids": [evidence["evidence_id"]],
                    "fingerprint": "abc",
                }
            ],
            "change_explanations": [
                {"cause": "evidence", "detail": "New bio evidence arrived."}
            ],
            "limitations": [],
        },
        telemetry=RuntimeTelemetry(
            cache_mode="reused",
            tokens_in=10,
            tokens_out=20,
            cost_usd=0.001,
            stage_timings={"projection": 0.01, "channel_analysis": 0.2, "assembly": 0.01},
        ),
        context_update_proposals=(
            {
                "schema_version": "1.0",
                "proposal_id": PROPOSAL_ID,
                "subject_id": SUBJECT_ID,
                "base_version": 2,
                "path": "/audience/primary",
                "operation": "replace",
                "proposed_value": "operators",
                "evidence_ids": [evidence["evidence_id"]],
                "reason": "Comments skew operator language",
                "status": "proposed",
                "semantic_fingerprint": context_proposal_fingerprint(
                    {
                        "schema_version": "1.0",
                        "proposal_id": PROPOSAL_ID,
                        "subject_id": SUBJECT_ID,
                        "base_version": 2,
                        "path": "/audience/primary",
                        "operation": "replace",
                        "proposed_value": "operators",
                        "evidence_ids": [evidence["evidence_id"]],
                        "reason": "Comments skew operator language",
                        "status": "proposed",
                    },
                    subject_id=SUBJECT_ID,
                ),
            },
        ),
    )
    batch = build_ledger_commit(
        completed, run_id=RUN_ID, evidence_items=[evidence], latency_ms=220
    )
    assert batch.upsert_evidence[0]["snapshot_id"] == SNAPSHOT_ID
    assert batch.upsert_evidence[0]["content_hash"] == evidence["content_hash"]
    assert "contract_evidence_id" not in batch.upsert_evidence[0]["payload"]
    assert batch.record_scores[0]["run_id"] == RUN_ID
    assert batch.record_scores[0]["evidence_ids"] == [evidence["evidence_id"]]
    assert batch.record_scores[0]["change_kind"] == "evidence"
    assert batch.record_scores[0]["previous_value"] == 55.0
    assert batch.record_findings[0]["finding_ref"] == "f1"
    assert batch.record_findings[0]["channel_type"] == "instagram"
    assert batch.record_recommendations[0]["content"]["action"] == "Tighten CTA"
    assert batch.create_context_update_proposals[0]["intelligence_run_id"] == RUN_ID
    assert batch.finalize_intelligence_run["p_status"] == "completed"
    assert batch.finalize_intelligence_run["p_cache_mode"] == "reused"
    assert batch.change_explanations[0]["cause"] == "evidence"

    writer = MemoryLedgerWriter()
    commit_ledger_batch(writer, batch)
    assert len(writer.evidence) == 1
    assert len(writer.scores) == 1
    assert len(writer.findings) == 1
    assert len(writer.recommendations) == 1
    assert len(writer.proposals) == 1
    assert len(writer.finalizations) == 1


def test_ledger_rejects_score_without_evidence() -> None:
    completed = CompletedIntelligenceRun(
        result={
            "schema_version": "1.0",
            "subject_id": SUBJECT_ID,
            "brief_version": 2,
            "evidence_snapshot_id": SNAPSHOT_ID,
            "channel_results": [],
            "scores": [
                {
                    "dimension": "profile_clarity",
                    "value": 10.0,
                    "evidence_ids": [],
                    "methodology_version": "moat-1",
                }
            ],
            "findings": [],
            "recommendations": [],
            "change_explanations": [{"cause": "evidence", "detail": "n/a"}],
        },
        telemetry=RuntimeTelemetry(),
    )
    with pytest.raises(Exception, match="evidence_ids"):
        build_ledger_commit(completed, run_id=RUN_ID, evidence_items=[])


def test_subject_home_is_rebuildable(tmp_path) -> None:
    home = ensure_subject_home(SUBJECT_ID, subjects_root=tmp_path)
    scratch = home / "scratch" / "note.txt"
    scratch.write_text("working state", encoding="utf-8")
    rebuilt = rebuild_subject_home(SUBJECT_ID, subjects_root=tmp_path)
    assert rebuilt == home
    assert not scratch.exists()
    assert (home / ".alm-subject-home").is_file()


def test_continuity_feeds_runtime_rejection_suppression() -> None:
    evidence = _evidence()
    packet = compile_continuity_packet(
        subject_id=SUBJECT_ID,
        brief_version=2,
        subject_context=_context(),
        channel_ids=[CHANNEL_ID],
        prior_recommendations=[
            {
                "id": "old-rec",
                "status": "rejected",
                "action": "Buy ads",
                "evidence_ids": [evidence["evidence_id"]],
                "fingerprint": "deadbeef",
            }
        ],
        prior_scores={"profile_clarity": 50.0},
    )

    class Model:
        def analyze_channel(self, payload, *, policy):
            return ModelResponse(
                payload={
                    "schema_version": "1.0",
                    "channel_type": "instagram",
                    "evidence_coverage": {
                        "used": [evidence["evidence_id"]],
                        "unavailable": [],
                    },
                    "findings": [
                        {
                            "id": "f1",
                            "claim": "Stable bio",
                            "evidence_ids": [evidence["evidence_id"]],
                            "confidence": "high",
                            "dimension_impacts": {"profile_clarity": 5},
                        }
                    ],
                    "recommendations": [
                        {
                            "id": "old-rec",
                            "action": "Buy ads",
                            "evidence_ids": [evidence["evidence_id"]],
                        },
                        {
                            "id": "new-rec",
                            "action": "Ship carousel",
                            "evidence_ids": [evidence["evidence_id"]],
                        },
                    ],
                    "limitations": [],
                },
                tokens_in=1,
                tokens_out=1,
            )

        def synthesize(self, payload, *, policy):  # pragma: no cover
            raise AssertionError("single-channel must skip synthesis")

    runtime = BoundedIntelligenceRuntime(
        model=Model(),
        policy=InferencePolicy(),
        stage_store=MemoryStageStore(),
        analysis_cache=MemoryAnalysisCache(),
    )
    request = IntelligenceRunRequest(
        run_id=RUN_ID,
        subject_id=SUBJECT_ID,
        brief_version=2,
        evidence_snapshot_id=SNAPSHOT_ID,
        subject_context=_context(),
        channels=(
            ChannelInput(
                channel_id=CHANNEL_ID,
                channel_type="instagram",
                evidence=(evidence,),
            ),
        ),
        methodology_version="moat-1",
        expertise_pack_version="wellness-1",
        prompt_version="1.0",
        model_config_hash="c" * 64,
        score_dimensions=("profile_clarity",),
        rejected_recommendation_ids=packet.rejected_recommendation_ids,
        rejected_recommendation_fingerprints=packet.rejected_recommendation_fingerprints,
        prior_scores=packet.prior_scores,
        prior_result=packet.prior_result,
    )
    completed = runtime.run(request)
    rec_ids = {row["id"] for row in completed.result["recommendations"]}
    assert "old-rec" not in rec_ids
    assert "new-rec" in rec_ids
    batch = build_ledger_commit(
        completed, run_id=RUN_ID, evidence_items=[evidence]
    )
    writer = MemoryLedgerWriter()
    commit_ledger_batch(writer, batch)
    assert writer.recommendations[0]["recommendation_ref"] == "new-rec"


# ===================================================================
# Living Brief proposal semantics — continuity + runtime suppression
# ===================================================================


def test_continuity_packet_carries_rejected_proposal_fingerprints() -> None:
    """Rejected proposals contribute evidence-linked fingerprints so an
    unchanged-evidence proposal cannot recur through the continuity packet."""
    packet = compile_continuity_packet(
        subject_id=SUBJECT_ID,
        brief_version=2,
        subject_context=_context(),
        channel_ids=[CHANNEL_ID],
        prior_rejected_proposals=[
            {"semantic_fingerprint": "a" * 64},
            {"semantic_fingerprint": "b" * 64},
            {"semantic_fingerprint": "a" * 64},  # deduplicated
            {"path": "/goals/0"},  # no fingerprint -> skipped, not invented
        ],
    )
    assert packet.rejected_proposal_fingerprints == frozenset({"a" * 64, "b" * 64})
    assert "a" * 64 in packet.to_dict()["rejected_proposal_fingerprints"]


def test_continuity_inputs_project_rejected_proposal_fingerprints() -> None:
    packet = ContinuityInputs(
        subject_id=SUBJECT_ID,
        brief_version=2,
        subject_context=_context(),
        channel_ids=[CHANNEL_ID],
        prior_rejected_proposals=[{"fingerprint": "c" * 64}],
    ).compile()
    assert packet.rejected_proposal_fingerprints == frozenset({"c" * 64})


def test_continuity_rejects_malformed_rejected_proposals() -> None:
    with pytest.raises(ContinuityError, match="must be a non-empty string"):
        compile_continuity_packet(
            subject_id=SUBJECT_ID,
            brief_version=2,
            subject_context=_context(),
            channel_ids=[CHANNEL_ID],
            prior_rejected_proposals=[{"semantic_fingerprint": 42}],  # type: ignore[list-item]
        )


def test_runtime_suppresses_recurring_rejected_proposal() -> None:
    """A proposal whose evidence-linked fingerprint was already rejected is
    dropped at assembly, mirroring the recommendation suppression path."""
    evidence = _evidence()
    proposal = {
        "schema_version": "1.0",
        "proposal_id": PROPOSAL_ID,
        "subject_id": SUBJECT_ID,
        "base_version": 2,
        "path": "/goals/0",
        "operation": "add",
        "proposed_value": "retention",
        "evidence_ids": [evidence["evidence_id"]],
        "reason": "Observed retention signal",
        "status": "proposed",
    }
    rejected = context_proposal_fingerprint(proposal, subject_id=SUBJECT_ID)

    class ProposalModel:
        def analyze_channel(self, payload, *, policy):
            return ModelResponse(
                payload={
                    "schema_version": "1.0",
                    "channel_type": "instagram",
                    "evidence_coverage": {
                        "used": [evidence["evidence_id"]],
                        "unavailable": [],
                    },
                    "findings": [],
                    "recommendations": [],
                    "context_update_proposals": [proposal],
                    "limitations": [],
                },
                tokens_in=1,
                tokens_out=1,
            )

        def synthesize(self, payload, *, policy):  # pragma: no cover
            raise AssertionError("single-channel must skip synthesis")

    runtime = BoundedIntelligenceRuntime(model=ProposalModel())
    request = IntelligenceRunRequest(
        run_id=RUN_ID,
        subject_id=SUBJECT_ID,
        brief_version=2,
        evidence_snapshot_id=SNAPSHOT_ID,
        subject_context=_context(),
        channels=(
            ChannelInput(
                channel_id=CHANNEL_ID,
                channel_type="instagram",
                evidence=(evidence,),
            ),
        ),
        methodology_version="moat-1",
        expertise_pack_version="wellness-1",
        prompt_version="1.0",
        model_config_hash="c" * 64,
        rejected_proposal_fingerprints=frozenset({rejected}),
    )
    completed = runtime.run(request)
    assert completed.context_update_proposals == ()


def test_runtime_keeps_new_evidence_proposal_after_rejection() -> None:
    """New evidence changes the fingerprint, so the same semantic edit is
    admissible again and survives the assembly filter."""
    evidence = _evidence()
    extra_evidence = _evidence(suffix="z")
    base_proposal = {
        "schema_version": "1.0",
        "proposal_id": PROPOSAL_ID,
        "subject_id": SUBJECT_ID,
        "base_version": 2,
        "path": "/goals/0",
        "operation": "add",
        "proposed_value": "retention",
        "evidence_ids": [evidence["evidence_id"]],
        "reason": "Observed retention signal",
        "status": "proposed",
    }
    rejected = context_proposal_fingerprint(base_proposal, subject_id=SUBJECT_ID)
    fresh_proposal = dict(base_proposal)
    fresh_proposal["evidence_ids"] = [
        evidence["evidence_id"],
        extra_evidence["evidence_id"],
    ]

    class NewEvidenceModel:
        def analyze_channel(self, payload, *, policy):
            return ModelResponse(
                payload={
                    "schema_version": "1.0",
                    "channel_type": "instagram",
                    "evidence_coverage": {
                        "used": [
                            evidence["evidence_id"],
                            extra_evidence["evidence_id"],
                        ],
                        "unavailable": [],
                    },
                    "findings": [],
                    "recommendations": [],
                    "context_update_proposals": [fresh_proposal],
                    "limitations": [],
                },
                tokens_in=1,
                tokens_out=1,
            )

        def synthesize(self, payload, *, policy):  # pragma: no cover
            raise AssertionError("single-channel must skip synthesis")

    runtime = BoundedIntelligenceRuntime(model=NewEvidenceModel())
    request = IntelligenceRunRequest(
        run_id=RUN_ID,
        subject_id=SUBJECT_ID,
        brief_version=2,
        evidence_snapshot_id=SNAPSHOT_ID,
        subject_context=_context(),
        channels=(
            ChannelInput(
                channel_id=CHANNEL_ID,
                channel_type="instagram",
                evidence=(evidence, extra_evidence),
            ),
        ),
        methodology_version="moat-1",
        expertise_pack_version="wellness-1",
        prompt_version="1.0",
        model_config_hash="c" * 64,
        rejected_proposal_fingerprints=frozenset({rejected}),
    )
    completed = runtime.run(request)
    assert len(completed.context_update_proposals) == 1
    assert (
        completed.context_update_proposals[0]["semantic_fingerprint"] != rejected
    )
