"""Bounded fan-out/fan-in orchestration for typed intelligence analysis."""

from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from copy import deepcopy
from dataclasses import dataclass, field
import hashlib
import threading
import time
from typing import Any, Callable, Mapping, Protocol
from uuid import UUID

from .cache import CacheKeyParts, build_analysis_cache_key
from .evidence import EvidenceValidationError, canonical_json
from .projection import PROJECTION_VERSION, project_subject_context
from .validation import CHANNEL_TYPES, validate_channel_analysis


class RuntimePolicyError(ValueError):
    """A run attempts to exceed a locked inference/runtime boundary."""


@dataclass(frozen=True)
class InferencePolicy:
    provider: str = "deepseek"
    model: str = "deepseek-v4-flash"
    tools: tuple[str, ...] = ()
    memory: bool = False
    delegation: bool = False
    fallback_model: str | None = None
    temperature: float = 0.0
    channel_max_tokens: int = 6_000
    synthesis_max_tokens: int = 2_000
    timeout_seconds: float = 150.0

    def __post_init__(self) -> None:
        if self.provider != "deepseek" or self.model != "deepseek-v4-flash":
            raise RuntimePolicyError("production inference must use DeepSeek V4 Flash")
        if self.tools or self.memory or self.delegation or self.fallback_model is not None:
            raise RuntimePolicyError("inference must be tool-free, stateless, and have no fallback")
        if self.temperature != 0.0:
            raise RuntimePolicyError("intelligence inference temperature must be zero")
        if self.channel_max_tokens <= 0 or self.synthesis_max_tokens <= 0:
            raise RuntimePolicyError("token limits must be positive")
        if self.timeout_seconds <= 0 or self.timeout_seconds > 150:
            raise RuntimePolicyError("provider timeout must be in (0, 150] seconds")


@dataclass(frozen=True)
class ModelResponse:
    payload: Mapping[str, Any]
    tokens_in: int = 0
    tokens_out: int = 0
    cost_usd: float = 0.0
    correction_used: bool = False


class IntelligenceModel(Protocol):
    def analyze_channel(
        self, payload: dict[str, Any], *, policy: InferencePolicy
    ) -> ModelResponse: ...

    def synthesize(
        self, payload: dict[str, Any], *, policy: InferencePolicy
    ) -> ModelResponse: ...


@dataclass(frozen=True)
class ChannelInput:
    channel_id: str
    channel_type: str
    evidence: tuple[Mapping[str, Any], ...]


@dataclass(frozen=True)
class IntelligenceRunRequest:
    run_id: str
    subject_id: str
    brief_version: int
    evidence_snapshot_id: str
    subject_context: Mapping[str, Any]
    channels: tuple[ChannelInput, ...]
    methodology_version: str
    expertise_pack_version: str
    prompt_version: str
    model_config_hash: str
    output_schema_version: str = "1.0"
    score_dimensions: tuple[str, ...] = ()
    rejected_recommendation_ids: frozenset[str] = frozenset()


@dataclass(frozen=True)
class ChannelStage:
    cache_key: str
    analysis: Mapping[str, Any]


@dataclass(frozen=True)
class SynthesisStage:
    cache_key: str
    synthesis: Mapping[str, Any]


class StageStore(Protocol):
    def load_channel(self, run_id: str, channel_id: str) -> ChannelStage | None: ...
    def save_channel(self, run_id: str, channel_id: str, stage: ChannelStage) -> None: ...
    def load_synthesis(self, run_id: str) -> SynthesisStage | None: ...
    def save_synthesis(self, run_id: str, stage: SynthesisStage) -> None: ...


class AnalysisCache(Protocol):
    def get(self, key: str) -> Mapping[str, Any] | None: ...
    def put(self, key: str, value: Mapping[str, Any]) -> None: ...


class MemoryStageStore:
    """Thread-safe test/local store; production can implement the same durable protocol."""

    def __init__(self) -> None:
        self._channels: dict[tuple[str, str], ChannelStage] = {}
        self._synthesis: dict[str, SynthesisStage] = {}
        self._lock = threading.Lock()

    def load_channel(self, run_id: str, channel_id: str) -> ChannelStage | None:
        with self._lock:
            value = self._channels.get((run_id, channel_id))
            return deepcopy(value) if value is not None else None

    def save_channel(self, run_id: str, channel_id: str, stage: ChannelStage) -> None:
        with self._lock:
            self._channels[(run_id, channel_id)] = deepcopy(stage)

    def load_synthesis(self, run_id: str) -> SynthesisStage | None:
        with self._lock:
            value = self._synthesis.get(run_id)
            return deepcopy(value) if value is not None else None

    def save_synthesis(self, run_id: str, stage: SynthesisStage) -> None:
        with self._lock:
            self._synthesis[run_id] = deepcopy(stage)


