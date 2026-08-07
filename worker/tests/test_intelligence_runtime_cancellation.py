"""Deterministic in-flight inference cancellation containment harness.

Proves the ``BoundedIntelligenceRuntime`` total-deadline boundary for
already-running channel inference calls: the run returns a bounded
``RunDeadlineExceeded`` at the total deadline without waiting for the full
per-call ceiling, submits no further channel or synthesis work, never persists
a late result after the terminal decision, preserves independently completed
stages, caps each cooperative transport timeout to the remaining run budget,
and exposes allowlisted cancellation classification that distinguishes
confirmed queued cancellation from UNKNOWN in-flight transport termination
with a non-secret correction tip.

A deterministic blocking fake transport controlled by threading events is the
primary synchronization: the harness proves the fake is provably still running
(``release`` unset, ``started`` set) when the runtime returns, then releases it
and proves its late output was never saved. Wall-clock assertions are
generously bounded; they are secondary to the deterministic event and
persistence proofs. Fixtures prove orchestration/containment behavior only,
never live provider cancellation, latency, cost, or report quality.

The machine-readable evidence fixture is regenerated deterministically by
``test_cancellation_evidence_fixture_records_zero_provider_calls`` into
``tests/fixtures/intelligence/runtime_cancellation/runtime_cancellation_evidence.json``.
It is not a competing contract with ``runtime_budget_evidence.json``: the
budget fixture remains the canonical full call/cache/resume/deadline/token/cost
matrix, while this narrower artifact records the in-flight containment boundary
scenarios with the blocking fake. Both share the same mock-only harness and the
``provider_calls: 0`` contract.
"""

from __future__ import annotations

from collections import Counter
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
    InferencePolicy,
    IntelligenceRunRequest,
    JsonStageStore,
    MemoryAnalysisCache,
    MemoryStageStore,
    ModelResponse,
    RunDeadlineExceeded,
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

# Real wall-clock deadline used by the blocking-fake scenarios. The bound
# assertions are generous: the deterministic proof is the event-controlled
# fake plus the persistence/classification invariants, not the sleep itself.
DEADLINE_SECONDS = 0.5
ELAPSED_LOWER = 0.3  # waited out the remaining budget (generous)
ELAPSED_UPPER = 5.0  # nowhere near the 150-second per-call ceiling


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


class BlockingFakeTransport:
    """Deterministic blocking fake channel transport driven by threading events.

    Each ``analyze_channel`` call records the cooperative timeout it received,
    signals ``started``, then blocks on ``release`` until the harness lets it
    finish (signaling ``finished`` on the way out). The harness uses
    ``started``/``release`` to prove the fake was provably still running when
    the runtime returned, then releases it and asserts the late output was
    never persisted.
    """

    def __init__(self, block: set[str] | None = None) -> None:
        self.block = block if block is not None else set(CHANNEL_IDS)
        self.started = threading.Event()
        self.release = threading.Event()
        self.finished = threading.Event()
        self.channel_calls: Counter[str] = Counter()
        self.synthesis_calls = 0
        self.received_timeouts: list[float] = []
        self.lock = threading.Lock()

    def analyze_channel(self, payload: dict[str, Any], *, policy: InferencePolicy) -> ModelResponse:
        channel = payload["channel"]
        channel_id = channel["channel_id"]
        with self.lock:
            self.channel_calls[channel_id] += 1
            self.received_timeouts.append(policy.timeout_seconds)
        self.started.set()
        if channel_id in self.block:
            self.release.wait(timeout=30.0)
        self.finished.set()
        evidence_id = channel["evidence"][0]["evidence_id"]
        return ModelResponse(_analysis(channel["channel_type"], evidence_id), 100, 50, 0.01)

    def synthesize(self, payload: dict[str, Any], *, policy: InferencePolicy) -> ModelResponse:
        self.synthesis_calls += 1
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


