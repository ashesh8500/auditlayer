"""Deterministic continuity compiler for longitudinal intelligence runs.

Compiles prior ledger state (scores, recommendations, decisions, Living Brief)
into a bounded packet that pins change causes, rejection suppression, and
cache-key prior_state. The compiler never invents facts; it only projects
already-validated ledger rows into the shapes `IntelligenceRunRequest` needs.
"""

from __future__ import annotations

import hashlib
from collections.abc import Mapping, Sequence
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from .evidence import EvidenceValidationError, canonical_json
from .projection import project_subject_context

CHANGE_CAUSES = frozenset({"evidence", "brief_lens", "methodology", "prior_correction"})
DECISION_STATUSES = frozenset({"accepted", "rejected", "superseded"})
RECOMMENDATION_STATUSES = frozenset(
    {"proposed", "accepted", "rejected", "implemented", "superseded"}
)
MAX_PRIOR_SCORES = 64
MAX_OPEN_RECOMMENDATIONS = 40
MAX_DECISIONS = 40
MAX_REJECTED = 200


class ContinuityError(ValueError):
    """Prior ledger state cannot be compiled into a safe continuity packet."""


def _uuid(value: str, field: str) -> str:
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError) as exc:
        raise ContinuityError(f"{field} must be a UUID") from exc


def _string(value: Any, field: str, *, max_length: int = 2_000) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ContinuityError(f"{field} must be a non-empty string")
    return " ".join(value.split())[:max_length]


@dataclass(frozen=True)
class ContinuityPacket:
    """Pinned prior-state projection for one intelligence run."""

    subject_id: str
    brief_version: int
    projected_brief: Mapping[str, Any]
    prior_scores: Mapping[str, float | None]
    prior_result: Mapping[str, Any] | None
    open_recommendations: tuple[Mapping[str, Any], ...]
    rejected_recommendation_ids: frozenset[str]
    rejected_recommendation_fingerprints: frozenset[str]
    decisions: tuple[Mapping[str, Any], ...]
    change_cause_hint: str
    prior_state_hash: str
    packet_hash: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "subject_id": self.subject_id,
            "brief_version": self.brief_version,
            "projected_brief": deepcopy(dict(self.projected_brief)),
            "prior_scores": dict(self.prior_scores),
            "prior_result": deepcopy(dict(self.prior_result)) if self.prior_result else None,
            "open_recommendations": [deepcopy(dict(row)) for row in self.open_recommendations],
            "rejected_recommendation_ids": sorted(self.rejected_recommendation_ids),
            "rejected_recommendation_fingerprints": sorted(
                self.rejected_recommendation_fingerprints
            ),
            "decisions": [deepcopy(dict(row)) for row in self.decisions],
            "change_cause_hint": self.change_cause_hint,
            "prior_state_hash": self.prior_state_hash,
            "packet_hash": self.packet_hash,
        }


def _normalize_prior_scores(rows: Sequence[Mapping[str, Any]] | Mapping[str, Any]) -> dict[str, float | None]:
    if isinstance(rows, Mapping) and not any(
        isinstance(value, Mapping) for value in rows.values()
    ):
        scores: dict[str, float | None] = {}
        for dimension, value in rows.items():
            name = _string(dimension, "prior_scores.dimension", max_length=120)
            if value is None:
                scores[name] = None
            elif isinstance(value, (int, float)) and not isinstance(value, bool):
                if value < 0 or value > 100:
                    raise ContinuityError("prior score values must be in [0, 100]")
                scores[name] = float(value)
            else:
                raise ContinuityError("prior score values must be numbers or null")
        if len(scores) > MAX_PRIOR_SCORES:
            raise ContinuityError(f"at most {MAX_PRIOR_SCORES} prior scores allowed")
        return scores

    if not isinstance(rows, Sequence):
        raise ContinuityError("prior_scores must be a mapping or sequence")
    scores = {}
    for index, row in enumerate(rows):
        if not isinstance(row, Mapping):
            raise ContinuityError(f"prior_scores[{index}] must be an object")
        dimension = _string(row.get("dimension"), f"prior_scores[{index}].dimension", max_length=120)
        value = row.get("value")
        if value is None:
            scores[dimension] = None
        elif isinstance(value, (int, float)) and not isinstance(value, bool):
            if value < 0 or value > 100:
                raise ContinuityError("prior score values must be in [0, 100]")
            scores[dimension] = float(value)
        else:
            raise ContinuityError("prior score values must be numbers or null")
    if len(scores) > MAX_PRIOR_SCORES:
        raise ContinuityError(f"at most {MAX_PRIOR_SCORES} prior scores allowed")
    return scores