class MemoryAnalysisCache:
    def __init__(self) -> None:
        self._values: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Mapping[str, Any] | None:
        with self._lock:
            value = self._values.get(key)
            return deepcopy(value) if value is not None else None

    def put(self, key: str, value: Mapping[str, Any]) -> None:
        with self._lock:
            self._values[key] = deepcopy(dict(value))


@dataclass
class RuntimeTelemetry:
    status: str = "succeeded"
    failure_code: str | None = None
    cache_mode: str = "fresh"
    channel_calls: int = 0
    synthesis_calls: int = 0
    correction_calls: int = 0
    tokens_in: int = 0
    tokens_out: int = 0
    cost_usd: float = 0.0
    evidence_items: int = 0
    stage_timings: dict[str, float] = field(default_factory=dict)
    model: str = "deepseek-v4-flash"
    provider: str = "deepseek"

    def add(self, response: ModelResponse) -> None:
        self.tokens_in += max(0, int(response.tokens_in))
        self.tokens_out += max(0, int(response.tokens_out))
        self.cost_usd = round(self.cost_usd + max(0.0, float(response.cost_usd)), 6)
        if response.correction_used:
            self.correction_calls += 1

    def to_dict(self) -> dict[str, Any]:
        """Return an operational allowlist with no subject/customer payload fields."""

        return {
            "status": self.status,
            "failure_code": self.failure_code,
            "cache_mode": self.cache_mode,
            "channel_calls": self.channel_calls,
            "synthesis_calls": self.synthesis_calls,
            "correction_calls": self.correction_calls,
            "tokens_in": self.tokens_in,
            "tokens_out": self.tokens_out,
            "cost_usd": self.cost_usd,
            "evidence_items": self.evidence_items,
            "stage_timings": {
                key: round(max(0.0, float(value)), 3)
                for key, value in self.stage_timings.items()
                if key in {"projection", "channel_analysis", "synthesis", "assembly"}
            },
            "model": self.model,
            "provider": self.provider,
        }


@dataclass(frozen=True)
class CompletedIntelligenceRun:
    result: Mapping[str, Any]
    telemetry: RuntimeTelemetry


def _normalized_failure(exc: BaseException) -> str:
    if isinstance(exc, TimeoutError):
        return "inference_timeout"
    if isinstance(exc, EvidenceValidationError):
        return "structured_output_invalid"
    if isinstance(exc, RuntimePolicyError):
        return "runtime_policy_violation"
    return "inference_failed"


def _validate_uuid(value: str, field_name: str) -> None:
    try:
        UUID(value)
    except (ValueError, TypeError, AttributeError) as exc:
        raise RuntimePolicyError(f"{field_name} must be a UUID") from exc


def _validate_channel_input(channel: ChannelInput, request: IntelligenceRunRequest) -> None:
    _validate_uuid(channel.channel_id, "channel_id")
    if channel.channel_type not in CHANNEL_TYPES:
        raise RuntimePolicyError(f"unsupported channel type: {channel.channel_type}")
    if not channel.evidence:
        raise RuntimePolicyError("every channel requires at least one evidence item")
    if len(channel.evidence) > 100:
        raise RuntimePolicyError("a channel may contain at most 100 evidence items")
    seen: set[str] = set()
    for item in channel.evidence:
        evidence_id = item.get("evidence_id")
        if (
            item.get("schema_version") != "1.0"
            or item.get("subject_id") != request.subject_id
            or item.get("channel_id") != channel.channel_id
            or not isinstance(evidence_id, str)
            or evidence_id in seen
            or not isinstance(item.get("content_hash"), str)
            or len(item["content_hash"]) < 16
        ):
            raise RuntimePolicyError("channel evidence does not match the run contract")
        seen.add(evidence_id)


def _cache_parts(
    request: IntelligenceRunRequest,
    channel: ChannelInput,
    policy: InferencePolicy,
) -> CacheKeyParts:
    return CacheKeyParts(
        subject_id=request.subject_id,
        channel_id=channel.channel_id,
        brief_version=request.brief_version,
        evidence_hashes=tuple(str(item["content_hash"]) for item in channel.evidence),
        methodology_version=request.methodology_version,
        expertise_pack_version=request.expertise_pack_version,
        prompt_version=request.prompt_version,
        model_provider=policy.provider,
        model_name=policy.model,
        model_config_hash=request.model_config_hash,
        output_schema_version=request.output_schema_version,
        projection_version=PROJECTION_VERSION,
    )


