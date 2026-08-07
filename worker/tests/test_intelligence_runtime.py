from __future__ import annotations

from collections import Counter
from dataclasses import replace
from datetime import datetime, timezone
import threading
import time
from typing import Any

import pytest

from auditlayer_worker.intelligence import (
    BoundedIntelligenceRuntime,
    ChannelInput,
    InferencePolicy,
    IntelligenceRunRequest,
    JsonAnalysisCache,
    JsonStageStore,
    MemoryAnalysisCache,
    MemoryStageStore,
    ModelResponse,
    RuntimePolicyError,
    normalize_evidence,
)


SUBJECT_ID = "11111111-1111-4111-8111-111111111111"
SNAPSHOT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
CHANNEL_IDS = (
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
    "44444444-4444-4444-8444-444444444444",
    "55555555-5555-4555-8555-555555555555",
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


def _request(run_id: str, count: int = 1, *, prompt_version: str = "1.0") -> IntelligenceRunRequest:
    types = ("instagram", "website", "youtube", "linkedin")
    channels = tuple(
        ChannelInput(
            channel_id=CHANNEL_IDS[index],
            channel_type=types[index],
            evidence=(_evidence(CHANNEL_IDS[index], chr(97 + index)),),
        )
        for index in range(count)
    )
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
                    "channel_id": channel.channel_id,
                    "channel_type": channel.channel_type,
                    "locator": "public locator",
                    "managed": True,
                }
                for channel in channels
            ],
        },
        channels=channels,
        methodology_version="moat-1",
        expertise_pack_version="wellness-1",
        prompt_version=prompt_version,
        model_config_hash="c" * 64,
        output_schema_version="1.0",
        score_dimensions=("profile_clarity", "audience_fit"),
        rejected_recommendation_ids=frozenset({"old-rec"}),
    )


def _analysis(channel_type: str, evidence_id: str) -> dict[str, Any]:
    return {
        "schema_version": "1.0",
        "channel_type": channel_type,
        "evidence_coverage": {"used": [evidence_id], "unavailable": ["private analytics"]},
        "findings": [
            {
                "id": f"finding-{channel_type}",
                "claim": "A typed finding",
                "evidence_ids": [evidence_id],
                "confidence": "high",
                "dimension_impacts": {"profile_clarity": 20},
            }
        ],
        "recommendations": [
            {"id": "old-rec", "action": "Do not repeat", "evidence_ids": [evidence_id]},
            {
                "id": f"rec-{channel_type}",
                "action": "Run a bounded experiment",
                "evidence_ids": [evidence_id],
            },
        ],
        "context_update_proposals": [],
        "limitations": ["Data needed: private analytics"],
    }


class RecordingModel:
    def __init__(self, *, fail_synthesis_once: bool = False, pause: float = 0.0) -> None:
        self.channel_calls: Counter[str] = Counter()
        self.synthesis_calls = 0
        self.fail_synthesis_once = fail_synthesis_once
        self.pause = pause
        self.active = 0
        self.max_active = 0
        self.lock = threading.Lock()

    def analyze_channel(self, payload: dict[str, Any], *, policy: InferencePolicy) -> ModelResponse:
        channel = payload["channel"]
        with self.lock:
            self.active += 1
            self.max_active = max(self.max_active, self.active)
        try:
            time.sleep(self.pause)
            self.channel_calls[channel["channel_id"]] += 1
            evidence_id = channel["evidence"][0]["evidence_id"]
            return ModelResponse(_analysis(channel["channel_type"], evidence_id), 100, 50, 0.01)
        finally:
            with self.lock:
                self.active -= 1

    def synthesize(self, payload: dict[str, Any], *, policy: InferencePolicy) -> ModelResponse:
        self.synthesis_calls += 1
        if self.fail_synthesis_once and self.synthesis_calls == 1:
            raise TimeoutError("synthesis timeout")
        return ModelResponse(
            {
                "findings": [],
                "recommendations": [],
                "change_explanations": [
                    {"cause": "evidence", "detail": "New channel evidence was analyzed."}
                ],
                "limitations": [],
            },
            40,
            20,
            0.004,
        )


