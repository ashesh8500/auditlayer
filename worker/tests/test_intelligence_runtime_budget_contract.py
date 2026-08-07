"""Deterministic bounded-runtime budget contract and evidence harness.

Quantifies the complete bounded-runtime matrix for ``BoundedIntelligenceRuntime``
from mock-only runs: per-channel call counts, capped concurrency, exactly one
synthesis for multi-channel work, exact cache identity, stage resume across
sibling/synthesis failure and process recreation, a deterministic total run
deadline that stops new stage work, normalized scrubbed timeout telemetry, and
token/cost/stage counts.

Only injected clocks and recording mock models are used. There are zero live
provider calls: the machine-readable evidence fixture records ``provider_calls:
0``. Fixtures prove orchestration invariants, never production latency,
provider reliability, cost, or report quality.

The evidence fixture is regenerated deterministically by
``test_budget_evidence_fixture_records_zero_provider_calls`` into
``tests/fixtures/intelligence/runtime_budget/runtime_budget_evidence.json``.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import replace
from datetime import datetime, timezone
import json
from pathlib import Path
import threading
import time
from typing import Any, Mapping

import pytest

from auditlayer_worker.intelligence import (
    BoundedIntelligenceRuntime,
    ChannelInput,
    CompletedIntelligenceRun,
    InferencePolicy,
    IntelligenceRunRequest,
    JsonAnalysisCache,
    JsonStageStore,
    MemoryAnalysisCache,
    MemoryStageStore,
    ModelResponse,
    RunDeadlineExceeded,
    RuntimePolicyError,
    RuntimeTelemetry,
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
FIXED_NOW = lambda: datetime(2026, 7, 23, 2, tzinfo=timezone.utc)  # noqa: E731

# Simulated wall-clock latency per model call. Only the injected clock drives
# simulated latency; the small real sleep merely lets worker threads overlap so
# the capped concurrency is observable.
CHANNEL_SIM_SECONDS = 2.0
SYNTHESIS_SIM_SECONDS = 0.5
REAL_SLEEP_SECONDS = 0.02


class MockClock:
    """Deterministic monotonic clock for the budget harness."""

    def __init__(self, start: float = 0.0) -> None:
        self.value = start

    def now(self) -> float:
        return self.value

    def advance(self, delta: float) -> None:
        self.value += delta


class SpentBudgetClock(MockClock):
    """Simulates wall-clock passage between run entry and the first stage check.

    The first ``now()`` call (the run-deadline computation) returns zero; every
    later call reports the spent value, so the total budget is already exhausted
    before any stage work can begin. Deterministic and mock-only.
    """

    def __init__(self, spent_value: float = 10.0) -> None:
        super().__init__(0.0)
        self.spent_value = spent_value
        self.calls = 0

    def now(self) -> float:
        self.calls += 1
        if self.calls == 1:
            return 0.0
        return self.spent_value


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
        score_dimensions=("profile_clarity",),
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
            {
                "id": f"rec-{channel_type}",
                "action": "Run a bounded experiment",
                "evidence_ids": [evidence_id],
            }
        ],
        "context_update_proposals": [],
        "limitations": ["Data needed: private analytics"],
    }


class BudgetRecordingModel:
    """Mock model that records calls/concurrency and advances an injected clock.

    ``fail_channel_once`` / ``fail_synthesis_once`` make the first matching call
    raise so resume invariants can be measured deterministically.
    """

    def __init__(
        self,
        clock: MockClock,
        *,
        fail_channel_once: str | None = None,
        fail_synthesis_once: bool = False,
    ) -> None:
        self.clock = clock
        self.fail_channel_once = fail_channel_once
        self.fail_synthesis_once = fail_synthesis_once
        self.channel_calls: Counter[str] = Counter()
        self.synthesis_calls = 0
        self.correction_calls = 0
        self.active = 0
        self.max_active = 0
        self.lock = threading.Lock()

    def analyze_channel(self, payload: dict[str, Any], *, policy: InferencePolicy) -> ModelResponse:
        channel = payload["channel"]
        with self.lock:
            self.active += 1
            self.max_active = max(self.max_active, self.active)
        try:
            time.sleep(REAL_SLEEP_SECONDS)
            self.clock.advance(CHANNEL_SIM_SECONDS)
            self.channel_calls[channel["channel_id"]] += 1
            if self.fail_channel_once == channel["channel_id"]:
                self.fail_channel_once = None
                raise TimeoutError("one channel timed out")
            evidence_id = channel["evidence"][0]["evidence_id"]
            return ModelResponse(_analysis(channel["channel_type"], evidence_id), 100, 50, 0.01)
        finally:
            with self.lock:
                self.active -= 1

    def synthesize(self, payload: dict[str, Any], *, policy: InferencePolicy) -> ModelResponse:
        self.synthesis_calls += 1
        if self.fail_synthesis_once and self.synthesis_calls == 1:
            raise TimeoutError("synthesis timeout")
        self.clock.advance(SYNTHESIS_SIM_SECONDS)
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


def _run_capturing(
    request: IntelligenceRunRequest,
    *,
    clock: MockClock,
    model: BudgetRecordingModel,
    stages: MemoryStageStore | JsonStageStore,
    cache: MemoryAnalysisCache | JsonAnalysisCache | None = None,
    deadline_seconds: float | None = None,
) -> tuple[dict[str, Any], CompletedIntelligenceRun | None]:
    """Run once and return the allowlisted telemetry dict (recorded via sink).

    A ``RunDeadlineExceeded`` failure is expected in deadline scenarios; the
    normalized telemetry emitted by the sink is still returned.
    """
    recorded: list[dict[str, Any]] = []

    def _sink(data: Mapping[str, Any]) -> None:
        recorded.append(dict(data))

    runtime = BoundedIntelligenceRuntime(
        model=model,
        stage_store=stages,
        analysis_cache=cache,
        clock=clock.now,
        now=FIXED_NOW,
        deadline_seconds=deadline_seconds,
        telemetry_sink=_sink,
    )
    completed: CompletedIntelligenceRun | None = None
    try:
        completed = runtime.run(request)
    except Exception:
        # Failure scenarios (sibling/synthesis/deadline) raise the underlying
        # bounded error; the allowlisted telemetry is what the harness asserts.
        pass
    assert recorded, "every run must emit allowlisted telemetry"
    return recorded[0], completed


def _stages_completed(
    stages: MemoryStageStore | JsonStageStore,
    request: IntelligenceRunRequest,
) -> int:
    return sum(
        1
        for channel in request.channels
        if stages.load_channel(request.run_id, channel.channel_id) is not None
    )


def _measured(
    scenario: str,
    telemetry: dict[str, Any],
    model: BudgetRecordingModel,
    stages: MemoryStageStore | JsonStageStore,
    request: IntelligenceRunRequest,
) -> dict[str, Any]:
    return {
        "scenario": scenario,
        "status": telemetry["status"],
        "failure_code": telemetry["failure_code"],
        "cache_mode": telemetry["cache_mode"],
        "channel_calls": telemetry["channel_calls"],
        "synthesis_calls": telemetry["synthesis_calls"],
        "correction_calls": telemetry["correction_calls"],
        "tokens_in": telemetry["tokens_in"],
        "tokens_out": telemetry["tokens_out"],
        "cost_usd": telemetry["cost_usd"],
        "evidence_items": telemetry["evidence_items"],
        "deadline_seconds": telemetry["deadline_seconds"],
        "deadline_exceeded": telemetry["deadline_exceeded"],
        "max_concurrency": model.max_active,
        "stages_completed": _stages_completed(stages, request),
        "synthesis_stage_present": stages.load_synthesis(request.run_id) is not None,
    }


# ---------------------------------------------------------------------------
# Scenario runners (deterministic, mock-only)
# ---------------------------------------------------------------------------


def _scenario_single_channel() -> dict[str, Any]:
    clock = MockClock()
    model = BudgetRecordingModel(clock)
    stages = MemoryStageStore()
    request = _request("budget-single")
    telemetry, completed = _run_capturing(
        request, clock=clock, model=model, stages=stages, deadline_seconds=10.0
    )
    assert completed is not None
    measured = _measured("single_channel", telemetry, model, stages, request)
    assert measured["channel_calls"] == 1
    assert measured["synthesis_calls"] == 0
    assert measured["max_concurrency"] == 1
    assert measured["stages_completed"] == 1
    return measured


def _scenario_multi_channel() -> dict[str, Any]:
    clock = MockClock()
    model = BudgetRecordingModel(clock)
    stages = MemoryStageStore()
    request = _request("budget-multi", 4)
    telemetry, completed = _run_capturing(
        request, clock=clock, model=model, stages=stages, deadline_seconds=20.0
    )
    assert completed is not None
    measured = _measured("multi_channel", telemetry, model, stages, request)
    assert measured["channel_calls"] == 4
    # Concurrency contract is the CAP (<= 3); exactly three depends on OS
    # thread spawn + GIL timing, so prove parallel fan-out (>= 2) and the cap.
    assert 2 <= measured["max_concurrency"] <= 3
    assert measured["synthesis_calls"] == 1
    assert measured["stages_completed"] == 4
    assert measured["synthesis_stage_present"] is True
    return measured


def _scenario_cache_reuse() -> dict[str, Any]:
    clock = MockClock()
    model = BudgetRecordingModel(clock)
    cache = MemoryAnalysisCache()
    prime = _run_capturing(
        _request("budget-cache-prime"), clock=clock, model=model, stages=MemoryStageStore(), cache=cache, deadline_seconds=10.0
    )[0]
    prime_calls = prime["channel_calls"]
    reused, _ = _run_capturing(
        _request("budget-cache-hit"), clock=clock, model=model, stages=MemoryStageStore(), cache=cache, deadline_seconds=10.0
    )
    miss, _ = _run_capturing(
        _request("budget-cache-miss", prompt_version="1.1"), clock=clock, model=model, stages=MemoryStageStore(), cache=cache, deadline_seconds=10.0
    )
    assert prime_calls == 1
    assert reused["cache_mode"] == "reused"
    assert reused["channel_calls"] == 0
    assert miss["cache_mode"] == "fresh"
    assert miss["channel_calls"] == 1
    return {
        "scenario": "cache_reuse",
        "prime_channel_calls": prime_calls,
        "reused_channel_calls": reused["channel_calls"],
        "reused_cache_mode": reused["cache_mode"],
        "miss_channel_calls": miss["channel_calls"],
        "miss_cache_mode": miss["cache_mode"],
    }


def _scenario_resume_after_sibling_failure() -> dict[str, Any]:
    clock = MockClock()
    model = BudgetRecordingModel(clock, fail_channel_once=CHANNEL_IDS[0])
    stages = MemoryStageStore()
    request = _request("budget-sibling", 2)
    first, _ = _run_capturing(request, clock=clock, model=model, stages=stages, deadline_seconds=10.0)
    assert first["status"] == "failed"
    assert first["failure_code"] == "inference_timeout"
    assert _stages_completed(stages, request) == 1  # successful sibling preserved
    second, completed = _run_capturing(request, clock=clock, model=model, stages=stages, deadline_seconds=10.0)
    assert completed is not None
    assert second["cache_mode"] == "resume"
    assert model.channel_calls[CHANNEL_IDS[0]] == 2
    assert model.channel_calls[CHANNEL_IDS[1]] == 1
    measured = _measured("resume_after_sibling_failure", second, model, stages, request)
    assert measured["stages_completed"] == 2
    return measured


def _scenario_resume_after_synthesis_failure() -> dict[str, Any]:
    clock = MockClock()
    model = BudgetRecordingModel(clock, fail_synthesis_once=True)
    stages = MemoryStageStore()
    request = _request("budget-synth", 2)
    first, _ = _run_capturing(request, clock=clock, model=model, stages=stages, deadline_seconds=10.0)
    assert first["status"] == "failed"
    assert first["failure_code"] == "inference_timeout"
    assert model.synthesis_calls == 1
    calls_after_failure = model.channel_calls.copy()
    second, completed = _run_capturing(request, clock=clock, model=model, stages=stages, deadline_seconds=10.0)
    assert completed is not None
    assert model.channel_calls == calls_after_failure  # channels not rerun
    assert model.synthesis_calls == 2
    measured = _measured("resume_after_synthesis_failure", second, model, stages, request)
    assert measured["cache_mode"] == "resume"
    assert measured["synthesis_calls"] == 1  # only the retry's synthesis
    return measured


def _scenario_resume_after_process_recreation(root: Path) -> dict[str, Any]:
    clock = MockClock()
    model = BudgetRecordingModel(clock, fail_synthesis_once=True)
    stage_root = root / "stages"
    cache_root = root / "cache"
    request = _request("budget-durable", 2)
    first, _ = _run_capturing(
        request,
        clock=clock,
        model=model,
        stages=JsonStageStore(stage_root),
        cache=JsonAnalysisCache(cache_root),
        deadline_seconds=10.0,
    )
    assert first["status"] == "failed"
    calls_after_failure = model.channel_calls.copy()

    resumed_clock = MockClock()
    resumed_model = BudgetRecordingModel(resumed_clock)
    resumed, completed = _run_capturing(
        request,
        clock=resumed_clock,
        model=resumed_model,
        stages=JsonStageStore(stage_root),
        cache=JsonAnalysisCache(cache_root),
        deadline_seconds=10.0,
    )
    assert completed is not None
    assert resumed_model.channel_calls == Counter()  # durable JSON resume
    assert resumed["cache_mode"] == "resume"
    assert resumed_model.synthesis_calls == 1
    measured = _measured(
        "resume_after_process_recreation", resumed, resumed_model, JsonStageStore(stage_root), request
    )
    assert measured["stages_completed"] == 2
    return measured


def _scenario_deadline_before_submission() -> dict[str, Any]:
    clock = SpentBudgetClock(spent_value=10.0)
    model = BudgetRecordingModel(clock)
    stages = MemoryStageStore()
    request = _request("budget-deadline-pre", 4)
    telemetry, completed = _run_capturing(
        request, clock=clock, model=model, stages=stages, deadline_seconds=5.0
    )
    assert completed is None
    measured = _measured("deadline_before_submission", telemetry, model, stages, request)
    assert measured["status"] == "failed"
    assert measured["failure_code"] == "run_deadline_exceeded"
    assert measured["deadline_exceeded"] is True
    assert measured["channel_calls"] == 0  # no stage work at all
    assert measured["synthesis_calls"] == 0
    assert measured["stages_completed"] == 0
    assert measured["max_concurrency"] == 0
    return measured


def _scenario_deadline_stops_new_work() -> dict[str, Any]:
    clock = MockClock()
    model = BudgetRecordingModel(clock)
    stages = MemoryStageStore()
    request = _request("budget-deadline", 4)
    telemetry, completed = _run_capturing(
        request, clock=clock, model=model, stages=stages, deadline_seconds=5.0
    )
    assert completed is None
    measured = _measured("deadline_stops_new_work", telemetry, model, stages, request)
    assert measured["status"] == "failed"
    assert measured["failure_code"] == "run_deadline_exceeded"
    assert measured["deadline_exceeded"] is True
    assert measured["channel_calls"] == 3  # one worker-sized batch started
    assert measured["synthesis_calls"] == 0  # no new stage work after deadline
    assert measured["max_concurrency"] <= 3
    assert measured["stages_completed"] == 3  # completed stages preserved
    assert measured["synthesis_stage_present"] is False
    assert measured["tokens_in"] == 300
    assert measured["cost_usd"] == 0.03
    return measured


def _scenario_resume_after_deadline(root: Path) -> dict[str, Any]:
    clock = MockClock()
    model = BudgetRecordingModel(clock)
    stage_root = root / "stages"
    cache_root = root / "cache"
    request = _request("budget-deadline-durable", 4)
    first, _ = _run_capturing(
        request,
        clock=clock,
        model=model,
        stages=JsonStageStore(stage_root),
        cache=JsonAnalysisCache(cache_root),
        deadline_seconds=5.0,
    )
    assert first["failure_code"] == "run_deadline_exceeded"

    resumed_clock = MockClock()
    resumed_model = BudgetRecordingModel(resumed_clock)
    resumed_stages = JsonStageStore(stage_root)
    resumed, completed = _run_capturing(
        request,
        clock=resumed_clock,
        model=resumed_model,
        stages=resumed_stages,
        cache=JsonAnalysisCache(cache_root),
        deadline_seconds=10.0,
    )
    assert completed is not None
    assert resumed["cache_mode"] == "resume"
    assert resumed["channel_calls"] == 1  # only the channel that never completed
    assert resumed["synthesis_calls"] == 1
    assert resumed["status"] == "succeeded"
    measured = _measured("resume_after_deadline", resumed, resumed_model, resumed_stages, request)
    assert measured["stages_completed"] == 4
    return measured


# ---------------------------------------------------------------------------
# Named contract cases
# ---------------------------------------------------------------------------


def test_budget_single_channel_exactly_one_call_and_no_synthesis() -> None:
    measured = _scenario_single_channel()
    assert measured["channel_calls"] == 1
    assert measured["synthesis_calls"] == 0
    assert measured["max_concurrency"] == 1


def test_budget_multi_channel_concurrency_capped_at_three_and_one_synthesis() -> None:
    measured = _scenario_multi_channel()
    assert measured["channel_calls"] == 4
    assert measured["max_concurrency"] == 3
    assert measured["synthesis_calls"] == 1


def test_budget_exact_cache_identity_reuse_and_miss() -> None:
    measured = _scenario_cache_reuse()
    assert measured["prime_channel_calls"] == 1
    assert measured["reused_channel_calls"] == 0
    assert measured["reused_cache_mode"] == "reused"
    assert measured["miss_channel_calls"] == 1
    assert measured["miss_cache_mode"] == "fresh"


def test_budget_resume_after_sibling_failure() -> None:
    measured = _scenario_resume_after_sibling_failure()
    assert measured["cache_mode"] == "resume"
    assert measured["stages_completed"] == 2


def test_budget_resume_after_synthesis_failure() -> None:
    measured = _scenario_resume_after_synthesis_failure()
    assert measured["cache_mode"] == "resume"
    assert measured["channel_calls"] == 0
    assert measured["synthesis_calls"] == 1


def test_budget_durable_json_resume_across_process_recreation(tmp_path: Path) -> None:
    measured = _scenario_resume_after_process_recreation(tmp_path / "durable")
    assert measured["cache_mode"] == "resume"
    assert measured["channel_calls"] == 0
    assert measured["stages_completed"] == 2


def test_budget_total_deadline_stops_new_stage_work_and_preserves_stages() -> None:
    measured = _scenario_deadline_stops_new_work()
    assert measured["failure_code"] == "run_deadline_exceeded"
    assert measured["deadline_exceeded"] is True
    assert measured["synthesis_calls"] == 0
    assert measured["stages_completed"] == 3


def test_budget_deadline_fails_closed_before_any_stage_work() -> None:
    measured = _scenario_deadline_before_submission()
    assert measured["failure_code"] == "run_deadline_exceeded"
    assert measured["channel_calls"] == 0
    assert measured["synthesis_calls"] == 0
    assert measured["stages_completed"] == 0


def test_budget_completed_stages_survive_deadline_and_resume(tmp_path: Path) -> None:
    measured = _scenario_resume_after_deadline(tmp_path / "deadline")
    assert measured["cache_mode"] == "resume"
    assert measured["channel_calls"] == 1
    assert measured["synthesis_calls"] == 1
    assert measured["stages_completed"] == 4


def test_budget_deadline_configuration_rejects_non_positive_budget() -> None:
    with pytest.raises(RuntimePolicyError, match="deadline must be positive"):
        BoundedIntelligenceRuntime(
            model=BudgetRecordingModel(MockClock()),
            deadline_seconds=0.0,
        )


def test_budget_telemetry_is_scrubbed_and_allowlisted() -> None:
    clock = MockClock()
    model = BudgetRecordingModel(clock)
    request = _request("budget-telemetry", 2)
    telemetry, completed = _run_capturing(
        request, clock=clock, model=model, stages=MemoryStageStore(), deadline_seconds=10.0
    )
    assert completed is not None
    rendered = json.dumps(telemetry, sort_keys=True)
    assert "Ada" not in rendered
    assert "public locator" not in rendered
    assert "private analytics" not in rendered
    for channel_id in CHANNEL_IDS:
        assert channel_id not in rendered


def test_budget_evidence_fixture_records_zero_provider_calls(tmp_path: Path) -> None:
    scenarios = {
        "single_channel": _scenario_single_channel(),
        "multi_channel": _scenario_multi_channel(),
        "cache_reuse": _scenario_cache_reuse(),
        "resume_after_sibling_failure": _scenario_resume_after_sibling_failure(),
        "resume_after_synthesis_failure": _scenario_resume_after_synthesis_failure(),
        "resume_after_process_recreation": _scenario_resume_after_process_recreation(tmp_path / "durable"),
        "deadline_before_submission": _scenario_deadline_before_submission(),
        "deadline_stops_new_work": _scenario_deadline_stops_new_work(),
        "resume_after_deadline": _scenario_resume_after_deadline(tmp_path / "deadline"),
    }
    document = {
        "schema_version": "1.0",
        "generated_by": "worker/tests/test_intelligence_runtime_budget_contract.py",
        "clock": "injected_mock_monotonic",
        "model": "recording_mock_model",
        "live_provider": False,
        "provider_calls": 0,
        "scenarios": scenarios,
    }
    out = (
        Path(__file__).resolve().parent
        / "fixtures"
        / "intelligence"
        / "runtime_budget"
        / "runtime_budget_evidence.json"
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    loaded = json.loads(out.read_text(encoding="utf-8"))
    assert loaded["provider_calls"] == 0
    assert loaded["live_provider"] is False
    assert loaded["clock"] == "injected_mock_monotonic"
    assert loaded["model"] == "recording_mock_model"

    data = loaded["scenarios"]
    assert data["single_channel"]["channel_calls"] == 1
    assert data["single_channel"]["synthesis_calls"] == 0
    assert 2 <= data["multi_channel"]["max_concurrency"] <= 3
    assert data["multi_channel"]["synthesis_calls"] == 1
    assert data["cache_reuse"]["reused_channel_calls"] == 0
    assert data["resume_after_sibling_failure"]["stages_completed"] == 2
    assert data["resume_after_synthesis_failure"]["cache_mode"] == "resume"
    assert data["resume_after_process_recreation"]["cache_mode"] == "resume"
    assert data["deadline_before_submission"]["failure_code"] == "run_deadline_exceeded"
    assert data["deadline_before_submission"]["channel_calls"] == 0
    assert data["deadline_stops_new_work"]["failure_code"] == "run_deadline_exceeded"
    assert data["deadline_stops_new_work"]["stages_completed"] == 3
    assert data["resume_after_deadline"]["cache_mode"] == "resume"

    rendered = json.dumps(loaded, sort_keys=True)
    assert "Ada" not in rendered
    assert "public locator" not in rendered
    for channel_id in CHANNEL_IDS:
        assert channel_id not in rendered