def _validate_synthesis(value: Mapping[str, Any], evidence_ids: set[str]) -> dict[str, Any]:
    allowed = {"findings", "recommendations", "change_explanations", "limitations"}
    if set(value) - allowed:
        raise EvidenceValidationError("synthesis contains unknown fields")
    result: dict[str, Any] = {}
    for key in allowed:
        rows = value.get(key, [])
        if not isinstance(rows, list):
            raise EvidenceValidationError(f"synthesis {key} must be an array")
        result[key] = deepcopy(rows)
    for finding in result["findings"]:
        if not isinstance(finding, Mapping):
            raise EvidenceValidationError("synthesis findings must be objects")
        refs = finding.get("evidence_ids")
        if not isinstance(refs, list) or not refs or not all(isinstance(item, str) for item in refs):
            raise EvidenceValidationError("synthesis findings require evidence IDs")
        unknown = set(refs) - evidence_ids
        if unknown:
            raise EvidenceValidationError("synthesis references unknown evidence ID")
    return result


def _scores(
    channel_results: list[Mapping[str, Any]],
    *,
    dimensions: tuple[str, ...],
    methodology_version: str,
) -> list[dict[str, Any]]:
    scores: list[dict[str, Any]] = []
    for dimension in dimensions:
        impacts: list[float] = []
        refs: set[str] = set()
        for channel in channel_results:
            for finding in channel.get("findings", []):
                impact = finding.get("dimension_impacts", {}).get(dimension)
                if isinstance(impact, (int, float)) and not isinstance(impact, bool):
                    impacts.append(float(impact))
                    refs.update(finding.get("evidence_ids", []))
        value = None
        if impacts:
            value = round(min(100.0, max(0.0, 50.0 + sum(impacts) / len(impacts))), 1)
        scores.append(
            {
                "dimension": dimension,
                "value": value,
                "evidence_ids": sorted(refs),
                "methodology_version": methodology_version,
            }
        )
    return scores