def test_single_channel_uses_one_call_and_skips_synthesis() -> None:
    model = RecordingModel()
    runtime = BoundedIntelligenceRuntime(model=model)

    completed = runtime.run(_request("run-single"))

    assert sum(model.channel_calls.values()) == 1
    assert model.synthesis_calls == 0
    assert completed.telemetry.channel_calls == 1
    assert completed.telemetry.synthesis_calls == 0
    evidence_id = _request("unused").channels[0].evidence[0]["evidence_id"]
    # No prior result exists: the canonical classifier must not silently
    # default to evidence. A first run is honest UNKNOWN with a tip.
    first_run_tip = (
        "No prior result exists; this is a first run, not an audit-to-audit "
        "delta. Attribution requires a pinned prior result."
    )
    assert completed.result["scores"] == [
        {
            "dimension": "profile_clarity",
            "value": 70.0,
            "evidence_ids": [evidence_id],
            "methodology_version": "moat-1",
            "previous_value": None,
            "delta": None,
            "change_cause": "unknown",
            "change_correction_tip": first_run_tip,
        },
        {
            "dimension": "audience_fit",
            "value": None,
            "evidence_ids": [],
            "methodology_version": "moat-1",
            "previous_value": None,
            "delta": None,
            "change_cause": "unknown",
            "change_correction_tip": first_run_tip,
        },
    ]
    assert first_run_tip in completed.result["limitations"]
    assert {item["id"] for item in completed.result["recommendations"]} == {"rec-instagram"}


def test_multi_channel_fanout_batches_more_than_three_and_caps_concurrency() -> None:
    model = RecordingModel(pause=0.03)
    runtime = BoundedIntelligenceRuntime(model=model, max_channel_workers=3)

    completed = runtime.run(_request("run-multi", 4))

    assert sum(model.channel_calls.values()) == 4
    # The contract is the concurrency CAP: no more than three channel calls run
    # concurrently. Reaching exactly three depends on OS thread spawn + GIL
    # acquisition timing (the model sleeps only 0.03s), so the assertion proves
    # parallel fan-out (>= 2) and the cap (<= 3) without depending on scheduler
    # luck. A regression to serial execution (max_active == 1) still fails.
    assert 2 <= model.max_active <= 3
    assert model.synthesis_calls == 1
    assert completed.telemetry.channel_calls == 4


def test_synthesis_retry_reuses_completed_channel_stages() -> None:
    model = RecordingModel(fail_synthesis_once=True)
    stages = MemoryStageStore()
    runtime = BoundedIntelligenceRuntime(model=model, stage_store=stages)
    request = _request("run-resume", 2)

    with pytest.raises(TimeoutError, match="synthesis timeout"):
        runtime.run(request)
    calls_after_failure = model.channel_calls.copy()

    completed = runtime.run(request)

    assert model.channel_calls == calls_after_failure
    assert model.synthesis_calls == 2
    assert completed.telemetry.cache_mode == "resume"
    assert completed.telemetry.channel_calls == 0


def test_successful_parallel_channel_survives_sibling_failure() -> None:
    class PartialFailureModel(RecordingModel):
        def __init__(self) -> None:
            super().__init__()
            self.failed_once = False

        def analyze_channel(self, payload, *, policy):
            channel_id = payload["channel"]["channel_id"]
            self.channel_calls[channel_id] += 1
            if channel_id == CHANNEL_IDS[0] and not self.failed_once:
                self.failed_once = True
                raise TimeoutError("one channel timed out")
            if channel_id == CHANNEL_IDS[1]:
                time.sleep(0.02)
            evidence_id = payload["channel"]["evidence"][0]["evidence_id"]
            return ModelResponse(
                _analysis(payload["channel"]["channel_type"], evidence_id), 10, 5, 0.001
            )

    model = PartialFailureModel()
    stages = MemoryStageStore()
    request = _request("run-partial", 2)
    runtime = BoundedIntelligenceRuntime(model=model, stage_store=stages)

    with pytest.raises(TimeoutError):
        runtime.run(request)
    assert stages.load_channel("run-partial", CHANNEL_IDS[1]) is not None

    runtime.run(request)
    assert model.channel_calls[CHANNEL_IDS[0]] == 2
    assert model.channel_calls[CHANNEL_IDS[1]] == 1