def _normalize_recommendations(
    rows: Sequence[Mapping[str, Any]] | None,
    *,
    field: str,
) -> tuple[list[dict[str, Any]], set[str], set[str]]:
    if rows is None:
        return [], set(), set()
    if not isinstance(rows, Sequence):
        raise ContinuityError(f"{field} must be a sequence")
    open_rows: list[dict[str, Any]] = []
    rejected_ids: set[str] = set()
    rejected_fingerprints: set[str] = set()
    for index, row in enumerate(rows):
        if not isinstance(row, Mapping):
            raise ContinuityError(f"{field}[{index}] must be an object")
        rec_id = _string(row.get("id") or row.get("recommendation_ref"), f"{field}[{index}].id")
        status = str(row.get("status") or "proposed")
        if status not in RECOMMENDATION_STATUSES:
            raise ContinuityError(f"{field}[{index}].status is invalid")
        fingerprint = row.get("fingerprint")
        if fingerprint is not None:
            fingerprint = _string(fingerprint, f"{field}[{index}].fingerprint", max_length=128)
        action = row.get("action")
        if action is None and isinstance(row.get("content"), Mapping):
            action = row["content"].get("action")
        evidence_ids = row.get("evidence_ids") or []
        if not isinstance(evidence_ids, list) or not all(isinstance(item, str) for item in evidence_ids):
            raise ContinuityError(f"{field}[{index}].evidence_ids must be strings")
        if status == "rejected":
            rejected_ids.add(rec_id)
            if fingerprint:
                rejected_fingerprints.add(fingerprint)
            continue
        if status in {"proposed", "accepted"}:
            if len(open_rows) >= MAX_OPEN_RECOMMENDATIONS:
                raise ContinuityError(
                    f"at most {MAX_OPEN_RECOMMENDATIONS} open recommendations allowed"
                )
            open_rows.append(
                {
                    "id": rec_id,
                    "status": status,
                    "action": _string(action, f"{field}[{index}].action") if action else "",
                    "evidence_ids": list(evidence_ids)[:20],
                    "fingerprint": fingerprint,
                }
            )
    if len(rejected_ids) > MAX_REJECTED or len(rejected_fingerprints) > MAX_REJECTED:
        raise ContinuityError(f"at most {MAX_REJECTED} rejected recommendation identities allowed")
    return open_rows, rejected_ids, rejected_fingerprints


def _normalize_decisions(rows: Sequence[Mapping[str, Any]] | None) -> list[dict[str, Any]]:
    if rows is None:
        return []
    if not isinstance(rows, Sequence):
        raise ContinuityError("decisions must be a sequence")
    result: list[dict[str, Any]] = []
    for index, row in enumerate(rows[:MAX_DECISIONS]):
        if not isinstance(row, Mapping):
            raise ContinuityError(f"decisions[{index}] must be an object")
        decision = str(row.get("decision") or row.get("status") or "")
        if decision not in DECISION_STATUSES:
            raise ContinuityError(f"decisions[{index}].decision is invalid")
        target_type = str(row.get("target_type") or "recommendation")
        if target_type not in {"proposal", "recommendation"}:
            raise ContinuityError(f"decisions[{index}].target_type is invalid")
        result.append(
            {
                "target_type": target_type,
                "target_id": _string(
                    row.get("target_id") or row.get("id"),
                    f"decisions[{index}].target_id",
                    max_length=128,
                ),
                "decision": decision,
                "note": " ".join(str(row.get("note") or "").split())[:500],
            }
        )
    return result


def _change_cause_hint(
    *,
    brief_version: int,
    methodology_version: str | None,
    prior_result: Mapping[str, Any] | None,
) -> str:
    if not isinstance(prior_result, Mapping):
        return "evidence"
    if prior_result.get("prior_correction") is True:
        return "prior_correction"
    if (
        methodology_version is not None
        and prior_result.get("methodology_version") not in {None, methodology_version}
    ):
        return "methodology"
    if prior_result.get("brief_version") not in {None, brief_version}:
        return "brief_lens"
    return "evidence"


