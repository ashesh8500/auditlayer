"""Evidence-coverage contract for the six customer answers.

P1 · C1/C2 · D3: every material metric, finding, score rationale, comparison,
and recommendation in a final-answer payload must walk to a known evidence ID
whose record exposes observed_at, freshness/expiry, confidence, and limitation
metadata. Unknown or missing references fail closed. An unavailable answer is
representable only as an explicit ``Data needed`` limitation, never zero or
fabricated precision.

This module is a deterministic, typed validator over the six customer-answer
payload categories:

- ``current_state``      — Where you're at
- ``blockers``           — What's holding you back
- ``better_peers``       — Who's doing it better
- ``next_week_actions``  — What to post next week
- ``milestone_path``     — When you hit the next milestone
- ``money_move``         — The money move

The validator is a software contract. Passing fixtures prove the contract, not
creator efficacy or report calibration.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Mapping
from uuid import UUID

from .evidence import EvidenceValidationError

ANSWER_COVERAGE_SCHEMA_VERSION = "1.0"

# Canonical ordered list of the six customer answers.
ANSWER_KINDS: tuple[str, ...] = (
    "current_state",
    "blockers",
    "better_peers",
    "next_week_actions",
    "milestone_path",
    "money_move",
)

ANSWER_KIND_LABELS: dict[str, str] = {
    "current_state": "Where you're at",
    "blockers": "What's holding you back",
    "better_peers": "Who's doing it better",
    "next_week_actions": "What to post next week",
    "milestone_path": "When you hit the next milestone",
    "money_move": "The money move",
}

CLAIM_KINDS = frozenset(
    {"metric", "finding", "score_rationale", "comparison", "recommendation"}
)
ANSWER_STATES = frozenset({"answered", "data_needed"})
EVIDENCE_CONFIDENCE_LEVELS = frozenset({"low", "medium", "high", "authoritative"})
DATA_NEEDED_MARKER = "Data needed"

_ALLOWED_ANSWER_FIELDS = frozenset(
    {
        "answer_kind",
        "state",
        "headline",
        "summary",
        "claims",
        "limitations",
    }
)
_ALLOWED_CLAIM_FIELDS = frozenset(
    {
        "claim_kind",
        "statement",
        "evidence_ids",
        "value",
        "unit",
        "score_dimension",
        "peer_reference",
        "horizon",
    }
)
_ALLOWED_EVIDENCE_RECORD_FIELDS = frozenset(
    {
        "evidence_id",
        "observed_at",
        "expires_at",
        "confidence",
        "limitations",
        "source_type",
        "source_url",
        "content_hash",
        "payload",
        "coverage",
    }
)


def _uuid(value: Any, field: str) -> str:
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError) as exc:
        raise EvidenceValidationError(f"{field} must be a UUID") from exc


def _timestamp(value: Any, field: str, *, allow_none: bool = False) -> str | None:
    if value is None and allow_none:
        return None
    if isinstance(value, str):
        raw = value.replace("Z", "+00:00")
        try:
            value = datetime.fromisoformat(raw)
        except ValueError as exc:
            raise EvidenceValidationError(f"{field} must be an ISO-8601 timestamp") from exc
    if not isinstance(value, datetime):
        raise EvidenceValidationError(f"{field} must be an ISO-8601 timestamp")
    if value.tzinfo is None:
        raise EvidenceValidationError(f"{field} must include a timezone")
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _string_list(value: Any, field: str, *, max_items: int | None = None) -> list[str]:
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise EvidenceValidationError(f"{field} must be an array of strings")
    if max_items is not None and len(value) > max_items:
        raise EvidenceValidationError(f"{field} exceeds {max_items} items")
    return list(value)


def _number(value: Any, field: str, *, required: bool = True) -> float | None:
    if value is None and not required:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise EvidenceValidationError(f"{field} must be a finite number")
    number = float(value)
    if number != number or number in (float("inf"), float("-inf")):
        raise EvidenceValidationError(f"{field} must be a finite number")
    return number


# ---------------------------------------------------------------------------
# Evidence registry records
# ---------------------------------------------------------------------------


def validate_evidence_record(value: Mapping[str, Any], *, evidence_id: str) -> dict[str, Any]:
    """Validate one evidence registry record exposes complete provenance.

    Complete provenance = observed_at + freshness/expiry (expires_at) +
    confidence + limitation metadata. ``expires_at`` may be null when the
    evidence is observation-typed and has no declared expiry; everything else
    must be present and typed.
    """

    unknown = set(value) - _ALLOWED_EVIDENCE_RECORD_FIELDS
    if unknown:
        raise EvidenceValidationError(
            f"evidence record {evidence_id} has unknown field: {sorted(unknown)[0]}"
        )
    record_id = value.get("evidence_id")
    if record_id != evidence_id:
        raise EvidenceValidationError(
            f"evidence record key {evidence_id} must match its evidence_id"
        )
    observed_at = _timestamp(value.get("observed_at"), f"evidence {evidence_id} observed_at")
    if observed_at is None:
        raise EvidenceValidationError(f"evidence {evidence_id} observed_at is required")
    expires_at = _timestamp(
        value.get("expires_at"), f"evidence {evidence_id} expires_at", allow_none=True
    )
    if expires_at is not None and expires_at <= observed_at:
        raise EvidenceValidationError(
            f"evidence {evidence_id} expires_at must be after observed_at"
        )
    confidence = value.get("confidence")
    if confidence not in EVIDENCE_CONFIDENCE_LEVELS:
        raise EvidenceValidationError(f"evidence {evidence_id} confidence is invalid")
    limitations = _string_list(
        value.get("limitations"), f"evidence {evidence_id} limitations"
    )
    source_type = value.get("source_type")
    if source_type is not None and not isinstance(source_type, str):
        raise EvidenceValidationError(f"evidence {evidence_id} source_type is invalid")
    source_url = value.get("source_url")
    if source_url is not None and not isinstance(source_url, str):
        raise EvidenceValidationError(f"evidence {evidence_id} source_url is invalid")
    content_hash = value.get("content_hash")
    if content_hash is not None and (not isinstance(content_hash, str) or len(content_hash) < 16):
        raise EvidenceValidationError(f"evidence {evidence_id} content_hash is invalid")
    return {
        "evidence_id": evidence_id,
        "observed_at": observed_at,
        "expires_at": expires_at,
        "confidence": confidence,
        "limitations": limitations,
        "source_type": source_type,
        "source_url": source_url,
        "content_hash": content_hash,
    }


def validate_evidence_registry(
    value: Mapping[str, Any],
) -> dict[str, dict[str, Any]]:
    """Validate the whole evidence registry; every record must be walkable."""

    if not isinstance(value, Mapping):
        raise EvidenceValidationError("evidence registry must be an object")
    registry: dict[str, dict[str, Any]] = {}
    for evidence_id, record in value.items():
        if not isinstance(evidence_id, str) or not evidence_id.strip():
            raise EvidenceValidationError("evidence ids must be non-empty strings")
        if not isinstance(record, Mapping):
            raise EvidenceValidationError(f"evidence record {evidence_id} must be an object")
        registry[evidence_id] = validate_evidence_record(record, evidence_id=evidence_id)
    return registry


# ---------------------------------------------------------------------------
# Claims
# ---------------------------------------------------------------------------


def _validate_claim(
    value: Mapping[str, Any],
    *,
    answer_kind: str,
    index: int,
    registry: Mapping[str, dict[str, Any]],
) -> dict[str, Any]:
    field = f"answers[{answer_kind}].claims[{index}]"
    unknown = set(value) - _ALLOWED_CLAIM_FIELDS
    if unknown:
        raise EvidenceValidationError(f"{field} has unknown field: {sorted(unknown)[0]}")
    claim_kind = value.get("claim_kind")
    if claim_kind not in CLAIM_KINDS:
        raise EvidenceValidationError(f"{field}.claim_kind is invalid")
    statement = value.get("statement")
    if not isinstance(statement, str) or not statement.strip():
        raise EvidenceValidationError(f"{field}.statement must be non-empty")
    evidence_ids = _string_list(value.get("evidence_ids"), f"{field}.evidence_ids")
    if not evidence_ids:
        raise EvidenceValidationError(f"{field}.evidence_ids must not be empty")
    unknown_evidence = sorted(set(evidence_ids) - set(registry))
    if unknown_evidence:
        raise EvidenceValidationError(
            f"{field}.evidence_ids references unknown evidence ID: {unknown_evidence[0]}"
        )
    if claim_kind == "metric":
        value_number = _number(value.get("value"), f"{field}.value", required=False)
        if value_number is None:
            raise EvidenceValidationError(f"{field}.value is required for metric claims")
        unit = value.get("unit")
        if unit is not None and (not isinstance(unit, str) or not unit.strip()):
            raise EvidenceValidationError(f"{field}.unit is invalid")
    else:
        # Non-metric claims may carry an optional numeric anchor but it must be
        # finite when present; they never fabricate precision without evidence.
        _number(value.get("value"), f"{field}.value", required=False)
    if claim_kind == "score_rationale":
        dimension = value.get("score_dimension")
        if not isinstance(dimension, str) or not dimension.strip():
            raise EvidenceValidationError(f"{field}.score_dimension is required")
    if claim_kind == "comparison":
        peer = value.get("peer_reference")
        if peer is not None and (not isinstance(peer, str) or not peer.strip()):
            raise EvidenceValidationError(f"{field}.peer_reference is invalid")
    if claim_kind == "recommendation":
        horizon = value.get("horizon")
        if horizon is not None and (not isinstance(horizon, str) or not horizon.strip()):
            raise EvidenceValidationError(f"{field}.horizon is invalid")
    result: dict[str, Any] = {
        "claim_kind": claim_kind,
        "statement": " ".join(statement.split()),
        "evidence_ids": list(evidence_ids),
    }
    if "value" in value:
        result["value"] = value["value"]
    if "unit" in value:
        result["unit"] = value["unit"]
    if "score_dimension" in value:
        result["score_dimension"] = value["score_dimension"]
    if "peer_reference" in value:
        result["peer_reference"] = value["peer_reference"]
    if "horizon" in value:
        result["horizon"] = value["horizon"]
    return result


# ---------------------------------------------------------------------------
# Answers
# ---------------------------------------------------------------------------


def _validate_answer(
    value: Mapping[str, Any],
    *,
    answer_kind: str,
    registry: Mapping[str, dict[str, Any]],
    now: datetime,
) -> dict[str, Any]:
    field = f"answers[{answer_kind}]"
    unknown = set(value) - _ALLOWED_ANSWER_FIELDS
    if unknown:
        raise EvidenceValidationError(f"{field} has unknown field: {sorted(unknown)[0]}")
    if value.get("answer_kind") != answer_kind:
        raise EvidenceValidationError(f"{field}.answer_kind mismatch")
    state = value.get("state")
    if state not in ANSWER_STATES:
        raise EvidenceValidationError(f"{field}.state is invalid")
    headline = value.get("headline")
    if headline is not None and not isinstance(headline, str):
        raise EvidenceValidationError(f"{field}.headline must be a string")
    summary = value.get("summary")
    if summary is not None and not isinstance(summary, str):
        raise EvidenceValidationError(f"{field}.summary must be a string")
    limitations = _string_list(value.get("limitations"), f"{field}.limitations")
    claims_value = value.get("claims", [])
    if not isinstance(claims_value, list):
        raise EvidenceValidationError(f"{field}.claims must be an array")
    claims = [
        _validate_claim(claim, answer_kind=answer_kind, index=index, registry=registry)
        for index, claim in enumerate(claims_value)
    ]

    if state == "data_needed":
        # Fail closed: an unavailable answer is representable only as an
        # explicit "Data needed" limitation. No claims means no fabricated
        # precision; no zero metrics smuggled in as "answered".
        if claims:
            raise EvidenceValidationError(
                f"{field} state=data_needed must not carry material claims"
            )
        if not any(DATA_NEEDED_MARKER in limitation for limitation in limitations):
            raise EvidenceValidationError(
                f"{field} state=data_needed must declare the {DATA_NEEDED_MARKER!r} limitation"
            )
    else:
        # answered answers must carry at least one evidence-walkable claim and
        # a summary; an empty "answered" answer is a fabrication risk.
        if not claims:
            raise EvidenceValidationError(
                f"{field} state=answered must carry at least one material claim"
            )
        if summary is None or not summary.strip():
            raise EvidenceValidationError(f"{field}.summary must be non-empty when answered")

    # Freshness gate: every referenced evidence record must be fresh (or its
    # expiry still in the future) at `now`, OR the answer must declare a
    # limitation naming the stale evidence id. Stale-without-limitation fails
    # closed; reuse never renews observed_at, so this is the only freshness
    # boundary the deterministic validator can enforce.
    referenced_ids = {
        evidence_id for claim in claims for evidence_id in claim["evidence_ids"]
    }
    stale_ids: set[str] = set()
    for evidence_id in sorted(referenced_ids):
        record = registry[evidence_id]
        expires_at = record["expires_at"]
        if expires_at is not None:
            expires = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if expires <= now:
                stale_ids.add(evidence_id)
    if stale_ids:
        stale_declared = {
            evidence_id
            for evidence_id in stale_ids
            if any(evidence_id in limitation for limitation in limitations)
        }
        undeclared = sorted(stale_ids - stale_declared)
        if undeclared:
            raise EvidenceValidationError(
                f"{field} references stale evidence without a declared limitation: "
                f"{undeclared[0]}"
            )

    result: dict[str, Any] = {
        "answer_kind": answer_kind,
        "state": state,
        "claims": claims,
        "limitations": list(limitations),
    }
    if headline is not None:
        result["headline"] = headline
    if summary is not None:
        result["summary"] = summary
    return result


# ---------------------------------------------------------------------------
# Top-level contract
# ---------------------------------------------------------------------------


def validate_answer_coverage(
    value: Mapping[str, Any],
    *,
    evidence_records: Mapping[str, Any],
    now: datetime | None = None,
) -> dict[str, Any]:
    """Validate the six-answer evidence-coverage contract.

    ``value`` is the final-answer payload: ``schema_version``, ``subject_id``,
    ``brief_version``, and an ``answers`` mapping covering every answer kind in
    ``ANSWER_KINDS``. ``evidence_records`` is the evidence registry keyed by
    evidence id. Returns a normalized deep copy; raises
    ``EvidenceValidationError`` on any fail-closed violation.
    """

    if not isinstance(value, Mapping):
        raise EvidenceValidationError("answer coverage payload must be an object")
    unknown = set(value) - {
        "schema_version",
        "subject_id",
        "brief_version",
        "evidence_snapshot_id",
        "answers",
    }
    if unknown:
        raise EvidenceValidationError(
            f"answer coverage has unknown field: {sorted(unknown)[0]}"
        )
    if value.get("schema_version") != ANSWER_COVERAGE_SCHEMA_VERSION:
        raise EvidenceValidationError("answer coverage schema_version must be 1.0")
    subject_id = _uuid(value.get("subject_id"), "subject_id")
    brief_version = value.get("brief_version")
    if not isinstance(brief_version, int) or isinstance(brief_version, bool) or brief_version < 1:
        raise EvidenceValidationError("brief_version must be a positive integer")
    snapshot_id = value.get("evidence_snapshot_id")
    if snapshot_id is not None:
        snapshot_id = _uuid(snapshot_id, "evidence_snapshot_id")

    registry = validate_evidence_registry(evidence_records)

    answers_value = value.get("answers")
    if not isinstance(answers_value, Mapping):
        raise EvidenceValidationError("answers must be an object keyed by answer kind")
    present_kinds = set(answers_value)
    if present_kinds != set(ANSWER_KINDS):
        missing = sorted(set(ANSWER_KINDS) - present_kinds)
        unexpected = sorted(present_kinds - set(ANSWER_KINDS))
        if missing:
            raise EvidenceValidationError(f"answers missing kind: {missing[0]}")
        raise EvidenceValidationError(f"answers has unknown kind: {unexpected[0]}")

    resolved_now = now if now is not None else datetime.now(timezone.utc)

    answers: dict[str, Any] = {}
    for answer_kind in ANSWER_KINDS:
        answer_value = answers_value[answer_kind]
        if not isinstance(answer_value, Mapping):
            raise EvidenceValidationError(f"answers[{answer_kind}] must be an object")
        answers[answer_kind] = _validate_answer(
            answer_value, answer_kind=answer_kind, registry=registry, now=resolved_now
        )

    result: dict[str, Any] = {
        "schema_version": ANSWER_COVERAGE_SCHEMA_VERSION,
        "subject_id": subject_id,
        "brief_version": brief_version,
        "answers": answers,
    }
    if snapshot_id is not None:
        result["evidence_snapshot_id"] = snapshot_id
    return result


def coverage_summary(value: Mapping[str, Any]) -> dict[str, Any]:
    """Deterministic summary of a validated six-answer payload."""

    answers = value.get("answers", {})
    kinds = [kind for kind in ANSWER_KINDS if kind in answers]
    return {
        "answer_kinds": len(kinds),
        "answered": sum(1 for kind in kinds if answers[kind].get("state") == "answered"),
        "data_needed": sum(1 for kind in kinds if answers[kind].get("state") == "data_needed"),
        "material_claims": sum(
            len(answers[kind].get("claims") or []) for kind in kinds
        ),
        "limitations": sum(
            len(answers[kind].get("limitations") or []) for kind in kinds
        ),
    }