def test_exact_cache_reuse_requires_all_key_components() -> None:
    model = RecordingModel()
    cache = MemoryAnalysisCache()
    first = BoundedIntelligenceRuntime(model=model, analysis_cache=cache)
    first.run(_request("run-cache-prime"))

    reused = BoundedIntelligenceRuntime(model=model, analysis_cache=cache).run(
        _request("run-cache-hit")
    )
    assert sum(model.channel_calls.values()) == 1
    assert reused.telemetry.cache_mode == "reused"
    assert reused.telemetry.channel_calls == 0

    BoundedIntelligenceRuntime(model=model, analysis_cache=cache).run(
        _request("run-cache-miss", prompt_version="1.1")
    )
    assert sum(model.channel_calls.values()) == 2


def test_runtime_revalidates_evidence_identity_secrets_and_expiry_before_calls() -> None:
    base = _request("run-evidence-boundary")
    model = RecordingModel()
    runtime = BoundedIntelligenceRuntime(
        model=model,
        now=lambda: datetime(2026, 7, 23, 2, tzinfo=timezone.utc),
    )
    tampered = dict(base.channels[0].evidence[0])
    tampered["content_hash"] = "0" * 64
    with pytest.raises(RuntimePolicyError, match="canonical evidence"):
        runtime.run(replace(base, channels=(replace(base.channels[0], evidence=(tampered,)),)))

    secret = dict(base.channels[0].evidence[0])
    secret["payload"] = {"nested": {"api_key": "secret-value"}}
    with pytest.raises(RuntimePolicyError, match="canonical evidence"):
        runtime.run(replace(base, channels=(replace(base.channels[0], evidence=(secret,)),)))

    expired = normalize_evidence(
        subject_id=SUBJECT_ID,
        channel_id=CHANNEL_IDS[0],
        source_type="official_web",
        observed_at="2026-07-23T01:00:00Z",
        expires_at="2026-07-23T01:30:00Z",
        confidence="high",
        payload={"text": "expired"},
    )
    with pytest.raises(RuntimePolicyError, match="expired"):
        runtime.run(replace(base, channels=(replace(base.channels[0], evidence=(expired,)),)))
    assert not model.channel_calls


def test_projection_content_is_part_of_cache_identity() -> None:
    cache = MemoryAnalysisCache()
    model = RecordingModel()
    runtime = BoundedIntelligenceRuntime(model=model, analysis_cache=cache)
    base = _request("projection-key")
    runtime.run(base)
    changed_context = dict(base.subject_context)
    changed_context["goals"] = ["retention"]
    runtime.run(replace(base, run_id="projection-key-2", subject_context=changed_context))
    assert sum(model.channel_calls.values()) == 2


def test_synthesis_checkpoint_is_invalidated_when_pinned_inputs_change() -> None:
    model = RecordingModel()
    stages = MemoryStageStore()
    runtime = BoundedIntelligenceRuntime(model=model, stage_store=stages)

    runtime.run(_request("run-synthesis-key", 2, prompt_version="1.0"))
    runtime.run(_request("run-synthesis-key", 2, prompt_version="1.1"))

    assert model.synthesis_calls == 2


def test_invalid_model_evidence_reference_fails_before_stage_persistence() -> None:
    class InvalidModel(RecordingModel):
        def analyze_channel(self, payload, *, policy):
            value = _analysis(payload["channel"]["channel_type"], "ev-missing")
            return ModelResponse(value, 1, 1, 0.0)

    stages = MemoryStageStore()
    runtime = BoundedIntelligenceRuntime(model=InvalidModel(), stage_store=stages)
    with pytest.raises(ValueError, match="unknown evidence ID"):
        runtime.run(_request("run-invalid"))
    assert stages.load_channel("run-invalid", CHANNEL_IDS[0]) is None