def compile_continuity_packet(
    *,
    subject_id: str,
    brief_version: int,
    subject_context: Mapping[str, Any],
    channel_ids: Sequence[str],
    prior_scores: Sequence[Mapping[str, Any]] | Mapping[str, Any] | None = None,
    prior_recommendations: Sequence[Mapping[str, Any]] | None = None,
    prior_decisions: Sequence[Mapping[str, Any]] | None = None,
    prior_result: Mapping[str, Any] | None = None,
    methodology_version: str | None = None,
    explicit_rejected_ids: Sequence[str] | None = None,
    explicit_rejected_fingerprints: Sequence[str] | None = None,
) -> ContinuityPacket:
    """Compile ledger priors into a bounded continuity packet.

    Precedence for suppression: explicit rejects ∪ decisions(rejected) ∪
    recommendation rows already marked rejected. Open recommendations stay
    available for model context but never rewrite Living Brief identity.
    """

    normalized_subject = _uuid(subject_id, "subject_id")
    if brief_version < 1:
        raise ContinuityError("brief_version must be positive")
    try:
        projected = project_subject_context(subject_context, channel_ids=channel_ids)
    except EvidenceValidationError as exc:
        raise ContinuityError(str(exc)) from exc
    if (
        projected.get("subject_id") != normalized_subject
        or projected.get("version") != brief_version
    ):
        raise ContinuityError("subject context does not match pinned brief version")

    scores = _normalize_prior_scores(prior_scores or {})
    open_recs, rejected_ids, rejected_fps = _normalize_recommendations(
        prior_recommendations, field="prior_recommendations"
    )
    decisions = _normalize_decisions(prior_decisions)
    for decision in decisions:
        if decision["decision"] == "rejected" and decision["target_type"] == "recommendation":
            rejected_ids.add(decision["target_id"])
    for value in explicit_rejected_ids or ():
        rejected_ids.add(_string(value, "explicit_rejected_ids", max_length=128))
    for value in explicit_rejected_fingerprints or ():
        rejected_fps.add(_string(value, "explicit_rejected_fingerprints", max_length=128))
    if len(rejected_ids) > MAX_REJECTED or len(rejected_fps) > MAX_REJECTED:
        raise ContinuityError(f"at most {MAX_REJECTED} rejected recommendation identities allowed")

    normalized_prior_result = None
    if prior_result is not None:
        if not isinstance(prior_result, Mapping):
            raise ContinuityError("prior_result must be an object")
        normalized_prior_result = {
            key: deepcopy(prior_result[key])
            for key in (
                "brief_version",
                "methodology_version",
                "prior_correction",
                "evidence_snapshot_id",
                "run_id",
            )
            if key in prior_result
        }

    cause = _change_cause_hint(
        brief_version=brief_version,
        methodology_version=methodology_version,
        prior_result=normalized_prior_result,
    )
    if cause not in CHANGE_CAUSES:
        raise ContinuityError("change_cause_hint is invalid")

    prior_state = {
        "prior_scores": scores,
        "prior_result": normalized_prior_result,
    }
    prior_state_hash = hashlib.sha256(canonical_json(prior_state).encode("utf-8")).hexdigest()
    packet_body = {
        "subject_id": normalized_subject,
        "brief_version": brief_version,
        "projected_brief": projected,
        "prior_scores": scores,
        "prior_result": normalized_prior_result,
        "open_recommendations": open_recs,
        "rejected_recommendation_ids": sorted(rejected_ids),
        "rejected_recommendation_fingerprints": sorted(rejected_fps),
        "decisions": decisions,
        "change_cause_hint": cause,
        "prior_state_hash": prior_state_hash,
    }
    packet_hash = hashlib.sha256(canonical_json(packet_body).encode("utf-8")).hexdigest()
    return ContinuityPacket(
        subject_id=normalized_subject,
        brief_version=brief_version,
        projected_brief=projected,
        prior_scores=scores,
        prior_result=normalized_prior_result,
        open_recommendations=tuple(open_recs),
        rejected_recommendation_ids=frozenset(rejected_ids),
        rejected_recommendation_fingerprints=frozenset(rejected_fps),
        decisions=tuple(decisions),
        change_cause_hint=cause,
        prior_state_hash=prior_state_hash,
        packet_hash=packet_hash,
    )


@dataclass
class ContinuityInputs:
    """Loose adapter inputs typically loaded from kernel ledger reads."""

    subject_id: str
    brief_version: int
    subject_context: Mapping[str, Any]
    channel_ids: Sequence[str]
    prior_scores: Sequence[Mapping[str, Any]] | Mapping[str, Any] = field(default_factory=dict)
    prior_recommendations: Sequence[Mapping[str, Any]] = field(default_factory=tuple)
    prior_decisions: Sequence[Mapping[str, Any]] = field(default_factory=tuple)
    prior_result: Mapping[str, Any] | None = None
    methodology_version: str | None = None
    explicit_rejected_ids: Sequence[str] = field(default_factory=tuple)
    explicit_rejected_fingerprints: Sequence[str] = field(default_factory=tuple)

    def compile(self) -> ContinuityPacket:
        return compile_continuity_packet(
            subject_id=self.subject_id,
            brief_version=self.brief_version,
            subject_context=self.subject_context,
            channel_ids=self.channel_ids,
            prior_scores=self.prior_scores,
            prior_recommendations=self.prior_recommendations,
            prior_decisions=self.prior_decisions,
            prior_result=self.prior_result,
            methodology_version=self.methodology_version,
            explicit_rejected_ids=self.explicit_rejected_ids,
            explicit_rejected_fingerprints=self.explicit_rejected_fingerprints,
        )