class PassingModel:
    """Non-blocking model that records calls; completes every channel instantly."""

    def __init__(self) -> None:
        self.channel_calls: Counter[str] = Counter()
        self.synthesis_calls = 0
        self.received_timeouts: list[float] = []

    def analyze_channel(self, payload: dict[str, Any], *, policy: InferencePolicy) -> ModelResponse:
        channel = payload["channel"]
        self.channel_calls[channel["channel_id"]] += 1
        self.received_timeouts.append(policy.timeout_seconds)
        evidence_id = channel["evidence"][0]["evidence_id"]
        return ModelResponse(_analysis(channel["channel_type"], evidence_id), 100, 50, 0.01)

    def synthesize(self, payload: dict[str, Any], *, policy: InferencePolicy) -> ModelResponse:
        self.synthesis_calls += 1
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


def _stages_completed(
    stages: MemoryStageStore | JsonStageStore,
    request: IntelligenceRunRequest,
) -> int:
    return sum(
        1
        for channel in request.channels
        if stages.load_channel(request.run_id, channel.channel_id) is not None
    )


def _run_deadline_capture(
    request: IntelligenceRunRequest,
    model: Any,
    *,
    stages: MemoryStageStore | JsonStageStore,
    deadline_seconds: float,
) -> tuple[dict[str, Any], float]:
    """Run under a real-clock deadline and return the allowlisted telemetry.

    Returns ``(telemetry_dict, elapsed_real_seconds)``. A
    ``RunDeadlineExceeded`` failure is expected; the normalized telemetry
    emitted by the sink is still returned.
    """
    recorded: list[dict[str, Any]] = []

    def _sink(data: Mapping[str, Any]) -> None:
        recorded.append(dict(data))

    runtime = BoundedIntelligenceRuntime(
        model=model,
        stage_store=stages,
        now=FIXED_NOW,
        deadline_seconds=deadline_seconds,
        telemetry_sink=_sink,
    )
    started_at = time.monotonic()
    try:
        runtime.run(request)
    except RunDeadlineExceeded:
        pass
    elapsed = time.monotonic() - started_at
    assert recorded, "every run must emit allowlisted telemetry"
    return recorded[0], elapsed


# ---------------------------------------------------------------------------
# Bounded in-flight return at the total deadline
# ---------------------------------------------------------------------------


def test_inflight_deadline_returns_bounded_while_transport_still_running() -> None:
    model = BlockingFakeTransport()
    stages = MemoryStageStore()
    request = _request("cancel-inflight", 4)
    try:
        telemetry, elapsed = _run_deadline_capture(
            request, model, stages=stages, deadline_seconds=DEADLINE_SECONDS
        )
        # Bounded return: waited out the remaining budget, but nowhere near the
        # 150-second per-call ceiling.
        assert ELAPSED_LOWER <= elapsed < ELAPSED_UPPER
        # Deterministic synchronization: the transport started but is provably
        # still blocked when the runtime returned.
        assert model.started.is_set()
        assert not model.release.is_set()
        # Terminal classification: all three submitted calls were in flight and
        # could not be proven stopped; the fourth was never submitted.
        assert telemetry["status"] == "failed"
        assert telemetry["failure_code"] == "run_deadline_exceeded"
        assert telemetry["deadline_exceeded"] is True
        assert telemetry["channel_calls"] == 3
        assert telemetry["synthesis_calls"] == 0
        assert telemetry["queued_cancelled"] == 1
        assert telemetry["inflight_unknown"] == 3
        assert telemetry["cancellation_tip"] is not None
        assert "UNKNOWN" in telemetry["cancellation_tip"]
        # Cooperative transports received a timeout capped to the remaining
        # budget, not the per-call ceiling.
        assert len(model.received_timeouts) == 3
        assert all(0.2 <= timeout <= DEADLINE_SECONDS + 0.05 for timeout in model.received_timeouts)
        assert all(timeout < 150.0 for timeout in model.received_timeouts)
        # No stage work was started for the never-submitted channel.
        assert model.channel_calls[CHANNEL_IDS[3]] == 0
        assert _stages_completed(stages, request) == 0
    finally:
        model.release.set()
    # Late output arrives only after the terminal decision and is never
    # persisted: the transport actually finished, yet no stage exists.
    assert model.finished.wait(timeout=5.0)
    assert _stages_completed(stages, request) == 0