def test_tampered_successful_stage_is_revalidated_and_rejected() -> None:
    model = RecordingModel()
    stages = MemoryStageStore()
    runtime = BoundedIntelligenceRuntime(model=model, stage_store=stages)
    request = _request("tampered-stage")
    runtime.run(request)
    saved = stages.load_channel(request.run_id, CHANNEL_IDS[0])
    assert saved is not None
    bad = dict(saved.analysis)
    bad["findings"] = [{**bad["findings"][0], "evidence_ids": ["missing"]}]
    stages.save_channel(request.run_id, CHANNEL_IDS[0], replace(saved, analysis=bad))
    with pytest.raises(ValueError, match="unknown evidence ID"):
        runtime.run(request)


def test_inference_policy_is_deepseek_stateless_tool_free_and_has_no_fallback() -> None:
    policy = InferencePolicy()
    assert policy.provider == "deepseek"
    assert policy.model == "deepseek-v4-flash"
    assert policy.tools == ()
    assert policy.memory is False
    assert policy.delegation is False
    assert policy.fallback_model is None

    with pytest.raises(RuntimePolicyError):
        InferencePolicy(model="another-model")
    with pytest.raises(RuntimePolicyError):
        InferencePolicy(tools=("web",))


def test_run_rejects_context_version_or_channel_mismatch() -> None:
    request = _request("run-context-mismatch")
    wrong_version = dict(request.subject_context)
    wrong_version["version"] = 3
    with pytest.raises(RuntimePolicyError, match="context does not match"):
        BoundedIntelligenceRuntime(model=RecordingModel()).run(
            replace(request, subject_context=wrong_version)
        )

    wrong_channel = dict(request.subject_context)
    wrong_channel["channels"] = [
        {**wrong_channel["channels"][0], "channel_type": "website"}
    ]
    with pytest.raises(RuntimePolicyError, match="context channels do not match"):
        BoundedIntelligenceRuntime(model=RecordingModel()).run(
            replace(request, subject_context=wrong_channel)
        )


def test_telemetry_is_bounded_and_contains_no_customer_payloads() -> None:
    completed = BoundedIntelligenceRuntime(model=RecordingModel()).run(
        _request("run-telemetry")
    )
    telemetry = completed.telemetry.to_dict()

    assert telemetry["tokens_in"] == 100
    assert telemetry["tokens_out"] == 50
    assert telemetry["cost_usd"] == 0.01
    assert telemetry["cache_mode"] == "fresh"
    assert set(telemetry["stage_timings"]) == {"projection", "channel_analysis", "assembly"}
    rendered = repr(telemetry)
    assert "Ada" not in rendered
    assert "public locator" not in rendered
    assert "ev-a" not in rendered


def test_failure_telemetry_uses_normalized_codes_without_exception_text() -> None:
    class TimedOutModel(RecordingModel):
        def analyze_channel(self, payload, *, policy):
            raise TimeoutError("Ada at public locator with ev-a")

    recorded: list[dict[str, Any]] = []
    runtime = BoundedIntelligenceRuntime(
        model=TimedOutModel(), telemetry_sink=recorded.append
    )

    with pytest.raises(TimeoutError):
        runtime.run(_request("run-failure-telemetry"))

    assert recorded[0]["status"] == "failed"
    assert recorded[0]["failure_code"] == "inference_timeout"
    assert "channel_analysis" in recorded[0]["stage_timings"]
    assert "Ada" not in repr(recorded[0])
    assert "ev-a" not in repr(recorded[0])


def test_one_correction_maximum_and_attempts_are_counted_on_failure() -> None:
    class MalformedThenInvalid(RecordingModel):
        def analyze_channel(self, payload, *, policy):
            raise ValueError("not json")

        def correct_channel(self, payload, *, invalid_payload, error, policy):
            return ModelResponse({"schema_version": "1.0"}, correction_used=True)

    recorded: list[dict[str, Any]] = []
    runtime = BoundedIntelligenceRuntime(
        model=MalformedThenInvalid(), telemetry_sink=recorded.append
    )
    with pytest.raises(ValueError):
        runtime.run(_request("one-correction"))
    assert recorded[0]["channel_calls"] == 1
    assert recorded[0]["correction_calls"] == 1


