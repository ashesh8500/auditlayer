"""Local validation for typed inference responses."""

from __future__ import annotations

from copy import deepcopy
import hashlib
import re
from typing import Any, Mapping
from uuid import UUID

from .evidence import EvidenceValidationError, canonical_json


CHANNEL_TYPES = frozenset({"instagram", "website", "youtube", "tiktok", "x", "linkedin"})
CONFIDENCE_LEVELS = frozenset({"low", "medium", "high"})

# ---------------------------------------------------------------------------
# Living Brief proposal path policy.
#
# A model may only propose RFC 6901 JSON Pointer diffs into the editable
# Living Brief vocabulary.  The vocabulary is the set of top-level fields that
# live inside a ``living_brief_versions`` row and are not user-authoritative:
#
#   proposable  : identity, audience, positioning, offers, goals,
#                 constraints, experiments
#   protected   : identity (including vision), positioning, goals, constraints
#                 -> acceptance requires an owner-scoped explicit confirmation
#   unprotected : audience, offers, experiments
#                 -> acceptance does not require explicit confirmation
#
# ``decisions`` is deliberately NOT proposable: decisions are user authority
# recorded through the decisions ledger, never rewritten by model output.
# ``channels``/``subject_id``/``version``/``subject_type`` are metadata or
# separate tables and fail closed.  Anything outside the vocabulary fails
# closed so a model can never broaden its own mutation surface.
# ---------------------------------------------------------------------------
BRIEF_TOP_LEVEL_FIELDS = frozenset(
    {
        "identity",
        "audience",
        "positioning",
        "offers",
        "goals",
        "constraints",
        "experiments",
    }
)
PROTECTED_BRIEF_FIELDS = frozenset({"identity", "positioning", "goals", "constraints"})
UNPROTECTED_BRIEF_FIELDS = BRIEF_TOP_LEVEL_FIELDS - PROTECTED_BRIEF_FIELDS
MAX_BRIEF_PATH_LENGTH = 512
MAX_BRIEF_PATH_TOKENS = 8

PROTECTED_BRIEF_CODE = "protected_brief_path_requires_confirmation"
STALE_BASE_CODE = "stale_base_version"
REJECTED_SAME_EVIDENCE_CODE = "proposal_rejected_same_evidence"
OUTSIDE_VOCABULARY_CODE = "brief_path_outside_vocabulary"


def brief_path_top_field(path: str) -> str:
    """Return the top-level Living Brief field of an RFC 6901 pointer.

    Raises ``EvidenceValidationError`` with a stable code when the path is not
    a bounded RFC 6901 pointer or names a field outside the proposal
    vocabulary.
    """
    if not isinstance(path, str) or not path.startswith("/"):
        raise EvidenceValidationError(f"{OUTSIDE_VOCABULARY_CODE}: path must be a JSON Pointer starting with /")
    if len(path) > MAX_BRIEF_PATH_LENGTH:
        raise EvidenceValidationError(
            f"{OUTSIDE_VOCABULARY_CODE}: path exceeds {MAX_BRIEF_PATH_LENGTH} characters"
        )
    tokens = path[1:].split("/")
    if len(tokens) > MAX_BRIEF_PATH_TOKENS:
        raise EvidenceValidationError(
            f"{OUTSIDE_VOCABULARY_CODE}: path exceeds {MAX_BRIEF_PATH_TOKENS} tokens"
        )
    for token in tokens:
        # RFC 6901: the only valid escapes are ~0 (tilde) and ~1 (slash).
        # A bare ~ or ~ followed by any other character is invalid.
        if re.search(r"~(?:[^01]|$)", token):
            raise EvidenceValidationError(
                f"{OUTSIDE_VOCABULARY_CODE}: invalid RFC 6901 escape in path"
            )
    top = tokens[0]
    if top not in BRIEF_TOP_LEVEL_FIELDS:
        raise EvidenceValidationError(
            f"{OUTSIDE_VOCABULARY_CODE}: {path!r} targets {top!r}, which is not in the "
            f"Living Brief proposal vocabulary {sorted(BRIEF_TOP_LEVEL_FIELDS)}"
        )
    return top


def is_protected_brief_path(path: str) -> bool:
    """True when the path targets a protected Living Brief field.

    Protected fields (identity including vision, positioning, goals,
    constraints) require an owner-scoped explicit confirmation before their
    proposals may be accepted.  Paths outside the vocabulary raise.
    """
    return brief_path_top_field(path) in PROTECTED_BRIEF_FIELDS


def brief_path_policy(path: str) -> str:
    """Return ``"protected"`` or ``"unprotected"`` for a proposable path.

    Raises ``EvidenceValidationError`` (stable code
    ``brief_path_outside_vocabulary``) for non-brief or non-proposable paths.
    """
    return "protected" if is_protected_brief_path(path) else "unprotected"


def context_proposal_fingerprint(proposal: Mapping[str, Any], *, subject_id: str) -> str:
    """Deterministic evidence-linked semantic fingerprint for one proposal.

    The fingerprint binds the proposal's semantic content (path, operation,
    proposed value) to its ordered evidence set.  A rejected proposal cannot
    recur while its evidence set is unchanged; adding or removing an evidence
    ID changes the fingerprint and makes the proposal admissible again.
    """
    evidence_ids = sorted(
        str(item) for item in (proposal.get("evidence_ids") or [])
    )
    payload = {
        "subject_id": str(subject_id),
        "path": str(proposal.get("path")),
        "operation": str(proposal.get("operation")),
        "proposed_value": proposal.get("proposed_value"),
        "evidence_ids": evidence_ids,
    }
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


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
    rejected_fingerprints: frozenset[str] = frozenset(),
) -> list[dict[str, Any]]:
    if not isinstance(value, list) or len(value) > 20:
        raise EvidenceValidationError("context_update_proposals must contain at most 20 items")
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    allowed = {
        "schema_version", "proposal_id", "subject_id", "base_version", "path",
        "operation", "proposed_value", "evidence_ids", "reason", "status",
        "decided_by", "decided_at", "semantic_fingerprint",
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
        # Fail closed on paths outside the Living Brief proposal vocabulary.
        # This is what prevents a model proposal from rewriting identity,
        # positioning, goals, or constraints without the protected gate, and
        # from ever touching decisions/channels/metadata that the model does
        # not own.
        path = proposal["path"]
        brief_path_top_field(path)
        # Evidence-linked semantic fingerprint: a rejected proposal cannot
        # recur while its evidence set is unchanged.  New evidence changes the
        # fingerprint, so the same semantic edit becomes admissible again.
        fingerprint = context_proposal_fingerprint(proposal, subject_id=subject_id)
        if fingerprint in rejected_fingerprints:
            raise EvidenceValidationError(
                f"{REJECTED_SAME_EVIDENCE_CODE}: proposal {proposal_id} at {path!r} "
                "was rejected without new evidence"
            )
        normalized = deepcopy(dict(proposal))
        normalized["semantic_fingerprint"] = fingerprint
        result.append(normalized)
    return result


def validate_channel_analysis(
    value: Mapping[str, Any],
    *,
    evidence_ids: set[str],
    expected_channel_type: str,
    subject_id: str | None = None,
    brief_version: int | None = None,
    rejected_fingerprints: frozenset[str] = frozenset(),
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
            rejected_fingerprints=rejected_fingerprints,
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