def test_inflight_deadline_preserves_completed_sibling_and_resumes() -> None:
    model = BlockingFakeTransport(block={CHANNEL_IDS[0]})
    stages = MemoryStageStore()
    request = _request("cancel-sibling", 4)
    try:
        telemetry, elapsed = _run_deadline_capture(
            request, model, stages=stages, deadline_seconds=DEADLINE_SECONDS
        )
        assert ELAPSED_LOWER <= elapsed < ELAPSED_UPPER
        assert telemetry["failure_code"] == "run_deadline_exceeded"
        assert telemetry["channel_calls"] == 3
        assert telemetry["queued_cancelled"] == 1  # fourth channel never submitted
        assert telemetry["inflight_unknown"] == 1  # the blocked channel
        assert telemetry["cancellation_tip"] is not None
        # The two siblings that completed before the decision are preserved.
        assert stages.load_channel(request.run_id, CHANNEL_IDS[1]) is not None
        assert stages.load_channel(request.run_id, CHANNEL_IDS[2]) is not None
        assert stages.load_channel(request.run_id, CHANNEL_IDS[0]) is None  # in-flight: no stage
        assert _stages_completed(stages, request) == 2
        assert model.synthesis_calls == 0  # no synthesis after the deadline
    finally:
        model.release.set()
    assert model.finished.wait(timeout=5.0)
    # Even after the blocked transport actually finished, its late output was
    # never persisted.
    assert stages.load_channel(request.run_id, CHANNEL_IDS[0]) is None

    # Resume: the preserved siblings load from stage; only the missing channels
    # are re-inferred; the run completes.
    resumed = PassingModel()
    completed = BoundedIntelligenceRuntime(model=resumed, stage_store=stages).run(request)
    assert completed.telemetry.cache_mode == "resume"
    assert resumed.channel_calls == Counter({CHANNEL_IDS[0]: 1, CHANNEL_IDS[3]: 1})
    assert resumed.synthesis_calls == 1
    assert _stages_completed(stages, request) == 4


def test_inflight_deadline_submits_no_further_channel_or_synthesis_work() -> None:
    model = BlockingFakeTransport()
    stages = MemoryStageStore()
    request = _request("cancel-nofurther", 4)
    try:
        telemetry, _ = _run_deadline_capture(
            request, model, stages=stages, deadline_seconds=DEADLINE_SECONDS
        )
    finally:
        model.release.set()
    assert model.finished.wait(timeout=5.0)
    # Only one worker-sized batch was ever submitted (3 calls); the fourth
    # channel was never dispatched and synthesis never ran.
    assert telemetry["channel_calls"] == 3
    assert sum(model.channel_calls.values()) == 3
    assert model.channel_calls[CHANNEL_IDS[3]] == 0
    assert telemetry["synthesis_calls"] == 0
    assert model.synthesis_calls == 0


# ---------------------------------------------------------------------------
# Cooperative timeout propagation
# ---------------------------------------------------------------------------


def test_cooperative_timeout_is_capped_to_remaining_budget() -> None:
    model = PassingModel()
    runtime = BoundedIntelligenceRuntime(
        model=model,
        deadline_seconds=2.0,
        now=FIXED_NOW,
    )
    completed = runtime.run(_request("cancel-cap", 1))
    assert completed.telemetry.status == "succeeded"
    assert len(model.received_timeouts) == 1
    # Capped to the remaining total budget (~2.0s), not the 150s ceiling.
    assert 0.5 <= model.received_timeouts[0] <= 2.01
    assert model.received_timeouts[0] < 150.0


def test_without_total_deadline_transport_keeps_policy_ceiling() -> None:
    model = PassingModel()
    runtime = BoundedIntelligenceRuntime(model=model, now=FIXED_NOW)
    completed = runtime.run(_request("cancel-no-deadline", 1))
    assert completed.telemetry.status == "succeeded"
    assert model.received_timeouts == [150.0]


