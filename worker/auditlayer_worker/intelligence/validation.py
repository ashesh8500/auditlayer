"""Local validation for typed inference responses."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Mapping

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


def validate_channel_analysis(
    value: Mapping[str, Any],
    *,
    evidence_ids: set[str],
    expected_channel_type: str,
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

    findings = value.get("findings")
    if not isinstance(findings, list) or len(findings) > 30:
        raise EvidenceValidationError("findings must contain at most 30 items")
    seen: set[str] = set()
    for index, finding in enumerate(findings):
        if not isinstance(finding, Mapping):
            raise EvidenceValidationError(f"findings[{index}] must be an object")
        finding_id = finding.get("id")
        if not isinstance(finding_id, str) or not finding_id or finding_id in seen:
            raise EvidenceValidationError("finding IDs must be non-empty and unique")
        seen.add(finding_id)
        if not isinstance(finding.get("claim"), str) or not finding["claim"].strip():
            raise EvidenceValidationError(f"findings[{index}].claim must be non-empty")
        refs = _string_list(finding.get("evidence_ids"), f"findings[{index}].evidence_ids")
        if not refs:
            raise EvidenceValidationError(f"findings[{index}].evidence_ids must not be empty")
        _known_references(refs, evidence_ids, f"findings[{index}].evidence_ids")
        if finding.get("confidence") not in CONFIDENCE_LEVELS:
            raise EvidenceValidationError(f"findings[{index}].confidence is invalid")
        impacts = finding.get("dimension_impacts")
        if not isinstance(impacts, Mapping):
            raise EvidenceValidationError(f"findings[{index}].dimension_impacts must be an object")
        if any(
            not isinstance(score, (int, float)) or isinstance(score, bool) or score < -100 or score > 100
            for score in impacts.values()
        ):
            raise EvidenceValidationError("dimension impacts must be numbers from -100 to 100")

    recommendations = value.get("recommendations")
    if not isinstance(recommendations, list) or len(recommendations) > 20:
        raise EvidenceValidationError("recommendations must contain at most 20 items")
    limitations = _string_list(value.get("limitations"), "limitations")
    proposals = value.get("context_update_proposals", [])
    if not isinstance(proposals, list):
        raise EvidenceValidationError("context_update_proposals must be an array")
    result = deepcopy(dict(value))
    result["limitations"] = limitations
    result.setdefault("context_update_proposals", [])
    return result
