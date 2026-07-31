"""Local validation for typed inference responses."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Mapping
from uuid import UUID

from .evidence import EvidenceValidationError


CHANNEL_TYPES = frozenset({"instagram", "website", "youtube", "tiktok", "x", "linkedin"})
CONFIDENCE_LEVELS = frozenset({"low", "medium", "high"})


def _string_list(value: Any, field: str, *, max_items: int | None = None) -> list[str]:
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise EvidenceValidationError(f"{field} must be an array of strings")
    if max_items is not None and len(value) > max_items:
        raise EvidenceValidationError(f"{field} exceeds {max_items} items")
    return list(value)


def _known_references(values: list[str], evidence_ids: set[str], field: str) -> None:
    unknown = sorted(set(values) - evidence_ids)
    if unknown:
        raise EvidenceValidationError(f"{field} references unknown evidence ID: {unknown[0]}")


def validate_findings(value: Any, *, evidence_ids: set[str], field: str = "findings") -> list[dict[str, Any]]:
    if not isinstance(value, list) or len(value) > 30:
        raise EvidenceValidationError(f"{field} must contain at most 30 items")
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, finding in enumerate(value):
        if not isinstance(finding, Mapping):
            raise EvidenceValidationError(f"{field}[{index}] must be an object")
        finding_id = finding.get("id")
        if not isinstance(finding_id, str) or not finding_id.strip() or finding_id in seen:
            raise EvidenceValidationError("finding IDs must be non-empty and unique")
        seen.add(finding_id)
        if not isinstance(finding.get("claim"), str) or not finding["claim"].strip():
            raise EvidenceValidationError(f"{field}[{index}].claim must be non-empty")
        refs = _string_list(finding.get("evidence_ids"), f"{field}[{index}].evidence_ids")
        if not refs:
            raise EvidenceValidationError(f"{field}[{index}].evidence_ids must not be empty")
        _known_references(refs, evidence_ids, f"{field}[{index}].evidence_ids")
        if finding.get("confidence") not in CONFIDENCE_LEVELS:
            raise EvidenceValidationError(f"{field}[{index}].confidence is invalid")
        impacts = finding.get("dimension_impacts")
        if not isinstance(impacts, Mapping):
            raise EvidenceValidationError(f"{field}[{index}].dimension_impacts must be an object")
        if any(
            not isinstance(score, (int, float)) or isinstance(score, bool) or score < -100 or score > 100
            for score in impacts.values()
        ):
            raise EvidenceValidationError("dimension impacts must be numbers from -100 to 100")
        result.append(deepcopy(dict(finding)))
    return result


def validate_recommendations(
    value: Any, *, evidence_ids: set[str], field: str = "recommendations"
) -> list[dict[str, Any]]:
    if not isinstance(value, list) or len(value) > 20:
        raise EvidenceValidationError(f"{field} must contain at most 20 items")
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, recommendation in enumerate(value):
        if not isinstance(recommendation, Mapping):
            raise EvidenceValidationError(f"{field}[{index}] must be an object")
        recommendation_id = recommendation.get("id")
        if (
            not isinstance(recommendation_id, str)
            or not recommendation_id.strip()
            or recommendation_id in seen
        ):
            raise EvidenceValidationError("recommendation IDs must be non-empty and unique")
        seen.add(recommendation_id)
        if not isinstance(recommendation.get("action"), str) or not recommendation["action"].strip():
            raise EvidenceValidationError(f"{field}[{index}].action must be non-empty")
        refs = _string_list(
            recommendation.get("evidence_ids"), f"{field}[{index}].evidence_ids"
        )
        if not refs:
            raise EvidenceValidationError(f"{field}[{index}].evidence_ids must not be empty")
        _known_references(refs, evidence_ids, f"{field}[{index}].evidence_ids")
        result.append(deepcopy(dict(recommendation)))
    return result


def validate_context_proposals(
    value: Any,
    *,
    evidence_ids: set[str],
    subject_id: str,
    base_version: int,
) -> list[dict[str, Any]]:
    if not isinstance(value, list) or len(value) > 20:
        raise EvidenceValidationError("context_update_proposals must contain at most 20 items")
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    allowed = {
        "schema_version", "proposal_id", "subject_id", "base_version", "path",
        "operation", "proposed_value", "evidence_ids", "reason", "status",
        "decided_by", "decided_at",
    }
    for index, proposal in enumerate(value):
        if not isinstance(proposal, Mapping) or set(proposal) - allowed:
            raise EvidenceValidationError(f"context_update_proposals[{index}] has invalid shape")
        proposal_id = proposal.get("proposal_id")
        try:
            UUID(str(proposal_id))
        except (ValueError, TypeError, AttributeError) as exc:
            raise EvidenceValidationError("proposal_id must be a UUID") from exc
        if proposal_id in seen:
            raise EvidenceValidationError("proposal IDs must be unique")
        seen.add(str(proposal_id))
        if (
            proposal.get("schema_version") != "1.0"
            or proposal.get("subject_id") != subject_id
            or proposal.get("base_version") != base_version
            or proposal.get("operation") not in {"add", "replace", "remove"}
            or proposal.get("status") != "proposed"
            or not isinstance(proposal.get("path"), str)
            or not proposal["path"].startswith("/")
            or not isinstance(proposal.get("reason"), str)
            or not proposal["reason"].strip()
        ):
            raise EvidenceValidationError(f"context_update_proposals[{index}] violates contract")
        refs = _string_list(proposal.get("evidence_ids"), "proposal.evidence_ids")
        _known_references(refs, evidence_ids, "proposal.evidence_ids")
        result.append(deepcopy(dict(proposal)))
    return result


def validate_channel_analysis(
    value: Mapping[str, Any],
    *,
    evidence_ids: set[str],
    expected_channel_type: str,
    subject_id: str | None = None,
    brief_version: int | None = None,
) -> dict[str, Any]:
    """Validate channel-analysis-v1 plus cross-document evidence integrity."""

    allowed = {
        "schema_version",
        "channel_type",
        "evidence_coverage",
        "findings",
        "recommendations",
        "context_update_proposals",
        "limitations",
    }
    unknown_fields = set(value) - allowed
    if unknown_fields:
        raise EvidenceValidationError(f"channel analysis has unknown field: {sorted(unknown_fields)[0]}")
    if value.get("schema_version") != "1.0":
        raise EvidenceValidationError("channel analysis schema_version must be 1.0")
    channel_type = value.get("channel_type")
    if channel_type != expected_channel_type or channel_type not in CHANNEL_TYPES:
        raise EvidenceValidationError("channel analysis channel_type mismatch")
    coverage = value.get("evidence_coverage")
    if not isinstance(coverage, Mapping):
        raise EvidenceValidationError("evidence_coverage must be an object")
    used = _string_list(coverage.get("used"), "evidence_coverage.used")
    _known_references(used, evidence_ids, "evidence_coverage.used")
    _string_list(coverage.get("unavailable"), "evidence_coverage.unavailable")

    findings = validate_findings(value.get("findings"), evidence_ids=evidence_ids)
    recommendations = validate_recommendations(
        value.get("recommendations"), evidence_ids=evidence_ids
    )
    limitations = _string_list(value.get("limitations"), "limitations")
    proposals = value.get("context_update_proposals", [])
    if proposals and (subject_id is None or brief_version is None):
        raise EvidenceValidationError("proposal validation requires pinned subject context")
    validated_proposals = (
        validate_context_proposals(
            proposals,
            evidence_ids=evidence_ids,
            subject_id=subject_id or "",
            base_version=brief_version or 0,
        )
        if proposals
        else []
    )
    result = deepcopy(dict(value))
    result["findings"] = findings
    result["recommendations"] = recommendations
    result["limitations"] = limitations
    result["context_update_proposals"] = validated_proposals
    return result