# ---------------------------------------------------------------------------
# Scrubbed cancellation telemetry and evidence fixture
# ---------------------------------------------------------------------------


def test_cancellation_telemetry_is_scrubbed_and_allowlisted() -> None:
    model = BlockingFakeTransport()
    stages = MemoryStageStore()
    request = _request("cancel-telemetry", 4)
    try:
        telemetry, _ = _run_deadline_capture(
            request, model, stages=stages, deadline_seconds=DEADLINE_SECONDS
        )
    finally:
        model.release.set()
    assert model.finished.wait(timeout=5.0)

    allowed = {
        "status", "failure_code", "cache_mode", "channel_calls",
        "synthesis_calls", "correction_calls", "tokens_in", "tokens_out",
        "cost_usd", "evidence_items", "stage_timings", "model", "provider",
        "deadline_seconds", "deadline_exceeded",
        "queued_cancelled", "inflight_unknown", "cancellation_tip",
    }
    assert set(telemetry) == allowed
    rendered = json.dumps(telemetry, sort_keys=True)
    assert "Ada" not in rendered
    assert "public locator" not in rendered
    assert "private analytics" not in rendered
    for channel_id in CHANNEL_IDS:
        assert channel_id not in rendered
    assert "secret" not in rendered.lower()


def _scenario_inflight_all_blocked() -> dict[str, Any]:
    model = BlockingFakeTransport()
    stages = MemoryStageStore()
    request = _request("cancel-fixture-all", 4)
    try:
        telemetry, _ = _run_deadline_capture(
            request, model, stages=stages, deadline_seconds=DEADLINE_SECONDS
        )
    finally:
        model.release.set()
    assert model.finished.wait(timeout=5.0)
    return {
        "scenario": "inflight_all_blocked",
        "status": telemetry["status"],
        "failure_code": telemetry["failure_code"],
        "deadline_exceeded": telemetry["deadline_exceeded"],
        "channel_calls": telemetry["channel_calls"],
        "synthesis_calls": telemetry["synthesis_calls"],
        "queued_cancelled": telemetry["queued_cancelled"],
        "inflight_unknown": telemetry["inflight_unknown"],
        "cancellation_tip_present": telemetry["cancellation_tip"] is not None,
        "cancellation_unknown_labeled": "UNKNOWN" in (telemetry["cancellation_tip"] or ""),
        "stages_completed": _stages_completed(stages, request),
        "timeout_capped_to_budget": all(
            0.2 <= timeout <= DEADLINE_SECONDS + 0.05 for timeout in model.received_timeouts
        )
        and all(timeout < 150.0 for timeout in model.received_timeouts),
    }


def _scenario_inflight_with_completed_sibling() -> dict[str, Any]:
    model = BlockingFakeTransport(block={CHANNEL_IDS[0]})
    stages = MemoryStageStore()
    request = _request("cancel-fixture-sibling", 4)
    try:
        telemetry, _ = _run_deadline_capture(
            request, model, stages=stages, deadline_seconds=DEADLINE_SECONDS
        )
    finally:
        model.release.set()
    assert model.finished.wait(timeout=5.0)
    return {
        "scenario": "inflight_with_completed_sibling",
        "status": telemetry["status"],
        "failure_code": telemetry["failure_code"],
        "deadline_exceeded": telemetry["deadline_exceeded"],
        "channel_calls": telemetry["channel_calls"],
        "synthesis_calls": telemetry["synthesis_calls"],
        "queued_cancelled": telemetry["queued_cancelled"],
        "inflight_unknown": telemetry["inflight_unknown"],
        "cancellation_tip_present": telemetry["cancellation_tip"] is not None,
        "stages_completed": _stages_completed(stages, request),
        "sibling_preserved": (
            stages.load_channel(request.run_id, CHANNEL_IDS[1]) is not None
            and stages.load_channel(request.run_id, CHANNEL_IDS[2]) is not None
        ),
        "in_flight_stage_absent": stages.load_channel(request.run_id, CHANNEL_IDS[0]) is None,
    }