def test_longitudinal_scores_and_recommendation_fingerprints_are_deterministic() -> None:
    request = replace(
        _request("longitudinal"),
        prior_scores={"profile_clarity": 60.0},
        prior_result={"brief_version": 1, "methodology_version": "moat-1"},
    )
    first = BoundedIntelligenceRuntime(model=RecordingModel()).run(request)
    score = first.result["scores"][0]
    assert score["previous_value"] == 60.0
    assert score["delta"] == 10.0
    assert score["change_cause"] == "brief_lens"
    recommendation = first.result["recommendations"][0]
    assert recommendation["fingerprint"]

    rerun = BoundedIntelligenceRuntime(model=RecordingModel()).run(
        replace(
            request,
            run_id="longitudinal-2",
            rejected_recommendation_fingerprints=frozenset({recommendation["fingerprint"]}),
        )
    )
    assert rerun.result["recommendations"] == []


def test_synthesis_is_additive_and_context_proposals_are_handed_off() -> None:
    proposal_id = "99999999-9999-4999-8999-999999999999"

    class AdditiveModel(RecordingModel):
        def analyze_channel(self, payload, *, policy):
            response = super().analyze_channel(payload, policy=policy)
            value = dict(response.payload)
            value["context_update_proposals"] = [{
                "schema_version": "1.0",
                "proposal_id": proposal_id,
                "subject_id": SUBJECT_ID,
                "base_version": 2,
                "path": "/goals/0",
                "operation": "replace",
                "proposed_value": "retention",
                "evidence_ids": [payload["channel"]["evidence"][0]["evidence_id"]],
                "reason": "Observed positioning",
                "status": "proposed",
            }]
            return replace(response, payload=value)

        def synthesize(self, payload, *, policy):
            evidence_id = payload["channel_results"][0]["findings"][0]["evidence_ids"][0]
            return ModelResponse({
                "findings": [{
                    "id": "cross-finding",
                    "claim": "Cross-channel consistency",
                    "evidence_ids": [evidence_id],
                    "confidence": "high",
                    "dimension_impacts": {},
                }],
                "recommendations": [{
                    "id": "cross-rec",
                    "action": "Align channels",
                    "evidence_ids": [evidence_id],
                }],
                "change_explanations": [],
                "limitations": [],
            })

    completed = BoundedIntelligenceRuntime(model=AdditiveModel()).run(
        _request("additive", 2)
    )
    assert len(completed.result["findings"]) == 3
    assert len(completed.result["recommendations"]) == 3
    assert len(completed.context_update_proposals) == 1


def test_json_stage_and_analysis_stores_survive_process_recreation(tmp_path) -> None:
    model = RecordingModel(fail_synthesis_once=True)
    request = _request("durable-run", 2)
    stage_root = tmp_path / "stages"
    cache_root = tmp_path / "cache"
    first = BoundedIntelligenceRuntime(
        model=model,
        stage_store=JsonStageStore(stage_root),
        analysis_cache=JsonAnalysisCache(cache_root),
    )

    with pytest.raises(TimeoutError):
        first.run(request)
    initial_calls = model.channel_calls.copy()

    resumed = BoundedIntelligenceRuntime(
        model=model,
        stage_store=JsonStageStore(stage_root),
        analysis_cache=JsonAnalysisCache(cache_root),
    ).run(request)

    assert model.channel_calls == initial_calls
    assert resumed.telemetry.cache_mode == "resume"
    assert all(path.stat().st_mode & 0o077 == 0 for path in stage_root.rglob("*.json"))


def test_json_persistence_rejects_oversized_writes_and_existing_documents(tmp_path) -> None:
    root = tmp_path / "bounded-cache"
    bounded = JsonAnalysisCache(root, max_document_bytes=64)

    with pytest.raises(RuntimeError, match="size limit"):
        bounded.put("a" * 64, {"payload": "x" * 100})
    assert list(root.rglob("*.json")) == []

    generous = JsonAnalysisCache(root, max_document_bytes=1_000)
    generous.put("a" * 64, {"payload": "x" * 100})
    with pytest.raises(RuntimeError, match="size limit"):
        bounded.get("a" * 64)