class BoundedIntelligenceRuntime:
    """Deterministic controller around stateless typed model calls."""

    def __init__(
        self,
        *,
        model: IntelligenceModel,
        policy: InferencePolicy | None = None,
        stage_store: StageStore | None = None,
        analysis_cache: AnalysisCache | None = None,
        max_channel_workers: int = 3,
        telemetry_sink: Callable[[Mapping[str, Any]], None] | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if max_channel_workers < 1 or max_channel_workers > 3:
            raise RuntimePolicyError("channel concurrency must be between one and three")
        self.model = model
        self.policy = policy or InferencePolicy()
        self.stage_store = stage_store or MemoryStageStore()
        self.analysis_cache = analysis_cache or MemoryAnalysisCache()
        self.max_channel_workers = max_channel_workers
        self.telemetry_sink = telemetry_sink
        self.clock = clock

    def run(self, request: IntelligenceRunRequest) -> CompletedIntelligenceRun:
        telemetry = RuntimeTelemetry(model=self.policy.model, provider=self.policy.provider)
        telemetry.evidence_items = sum(len(channel.evidence) for channel in request.channels)
        attempt_started = self.clock()
        try:
            return self._run(request, telemetry)
        except Exception as exc:
            telemetry.status = "failed"
            telemetry.failure_code = _normalized_failure(exc)
            elapsed = max(0.0, self.clock() - attempt_started)
            if "projection" not in telemetry.stage_timings:
                telemetry.stage_timings["projection"] = elapsed
            elif "channel_analysis" not in telemetry.stage_timings:
                telemetry.stage_timings["channel_analysis"] = max(
                    0.0, elapsed - telemetry.stage_timings["projection"]
                )
            elif len(request.channels) > 1 and "synthesis" not in telemetry.stage_timings:
                telemetry.stage_timings["synthesis"] = max(
                    0.0, elapsed - sum(telemetry.stage_timings.values())
                )
            if self.telemetry_sink is not None:
                self.telemetry_sink(telemetry.to_dict())
            raise

    def _run(
        self, request: IntelligenceRunRequest, telemetry: RuntimeTelemetry
    ) -> CompletedIntelligenceRun:
        _validate_uuid(request.subject_id, "subject_id")
        _validate_uuid(request.evidence_snapshot_id, "evidence_snapshot_id")
        if request.brief_version < 1:
            raise RuntimePolicyError("brief_version must be positive")
        if not request.channels or len(request.channels) > 3:
            raise RuntimePolicyError("a run supports at most three channels and at least one")
        if request.output_schema_version != "1.0":
            raise RuntimePolicyError("unsupported intelligence result schema version")
        channel_ids = [channel.channel_id for channel in request.channels]
        if len(set(channel_ids)) != len(channel_ids):
            raise RuntimePolicyError("channel IDs must be unique")
        for channel in request.channels:
            _validate_channel_input(channel, request)

        started = self.clock()
        projection = project_subject_context(
            request.subject_context, channel_ids=channel_ids
        )
        if (
            projection.get("subject_id") != request.subject_id
            or projection.get("version") != request.brief_version
        ):
            raise RuntimePolicyError("subject context does not match pinned run version")
        projected_channels = {
            row.get("channel_id"): row.get("channel_type")
            for row in projection.get("channels", [])
            if isinstance(row, Mapping)
        }
        expected_channels = {
            channel.channel_id: channel.channel_type for channel in request.channels
        }
        if projected_channels != expected_channels:
            raise RuntimePolicyError("subject context channels do not match run channels")
        telemetry.stage_timings["projection"] = self.clock() - started

        loaded_from_stage = False
        loaded_from_cache = False
        results: dict[str, Mapping[str, Any]] = {}
        channel_cache_keys: dict[str, str] = {}
        pending: list[tuple[ChannelInput, str]] = []
        for channel in request.channels:
            cache_key = build_analysis_cache_key(_cache_parts(request, channel, self.policy))
            channel_cache_keys[channel.channel_id] = cache_key
            stage = self.stage_store.load_channel(request.run_id, channel.channel_id)
            if stage is not None and stage.cache_key == cache_key:
                results[channel.channel_id] = stage.analysis
                loaded_from_stage = True
                continue
            cached = self.analysis_cache.get(cache_key)
            if cached is not None:
                validated = validate_channel_analysis(
                    cached,
                    evidence_ids={str(item["evidence_id"]) for item in channel.evidence},
                    expected_channel_type=channel.channel_type,
                )
                results[channel.channel_id] = validated
                self.stage_store.save_channel(
                    request.run_id,
                    channel.channel_id,
                    ChannelStage(cache_key=cache_key, analysis=validated),
                )
                loaded_from_cache = True
                continue
            pending.append((channel, cache_key))

        telemetry.cache_mode = (
            "resume" if loaded_from_stage else "reused" if loaded_from_cache else "fresh"
        )
        analysis_started = self.clock()
        if pending:
            with ThreadPoolExecutor(
                max_workers=min(self.max_channel_workers, len(pending)),
                thread_name_prefix="intelligence-channel",
            ) as pool:
                futures: dict[
                    Future[ModelResponse], tuple[ChannelInput, str, dict[str, Any]]
                ] = {}
                for channel, cache_key in pending:
                    payload = {
                        "schema_version": "1.0",
                        "subject_context": projection,
                        "methodology_version": request.methodology_version,
                        "expertise_pack_version": request.expertise_pack_version,
                        "channel": {
                            "channel_id": channel.channel_id,
                            "channel_type": channel.channel_type,
                            "evidence": deepcopy(list(channel.evidence)),
                        },
                    }
                    if len(canonical_json(payload).encode("utf-8")) > 200_000:
                        raise RuntimePolicyError("channel inference projection exceeds 200000 bytes")
                    futures[pool.submit(
                        self.model.analyze_channel, payload, policy=self.policy
                    )] = (channel, cache_key, payload)
                failures: list[Exception] = []
                for future in as_completed(futures):
                    channel, cache_key, original_payload = futures[future]
                    try:
                        response = future.result()
                        telemetry.channel_calls += 1
                        telemetry.add(response)
                        evidence_ids = {
                            str(item["evidence_id"]) for item in channel.evidence
                        }
                        try:
                            validated = validate_channel_analysis(
                                response.payload,
                                evidence_ids=evidence_ids,
                                expected_channel_type=channel.channel_type,
                            )
                        except EvidenceValidationError as exc:
                            correct = getattr(self.model, "correct_channel", None)
                            if not callable(correct):
                                raise
                            correction = correct(
                                original_payload,
                                invalid_payload=response.payload,
                                error=str(exc),
                                policy=self.policy,
                            )
                            telemetry.add(correction)
                            validated = validate_channel_analysis(
                                correction.payload,
                                evidence_ids=evidence_ids,
                                expected_channel_type=channel.channel_type,
                            )
                        stage = ChannelStage(cache_key=cache_key, analysis=validated)
                        # Persist every independently successful channel before
                        # propagating a sibling failure.
                        self.stage_store.save_channel(
                            request.run_id, channel.channel_id, stage
                        )
                        self.analysis_cache.put(cache_key, validated)
                        results[channel.channel_id] = validated
                    except Exception as exc:  # retain first bounded stage error
                        failures.append(exc)
                if failures:
                    raise failures[0]
        telemetry.stage_timings["channel_analysis"] = self.clock() - analysis_started

        ordered = [results[channel.channel_id] for channel in request.channels]
        all_evidence_ids = {
            str(item["evidence_id"])
            for channel in request.channels
            for item in channel.evidence
        }
        synthesis: Mapping[str, Any] | None = None
        if len(ordered) > 1:
            synthesis_started = self.clock()
            synthesis_key = hashlib.sha256(
                canonical_json(
                    {
                        "channel_cache_keys": [
                            channel_cache_keys[channel.channel_id]
                            for channel in request.channels
                        ],
                        "output_schema_version": request.output_schema_version,
                        "model": self.policy.model,
                        "model_config_hash": request.model_config_hash,
                    }
                ).encode("utf-8")
            ).hexdigest()
            synthesis_stage = self.stage_store.load_synthesis(request.run_id)
            synthesis = (
                synthesis_stage.synthesis
                if synthesis_stage is not None
                and synthesis_stage.cache_key == synthesis_key
                else None
            )
            if synthesis is None:
                synthesis_payload = {
                    "schema_version": "1.0",
                    "subject_context": projection,
                    "channel_results": deepcopy(ordered),
                    "instruction": "Synthesize cross-channel deltas only; do not rescore facts.",
                }
                response = self.model.synthesize(
                    synthesis_payload, policy=self.policy
                )
                telemetry.synthesis_calls += 1
                telemetry.add(response)
                try:
                    synthesis = _validate_synthesis(response.payload, all_evidence_ids)
                except EvidenceValidationError as exc:
                    correct = getattr(self.model, "correct_synthesis", None)
                    if not callable(correct):
                        raise
                    correction = correct(
                        synthesis_payload,
                        invalid_payload=response.payload,
                        error=str(exc),
                        policy=self.policy,
                    )
                    telemetry.add(correction)
                    synthesis = _validate_synthesis(
                        correction.payload, all_evidence_ids
                    )
                self.stage_store.save_synthesis(
                    request.run_id,
                    SynthesisStage(cache_key=synthesis_key, synthesis=synthesis),
                )
            else:
                synthesis = _validate_synthesis(synthesis, all_evidence_ids)
            telemetry.stage_timings["synthesis"] = self.clock() - synthesis_started

        assembly_started = self.clock()
        channel_findings = [
            deepcopy(finding)
            for channel in ordered
            for finding in channel.get("findings", [])
        ]
        channel_recommendations = [
            deepcopy(recommendation)
            for channel in ordered
            for recommendation in channel.get("recommendations", [])
        ]
        findings = (
            deepcopy(synthesis["findings"])
            if synthesis is not None and synthesis.get("findings")
            else channel_findings
        )
        recommendations = (
            deepcopy(synthesis["recommendations"])
            if synthesis is not None and synthesis.get("recommendations")
            else channel_recommendations
        )
        recommendations = [
            item
            for item in recommendations
            if not isinstance(item, Mapping)
            or item.get("id") not in request.rejected_recommendation_ids
        ]
        limitations = sorted(
            {
                str(item)
                for channel in ordered
                for item in channel.get("limitations", [])
            }
            | {
                str(item)
                for item in (synthesis.get("limitations", []) if synthesis is not None else [])
            }
        )
        change_explanations = (
            deepcopy(synthesis["change_explanations"])
            if synthesis is not None
            else [{"cause": "evidence", "detail": "Channel evidence was analyzed."}]
        )
        result = {
            "schema_version": "1.0",
            "subject_id": request.subject_id,
            "brief_version": request.brief_version,
            "evidence_snapshot_id": request.evidence_snapshot_id,
            "channel_results": deepcopy(ordered),
            "scores": _scores(
                ordered,
                dimensions=request.score_dimensions,
                methodology_version=request.methodology_version,
            ),
            "findings": findings,
            "recommendations": recommendations,
            "change_explanations": change_explanations,
            "limitations": limitations,
        }
        telemetry.stage_timings["assembly"] = self.clock() - assembly_started
        if self.telemetry_sink is not None:
            self.telemetry_sink(telemetry.to_dict())
        return CompletedIntelligenceRun(result=result, telemetry=telemetry)