def _scenario_resume_completed_sibling() -> dict[str, Any]:
    model = BlockingFakeTransport(block={CHANNEL_IDS[0]})
    stages = MemoryStageStore()
    request = _request("cancel-fixture-resume", 4)
    try:
        _run_deadline_capture(request, model, stages=stages, deadline_seconds=DEADLINE_SECONDS)
    finally:
        model.release.set()
    assert model.finished.wait(timeout=5.0)
    resumed = PassingModel()
    completed = BoundedIntelligenceRuntime(model=resumed, stage_store=stages).run(request)
    return {
        "scenario": "resume_completed_sibling",
        "status": completed.telemetry.status,
        "cache_mode": completed.telemetry.cache_mode,
        "channel_calls": completed.telemetry.channel_calls,
        "synthesis_calls": completed.telemetry.synthesis_calls,
        "stages_completed": _stages_completed(stages, request),
        "resumed_calls_total": sum(resumed.channel_calls.values()),
    }


def test_cancellation_evidence_fixture_records_zero_provider_calls() -> None:
    scenarios = {
        "inflight_all_blocked": _scenario_inflight_all_blocked(),
        "inflight_with_completed_sibling": _scenario_inflight_with_completed_sibling(),
        "resume_completed_sibling": _scenario_resume_completed_sibling(),
    }
    document = {
        "schema_version": "1.0",
        "generated_by": "worker/tests/test_intelligence_runtime_cancellation.py",
        "clock": "real_monotonic_bounded",
        "model": "blocking_fake_transport_events",
        "live_provider": False,
        "provider_calls": 0,
        "per_call_ceiling_seconds": 150.0,
        "scenarios": scenarios,
    }
    out = (
        Path(__file__).resolve().parent
        / "fixtures"
        / "intelligence"
        / "runtime_cancellation"
        / "runtime_cancellation_evidence.json"
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    loaded = json.loads(out.read_text(encoding="utf-8"))
    assert loaded["provider_calls"] == 0
    assert loaded["live_provider"] is False
    assert loaded["model"] == "blocking_fake_transport_events"

    data = loaded["scenarios"]
    assert data["inflight_all_blocked"]["failure_code"] == "run_deadline_exceeded"
    assert data["inflight_all_blocked"]["channel_calls"] == 3
    assert data["inflight_all_blocked"]["queued_cancelled"] == 1
    assert data["inflight_all_blocked"]["inflight_unknown"] == 3
    assert data["inflight_all_blocked"]["cancellation_unknown_labeled"] is True
    assert data["inflight_all_blocked"]["synthesis_calls"] == 0
    assert data["inflight_all_blocked"]["stages_completed"] == 0
    assert data["inflight_all_blocked"]["timeout_capped_to_budget"] is True

    assert data["inflight_with_completed_sibling"]["failure_code"] == "run_deadline_exceeded"
    assert data["inflight_with_completed_sibling"]["queued_cancelled"] == 1
    assert data["inflight_with_completed_sibling"]["inflight_unknown"] == 1
    assert data["inflight_with_completed_sibling"]["stages_completed"] == 2
    assert data["inflight_with_completed_sibling"]["sibling_preserved"] is True
    assert data["inflight_with_completed_sibling"]["in_flight_stage_absent"] is True

    assert data["resume_completed_sibling"]["status"] == "succeeded"
    assert data["resume_completed_sibling"]["cache_mode"] == "resume"
    assert data["resume_completed_sibling"]["synthesis_calls"] == 1
    assert data["resume_completed_sibling"]["stages_completed"] == 4
    assert data["resume_completed_sibling"]["resumed_calls_total"] == 2

    rendered = json.dumps(loaded, sort_keys=True)
    assert "Ada" not in rendered
    assert "public locator" not in rendered
    assert "private analytics" not in rendered
    for channel_id in CHANNEL_IDS:
        assert channel_id not in rendered
