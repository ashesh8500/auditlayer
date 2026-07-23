from __future__ import annotations

from collections import Counter
from dataclasses import replace
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
    return {
        "schema_version": "1.0",
        "evidence_id": f"ev-{suffix}",
        "subject_id": SUBJECT_ID,
        "channel_id": channel_id,
        "source_type": "official_web",
        "source_url": f"https://example.com/{suffix}",
        "observed_at": "2026-07-23T01:02:03Z",
        "expires_at": None,
        "content_hash": suffix * 64,
        "confidence": "high",
        "coverage": {},
        "payload": {"text": suffix},
    }


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
            {"id": "old-rec", "action": "Do not repeat"},
            {"id": f"rec-{channel_type}", "action": "Run a bounded experiment"},
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
    assert completed.result["scores"] == [
        {
            "dimension": "profile_clarity",
            "value": 70.0,
            "evidence_ids": ["ev-a"],
            "methodology_version": "moat-1",
        },
        {
            "dimension": "audience_fit",
            "value": None,
            "evidence_ids": [],
            "methodology_version": "moat-1",
        },
    ]
    assert {item["id"] for item in completed.result["recommendations"]} == {"rec-instagram"}


def test_multi_channel_fanout_is_concurrent_and_capped_at_three() -> None:
    model = RecordingModel(pause=0.03)
    runtime = BoundedIntelligenceRuntime(model=model, max_channel_workers=3)

    completed = runtime.run(_request("run-multi", 3))

    assert sum(model.channel_calls.values()) == 3
    assert model.max_active == 3
    assert model.synthesis_calls == 1
    assert completed.telemetry.channel_calls == 3

    with pytest.raises(RuntimePolicyError, match="at most three channels"):
        runtime.run(_request("run-too-many", 4))


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
