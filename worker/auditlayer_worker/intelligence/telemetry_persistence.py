"""Typed ownership/projection contract between runtime telemetry and the two
authoritative persistence records.

``intelligence_runs`` is subject-domain run truth (finalized through the
``finalize_intelligence_run`` RPC); ``report_generation_runs`` is private
report-attempt telemetry (finished through ``finish_report_generation_run``).

Each allowlisted ``RuntimeTelemetry`` field has exactly one authoritative owner
record or is explicitly UNSUPPORTED with a correction tip. Nothing is silently
dropped, double-written, or fabricated; the report-attempt status vocabulary and
the intelligence-run status vocabulary remain distinct and are normalized at
this single canonical boundary.

Fixtures that exercise this contract prove mapping, parity, redaction, and
failure semantics only — never live persistence, provider cancellation,
latency, cost, or customer outcome.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import Enum
from typing import Any
from uuid import UUID

from .runtime import RuntimeTelemetry


class TelemetryPersistenceError(ValueError):
    """A telemetry projection violates the persistence ownership contract."""


class TelemetryOwner(str, Enum):
    INTELLIGENCE_RUN = "intelligence_run"
    REPORT_GENERATION_RUN = "report_generation_run"
    UNSUPPORTED = "unsupported"


# -- authoritative vocabularies ---------------------------------------------

# finalize_intelligence_run / intelligence_runs.status CHECK.
INTELLIGENCE_RUN_STATUS_VOCABULARY = ("running", "completed", "failed")
# report_generation_runs.status CHECK.
REPORT_RUN_STATUS_VOCABULARY = (
    "running",
    "ready",
    "needs_review",
    "failed",
    "blocked",
    "crashed",
)
# RuntimeTelemetry.status → intelligence_runs.status (deterministic boundary).
RUNTIME_STATUS_TO_INTELLIGENCE = {
    "succeeded": "completed",
    "failed": "failed",
    "running": "running",
}
# RuntimeTelemetry.status → report_generation_runs.status (distinct vocabulary).
RUNTIME_STATUS_TO_REPORT = {
    "succeeded": "ready",
    "failed": "failed",
    "running": "running",
}
# report_generation_runs.cache_mode CHECK; the runtime emits the same set.
CACHE_MODE_VOCABULARY = ("fresh", "reused", "resume")
# report_generation_runs.stage_timings whitelist (report-attempt stages only).
REPORT_STAGE_WHITELIST = (
    "research",
    "connected_metrics",
    "analysis",
    "validation",
    "format_correction",
    "postprocess",
)
# BoundedIntelligenceRuntime stage-timing keys (never persistable as report
# attempt stages; their aggregate latency is what flows to run records).
RUNTIME_STAGE_KEYS = ("projection", "channel_analysis", "synthesis", "assembly")


@dataclass(frozen=True)
class FieldOwnership:
    """One allowlisted telemetry field and its single authoritative owner."""

    field: str
    owner: TelemetryOwner
    note: str


@dataclass(frozen=True)
class UnsupportedField:
    """A telemetry field a record cannot persist, with the exact missing owner."""

    field: str
    record: str
    correction_tip: str


# Ordered exactly like ``RuntimeTelemetry.to_dict()`` so adapter/schema drift is
# detectable: a new allowlist field must be added here or the contract test fails.
TELEMETRY_FIELD_OWNERSHIP: tuple[FieldOwnership, ...] = (
    FieldOwnership(
        "status",
        TelemetryOwner.INTELLIGENCE_RUN,
        "subject-run truth; report attempts keep a distinct status vocabulary derived from the report pipeline",
    ),
    FieldOwnership(
        "failure_code",
        TelemetryOwner.REPORT_GENERATION_RUN,
        "report_generation_runs.error_code is the only error column; intelligence_runs has no failure-code column",
    ),
    FieldOwnership(
        "cache_mode",
        TelemetryOwner.INTELLIGENCE_RUN,
        "run cache behavior is subject-run truth; report cache_mode is set at start_report_generation_run from report-pipeline accounting",
    ),
    FieldOwnership(
        "channel_calls",
        TelemetryOwner.UNSUPPORTED,
        "no channel_calls column in intelligence_runs or report_generation_runs",
    ),
    FieldOwnership(
        "synthesis_calls",
        TelemetryOwner.UNSUPPORTED,
        "no synthesis_calls column in either record",
    ),
    FieldOwnership(
        "correction_calls",
        TelemetryOwner.UNSUPPORTED,
        "no correction_calls column in either record",
    ),
    FieldOwnership(
        "tokens_in",
        TelemetryOwner.INTELLIGENCE_RUN,
        "subject-run truth; report attempts record their own report-pipeline token totals",
    ),
    FieldOwnership(
        "tokens_out",
        TelemetryOwner.INTELLIGENCE_RUN,
        "subject-run truth; report attempts record their own report-pipeline token totals",
    ),
    FieldOwnership(
        "cost_usd",
        TelemetryOwner.INTELLIGENCE_RUN,
        "subject-run truth; report attempts record their own report-pipeline cost",
    ),
    FieldOwnership(
        "evidence_items",
        TelemetryOwner.REPORT_GENERATION_RUN,
        "report_generation_runs.evidence_items is the only evidence-count column",
    ),
    FieldOwnership(
        "stage_timings",
        TelemetryOwner.REPORT_GENERATION_RUN,
        "report_generation_runs.stage_timings persists report-stage keys only; runtime stage keys are not representable and their aggregate latency flows to intelligence_runs.latency_ms",
    ),
    FieldOwnership(
        "model",
        TelemetryOwner.UNSUPPORTED,
        "model is start-time identity (report_generation_runs.model / intelligence_runs model_config_hash); no finalize column",
    ),
    FieldOwnership(
        "provider",
        TelemetryOwner.UNSUPPORTED,
        "no provider column in either record; provider policy is fixed to deepseek by InferencePolicy",
    ),
    FieldOwnership(
        "deadline_seconds",
        TelemetryOwner.UNSUPPORTED,
        "no deadline column in either record; persisting it would require stage_state/RPC authority",
    ),
    FieldOwnership(
        "deadline_exceeded",
        TelemetryOwner.UNSUPPORTED,
        "no deadline column in either record; persisting it would require stage_state/RPC authority",
    ),
    FieldOwnership(
        "queued_cancelled",
        TelemetryOwner.UNSUPPORTED,
        "no queued-cancellation count column in either record; containment counts are runtime telemetry only, persisting them would require stage_state/RPC authority",
    ),
    FieldOwnership(
        "inflight_unknown",
        TelemetryOwner.UNSUPPORTED,
        "no in-flight-unknown count column in either record; honest UNKNOWN classification stays runtime telemetry, persisting it would require stage_state/RPC authority",
    ),
    FieldOwnership(
        "cancellation_tip",
        TelemetryOwner.UNSUPPORTED,
        "no cancellation-tip column in either record; the non-secret guidance string is runtime telemetry only, persisting it would require stage_state/RPC authority",
    ),
)

TELEMETRY_ALLOWLIST: tuple[str, ...] = tuple(
    ownership.field for ownership in TELEMETRY_FIELD_OWNERSHIP
)


def field_ownership_matrix() -> tuple[FieldOwnership, ...]:
    """Return the ordered ownership matrix (stable, inspectable)."""
    return TELEMETRY_FIELD_OWNERSHIP


@dataclass(frozen=True)
class IntelligenceRunProjection:
    """Deterministic finalize_intelligence_run payload for one telemetry event."""

    payload: dict[str, Any]
    supported_fields: tuple[str, ...]
    unsupported_fields: tuple[UnsupportedField, ...]
    null_origin_fields: tuple[str, ...]


@dataclass(frozen=True)
class ReportAttemptProjection:
    """Deterministic finish_report_generation_run payload for one telemetry event.

    Only telemetry fields owned by the report attempt are written; run-scoped
    fields (tokens, cost, cache_mode, deadline) are never double-written here.
    ``compat_normalized_fields`` names the fields both records persist (status)
    whose vocabularies this boundary keeps distinct.
    """

    payload: dict[str, Any]
    supported_fields: tuple[str, ...]
    unsupported_fields: tuple[UnsupportedField, ...]
    null_origin_fields: tuple[str, ...]
    compat_normalized_fields: tuple[str, ...] = ("status",)


@dataclass(frozen=True)
class TelemetryProjection:
    """Both record projections plus the union unsupported matrix."""

    intelligence_run: IntelligenceRunProjection
    report_attempt: ReportAttemptProjection
    unsupported_fields: tuple[UnsupportedField, ...]
    source_fields: tuple[str, ...]
    redacted: bool = True


def _validate_uuid(value: str, field_name: str) -> str:
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError) as exc:
        raise TelemetryPersistenceError(f"{field_name} must be a UUID") from exc


def _as_allowlist(
    telemetry: RuntimeTelemetry | Mapping[str, Any],
) -> dict[str, Any]:
    """Coerce input to an allowlist-only dict; unknown keys fail closed."""
    if isinstance(telemetry, RuntimeTelemetry):
        return dict(telemetry.to_dict())
    if isinstance(telemetry, Mapping):
        data = dict(telemetry)
        unknown = set(data) - set(TELEMETRY_ALLOWLIST)
        if unknown:
            raise TelemetryPersistenceError(
                f"non-allowlisted telemetry fields: {sorted(unknown)}"
            )
        return data
    raise TelemetryPersistenceError(
        "telemetry must be RuntimeTelemetry or a mapping of allowlisted fields"
    )


def _derive_status(
    data: Mapping[str, Any],
    mapping: Mapping[str, str],
    *,
    record: str,
) -> str:
    raw = data.get("status")
    if not isinstance(raw, str) or raw not in mapping:
        raise TelemetryPersistenceError(
            f"runtime status {raw!r} cannot be normalized for {record}"
        )
    return mapping[raw]


def normalize_intelligence_status(status: str | None, telemetry: Mapping[str, Any]) -> str:
    """Normalize a runtime telemetry status to the intelligence-run vocabulary."""
    if status is not None:
        if status not in INTELLIGENCE_RUN_STATUS_VOCABULARY:
            raise TelemetryPersistenceError(
                f"invalid intelligence run status: {status!r}"
            )
        return status
    return _derive_status(telemetry, RUNTIME_STATUS_TO_INTELLIGENCE, record="intelligence_run")


def normalize_report_status(status: str | None, telemetry: Mapping[str, Any]) -> str:
    """Normalize a runtime telemetry status to the report-attempt vocabulary."""
    if status is not None:
        if status not in REPORT_RUN_STATUS_VOCABULARY:
            raise TelemetryPersistenceError(f"invalid report run status: {status!r}")
        return status
    return _derive_status(telemetry, RUNTIME_STATUS_TO_REPORT, record="report_generation_run")


def normalize_cache_mode(value: Any) -> str | None:
    """Validate a cache mode against the shared fresh|reused|resume vocabulary.

    ``None`` is preserved (honest null); an unknown value fails closed rather
    than persisting a value the report CHECK constraint would reject.
    """
    if value is None:
        return None
    if value not in CACHE_MODE_VOCABULARY:
        raise TelemetryPersistenceError(
            f"invalid cache_mode {value!r}; expected one of {CACHE_MODE_VOCABULARY}"
        )
    return value


def normalize_error_code(failure_code: Any) -> str | None:
    """Map runtime failure_code to report error_code (report CHECK <= 120 chars)."""
    if failure_code is None:
        return None
    value = " ".join(str(failure_code).split())
    return value[:120] or None


def normalize_latency_ms(stage_timings: Any, latency_ms: int | None) -> int:
    """Aggregate stage timings into intelligence latency_ms when not supplied."""
    if latency_ms is not None:
        return max(0, int(latency_ms))
    timings = stage_timings if isinstance(stage_timings, Mapping) else {}
    total = sum(max(0.0, float(value)) for value in timings.values())
    return max(0, int(round(total * 1000)))


def normalize_total_seconds(stage_timings: Any, total_seconds: float | None) -> float:
    """Report-attempt total seconds; derived from stage timings when not supplied."""
    if total_seconds is not None:
        return round(max(0.0, float(total_seconds)), 3)
    timings = stage_timings if isinstance(stage_timings, Mapping) else {}
    total = sum(max(0.0, float(value)) for value in timings.values())
    return round(max(0.0, total), 3)


def _int_or_zero(value: Any) -> int:
    if value is None:
        return 0
    return max(0, int(value))


def _cost(value: Any) -> float:
    if value is None:
        return 0.0
    return round(max(0.0, float(value)), 6)


def _unsupported_for(
    data: Mapping[str, Any],
    *,
    record: str,
    owner_filter: set[TelemetryOwner],
    exclude: frozenset[str] = frozenset(),
) -> tuple[UnsupportedField, ...]:
    """Fields in the allowlist this record cannot persist, in matrix order.

    ``exclude`` names fields the record does persist in its payload (including
    vocabulary-compat projections such as report status), so they never appear
    as both supported and unsupported.
    """
    result: list[UnsupportedField] = []
    for ownership in TELEMETRY_FIELD_OWNERSHIP:
        if ownership.owner not in owner_filter:
            continue
        if ownership.field in exclude:
            continue
        tip = ownership.note
        result.append(
            UnsupportedField(
                field=ownership.field,
                record=record,
                correction_tip=(
                    f"field {ownership.field} is not persistable on {record}: {tip}"
                ),
            )
        )
    # Runtime stage-timing keys are never report stages; surface each explicitly
    # so they cannot be silently dropped by the report adapter's whitelist.
    if record == "report_generation_run":
        timings = data.get("stage_timings")
        if isinstance(timings, Mapping):
            for key in RUNTIME_STAGE_KEYS:
                if key in timings:
                    result.append(
                        UnsupportedField(
                            field=f"stage_timings.{key}",
                            record=record,
                            correction_tip=(
                                f"runtime stage key {key!r} is not in the report "
                                f"stage whitelist {REPORT_STAGE_WHITELIST}; only the "
                                "aggregate latency projects (to total_seconds)"
                            ),
                        )
                    )
    return tuple(result)


def _report_stage_timings(stage_timings: Any) -> dict[str, float]:
    if not isinstance(stage_timings, Mapping):
        return {}
    return {
        key: round(max(0.0, float(value)), 3)
        for key, value in stage_timings.items()
        if key in REPORT_STAGE_WHITELIST
    }


def project_intelligence_run(
    telemetry: RuntimeTelemetry | Mapping[str, Any],
    *,
    run_id: str,
    status: str | None = None,
    latency_ms: int | None = None,
) -> IntelligenceRunProjection:
    """Project one telemetry event onto the intelligence_runs record.

    The returned payload is exactly the ``finalize_intelligence_run`` RPC
    argument shape; unsupported fields are inspectable, never silently dropped.
    """
    run = _validate_uuid(run_id, "run_id")
    data = _as_allowlist(telemetry)
    normalized_status = normalize_intelligence_status(status, data)
    cache_mode = normalize_cache_mode(data.get("cache_mode"))
    tokens_in = _int_or_zero(data.get("tokens_in"))
    tokens_out = _int_or_zero(data.get("tokens_out"))
    cost_usd = _cost(data.get("cost_usd"))
    latency = normalize_latency_ms(data.get("stage_timings"), latency_ms)

    payload = {
        "p_run_id": run,
        "p_status": normalized_status,
        "p_latency_ms": latency,
        "p_tokens_in": tokens_in,
        "p_tokens_out": tokens_out,
        "p_cost_usd": cost_usd,
        "p_cache_mode": cache_mode,
    }
    supported = ("status", "cache_mode", "tokens_in", "tokens_out", "cost_usd")
    unsupported = _unsupported_for(
        data,
        record="intelligence_run",
        owner_filter={
            TelemetryOwner.REPORT_GENERATION_RUN,
            TelemetryOwner.UNSUPPORTED,
        },
    )
    null_origin: tuple[str, ...] = tuple(
        field
        for field in supported
        if data.get(field) is None
    )
    return IntelligenceRunProjection(
        payload=payload,
        supported_fields=supported,
        unsupported_fields=unsupported,
        null_origin_fields=null_origin,
    )


def project_report_attempt(
    telemetry: RuntimeTelemetry | Mapping[str, Any],
    *,
    status: str | None = None,
    total_seconds: float | None = None,
) -> ReportAttemptProjection:
    """Project one telemetry event onto a report_generation_runs attempt.

    Only telemetry fields owned by the attempt are written: status (report
    vocabulary), failure_code → error_code, evidence_items, and report-stage
    timings. Run-scoped fields (tokens, cost, cache_mode) are guarded against
    double-writing and surfaced as unsupported with their exact owner.
    """
    data = _as_allowlist(telemetry)
    normalized_status = normalize_report_status(status, data)
    total = normalize_total_seconds(data.get("stage_timings"), total_seconds)
    stage_timings = _report_stage_timings(data.get("stage_timings"))
    evidence_items = _int_or_zero(data.get("evidence_items"))
    error_code = normalize_error_code(data.get("failure_code"))

    payload = {
        "status": normalized_status,
        "total_seconds": total,
        "stage_timings": stage_timings,
        "evidence_items": evidence_items,
        "error_code": error_code,
    }
    supported = ("status", "failure_code", "evidence_items", "stage_timings")
    unsupported = _unsupported_for(
        data,
        record="report_generation_run",
        owner_filter={
            TelemetryOwner.INTELLIGENCE_RUN,
            TelemetryOwner.UNSUPPORTED,
        },
        exclude=frozenset({"status"}),  # compat-normalized into the report payload
    )
    null_origin: tuple[str, ...] = tuple(
        field
        for field in supported
        if data.get(field) is None
    )
    return ReportAttemptProjection(
        payload=payload,
        supported_fields=supported,
        unsupported_fields=unsupported,
        null_origin_fields=null_origin,
    )


def project_telemetry(
    telemetry: RuntimeTelemetry | Mapping[str, Any],
    *,
    run_id: str | None = None,
    status: str | None = None,
    latency_ms: int | None = None,
    total_seconds: float | None = None,
) -> TelemetryProjection:
    """Project one telemetry event onto both authoritative records.

    The intelligence projection requires ``run_id``; the report projection is
    context-free (the caller supplies the attempt row via the adapter).
    """
    data = _as_allowlist(telemetry)
    if run_id is None:
        raise TelemetryPersistenceError("run_id is required to project an intelligence run")
    intelligence = project_intelligence_run(
        data, run_id=run_id, status=status, latency_ms=latency_ms
    )
    report = project_report_attempt(data, status=status, total_seconds=total_seconds)
    seen: set[tuple[str, str]] = set()
    union: list[UnsupportedField] = []
    for item in (*intelligence.unsupported_fields, *report.unsupported_fields):
        identity = (item.field, item.record)
        if identity not in seen:
            seen.add(identity)
            union.append(item)
    return TelemetryProjection(
        intelligence_run=intelligence,
        report_attempt=report,
        unsupported_fields=tuple(union),
        source_fields=tuple(sorted(data)),
        redacted=True,
    )
