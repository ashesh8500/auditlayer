"""Ledger commit shapes matching the ALM intelligence kernel RPCs.

Assumed kernel tables (from kernel packet / migration
``20260723020611_alm_intelligence_kernel.sql``):

- ``evidence``, ``evidence_snapshots``, ``intelligence_runs``
- ``scores``, ``findings``, ``recommendations``, ``decisions``
- ``context_update_proposals``

Assumed service-role RPCs:

- ``create_evidence_snapshot(p_subject_id uuid) → uuid``
- ``upsert_evidence(p_items jsonb) → setof uuid``
- ``start_intelligence_run(...) → uuid``
- ``record_scores(p_scores jsonb)``
- ``record_findings(p_findings jsonb)``
- ``record_recommendations(p_recommendations jsonb)``
- ``create_context_update_proposals(p_proposals jsonb) → setof uuid``
- ``finalize_intelligence_run(p_run_id, p_status, p_latency_ms, p_tokens_in,
  p_tokens_out, p_cost_usd, p_cache_mode)``

This module builds JSONB payloads only. Persistence is injected via
``LedgerWriter`` so unit tests never touch Supabase.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any, Protocol
from uuid import UUID

from .change_classifier import CHANGE_KINDS, UNKNOWN_CHANGE
from .evidence import EvidenceValidationError, normalize_evidence
from .runtime import CompletedIntelligenceRun, RuntimeTelemetry


class LedgerCommitError(ValueError):
    """A ledger commit payload violates the kernel RPC contract."""


def _uuid(value: str, field_name: str) -> str:
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError) as exc:
        raise LedgerCommitError(f"{field_name} must be a UUID") from exc


@dataclass(frozen=True)
class LedgerCommitBatch:
    """Typed commit envelopes ready for service-role RPC invocation."""

    run_id: str
    subject_id: str
    evidence_snapshot_id: str
    upsert_evidence: tuple[Mapping[str, Any], ...]
    record_scores: tuple[Mapping[str, Any], ...]
    record_findings: tuple[Mapping[str, Any], ...]
    record_recommendations: tuple[Mapping[str, Any], ...]
    create_context_update_proposals: tuple[Mapping[str, Any], ...]
    change_explanations: tuple[Mapping[str, Any], ...]
    finalize_intelligence_run: Mapping[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "subject_id": self.subject_id,
            "evidence_snapshot_id": self.evidence_snapshot_id,
            "rpc": {
                "upsert_evidence": [deepcopy(dict(row)) for row in self.upsert_evidence],
                "record_scores": [deepcopy(dict(row)) for row in self.record_scores],
                "record_findings": [deepcopy(dict(row)) for row in self.record_findings],
                "record_recommendations": [
                    deepcopy(dict(row)) for row in self.record_recommendations
                ],
                "create_context_update_proposals": [
                    deepcopy(dict(row)) for row in self.create_context_update_proposals
                ],
                "finalize_intelligence_run": deepcopy(dict(self.finalize_intelligence_run)),
            },
            "change_explanations": [
                deepcopy(dict(row)) for row in self.change_explanations
            ],
        }


class LedgerWriter(Protocol):
    """Injectable persistence boundary for release wiring."""

    def upsert_evidence(self, items: Sequence[Mapping[str, Any]]) -> Sequence[str]: ...

    def record_scores(self, scores: Sequence[Mapping[str, Any]]) -> None: ...

    def record_findings(self, findings: Sequence[Mapping[str, Any]]) -> None: ...

    def record_recommendations(
        self, recommendations: Sequence[Mapping[str, Any]]
    ) -> None: ...

    def create_context_update_proposals(
        self, proposals: Sequence[Mapping[str, Any]]
    ) -> Sequence[str]: ...

    def finalize_intelligence_run(self, payload: Mapping[str, Any]) -> None: ...


@dataclass
class MemoryLedgerWriter:
    """In-memory ledger for tests; mirrors RPC call shapes without I/O."""

    evidence: list[dict[str, Any]] = field(default_factory=list)
    scores: list[dict[str, Any]] = field(default_factory=list)
    findings: list[dict[str, Any]] = field(default_factory=list)
    recommendations: list[dict[str, Any]] = field(default_factory=list)
    proposals: list[dict[str, Any]] = field(default_factory=list)
    finalizations: list[dict[str, Any]] = field(default_factory=list)

    def upsert_evidence(self, items: Sequence[Mapping[str, Any]]) -> Sequence[str]:
        ids: list[str] = []
        for item in items:
            row = deepcopy(dict(item))
            self.evidence.append(row)
            ids.append(str(row.get("content_hash") or ""))
        return ids

    def record_scores(self, scores: Sequence[Mapping[str, Any]]) -> None:
        self.scores.extend(deepcopy(dict(row)) for row in scores)

    def record_findings(self, findings: Sequence[Mapping[str, Any]]) -> None:
        self.findings.extend(deepcopy(dict(row)) for row in findings)

    def record_recommendations(
        self, recommendations: Sequence[Mapping[str, Any]]
    ) -> None:
        self.recommendations.extend(deepcopy(dict(row)) for row in recommendations)

    def create_context_update_proposals(
        self, proposals: Sequence[Mapping[str, Any]]
    ) -> Sequence[str]:
        ids: list[str] = []
        for proposal in proposals:
            row = deepcopy(dict(proposal))
            self.proposals.append(row)
            ids.append(str(row.get("proposal_id") or row.get("path") or ""))
        return ids

    def finalize_intelligence_run(self, payload: Mapping[str, Any]) -> None:
        self.finalizations.append(deepcopy(dict(payload)))


def evidence_upsert_rows(
    evidence_items: Sequence[Mapping[str, Any]],
    *,
    snapshot_id: str,
) -> list[dict[str, Any]]:
    """Map evidence-v1 packets to ``upsert_evidence`` JSONB rows.

    Contract ``evidence_id`` is content-addressed (UUIDv5 of content_hash). The
    kernel ``evidence`` table generates its own primary key and keys uniqueness
    on ``(subject_id, content_hash)``. Reuse never renews ``observed_at``.
    """

    snapshot = _uuid(snapshot_id, "snapshot_id")
    rows: list[dict[str, Any]] = []
    seen_hashes: set[str] = set()
    for index, item in enumerate(evidence_items):
        if not isinstance(item, Mapping):
            raise LedgerCommitError(f"evidence[{index}] must be an object")
        try:
            normalized = normalize_evidence(
                subject_id=str(item.get("subject_id")),
                channel_id=str(item.get("channel_id")) if item.get("channel_id") else None,
                source_type=str(item.get("source_type")),
                source_url=item.get("source_url"),
                observed_at=item.get("observed_at"),
                expires_at=item.get("expires_at"),
                confidence=str(item.get("confidence")),
                coverage=item.get("coverage"),
                payload=item.get("payload"),
            )
        except (EvidenceValidationError, TypeError) as exc:
            raise LedgerCommitError(f"evidence[{index}] is invalid") from exc
        if dict(item) != normalized:
            raise LedgerCommitError(f"evidence[{index}] is not canonical evidence-v1")
        content_hash = str(normalized["content_hash"])
        if content_hash in seen_hashes:
            continue
        seen_hashes.add(content_hash)
        # Contract evidence_id is UUIDv5(content_hash); findings/scores store that
        # string. Kernel rows key uniqueness on (subject_id, content_hash), so we
        # never rewrite payload/coverage after hashing.
        rows.append(
            {
                "subject_id": normalized["subject_id"],
                "channel_id": normalized["channel_id"],
                "snapshot_id": snapshot,
                "source_type": normalized["source_type"],
                "source_url": normalized.get("source_url"),
                "observed_at": normalized["observed_at"],
                "expires_at": normalized.get("expires_at"),
                "content_hash": content_hash,
                "confidence": normalized["confidence"],
                "coverage": deepcopy(normalized.get("coverage") or {}),
                "payload": deepcopy(normalized["payload"]),
            }
        )
    return rows


def score_ledger_rows(
    scores: Sequence[Mapping[str, Any]],
    *,
    run_id: str,
) -> list[dict[str, Any]]:
    """Map intelligence-result scores to ``record_scores`` JSONB rows.

    Includes ``previous_value`` and ``change_kind`` for the scores table even
    though the current kernel RPC only inserts a subset; release may extend the
    RPC without changing this shape.
    """

    run = _uuid(run_id, "run_id")
    rows: list[dict[str, Any]] = []
    for index, score in enumerate(scores):
        if not isinstance(score, Mapping):
            raise LedgerCommitError(f"scores[{index}] must be an object")
        dimension = score.get("dimension")
        if not isinstance(dimension, str) or not dimension.strip():
            raise LedgerCommitError(f"scores[{index}].dimension is required")
        value = score.get("value")
        if value is not None and (
            not isinstance(value, (int, float))
            or isinstance(value, bool)
            or value < 0
            or value > 100
        ):
            raise LedgerCommitError(f"scores[{index}].value must be null or [0, 100]")
        evidence_ids = score.get("evidence_ids")
        if not isinstance(evidence_ids, list) or not all(
            isinstance(item, str) for item in evidence_ids
        ):
            raise LedgerCommitError(f"scores[{index}].evidence_ids must be strings")
        if value is not None and not evidence_ids:
            raise LedgerCommitError(
                f"scores[{index}] with a numeric value requires evidence_ids"
            )
        methodology_version = score.get("methodology_version")
        if not isinstance(methodology_version, str) or not methodology_version.strip():
            raise LedgerCommitError(f"scores[{index}].methodology_version is required")
        change_kind = score.get("change_cause") or score.get("change_kind")
        if change_kind == UNKNOWN_CHANGE:
            # Honest UNKNOWN is projected through the nullable persistence
            # path: the kernel change_kind CHECK constraint is unchanged, so
            # UNKNOWN serializes as NULL and the correction tip is required
            # here so callers cannot drop the explanation at the boundary.
            correction_tip = score.get("change_correction_tip")
            if not isinstance(correction_tip, str) or not correction_tip.strip():
                raise LedgerCommitError(
                    f"scores[{index}].change_correction_tip is required for UNKNOWN change attribution"
                )
            change_kind = None
        elif change_kind is not None and change_kind not in CHANGE_KINDS:
            raise LedgerCommitError(f"scores[{index}].change_kind is invalid")
        previous_value = score.get("previous_value")
        if previous_value is not None and (
            not isinstance(previous_value, (int, float))
            or isinstance(previous_value, bool)
            or previous_value < 0
            or previous_value > 100
        ):
            raise LedgerCommitError(f"scores[{index}].previous_value is invalid")
        rows.append(
            {
                "run_id": run,
                "dimension": dimension.strip(),
                "value": None if value is None else float(value),
                "evidence_ids": list(evidence_ids),
                "methodology_version": methodology_version.strip(),
                "previous_value": (
                    None if previous_value is None else float(previous_value)
                ),
                "change_kind": change_kind,
            }
        )
    return rows


def finding_ledger_rows(
    findings: Sequence[Mapping[str, Any]],
    *,
    run_id: str,
    channel_type_by_finding: Mapping[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Map findings to ``record_findings`` JSONB rows."""

    run = _uuid(run_id, "run_id")
    channel_map = channel_type_by_finding or {}
    rows: list[dict[str, Any]] = []
    for index, finding in enumerate(findings):
        if not isinstance(finding, Mapping):
            raise LedgerCommitError(f"findings[{index}] must be an object")
        finding_ref = finding.get("id")
        if not isinstance(finding_ref, str) or not finding_ref.strip():
            raise LedgerCommitError(f"findings[{index}].id is required")
        claim = finding.get("claim")
        if not isinstance(claim, str) or not claim.strip():
            raise LedgerCommitError(f"findings[{index}].claim is required")
        evidence_ids = finding.get("evidence_ids")
        if (
            not isinstance(evidence_ids, list)
            or not evidence_ids
            or not all(isinstance(item, str) for item in evidence_ids)
        ):
            raise LedgerCommitError(f"findings[{index}].evidence_ids must be non-empty")
        confidence = finding.get("confidence")
        if confidence not in {"low", "medium", "high"}:
            raise LedgerCommitError(f"findings[{index}].confidence is invalid")
        impacts = finding.get("dimension_impacts") or {}
        if not isinstance(impacts, Mapping):
            raise LedgerCommitError(f"findings[{index}].dimension_impacts must be an object")
        channel_type = finding.get("channel_type") or channel_map.get(finding_ref)
        rows.append(
            {
                "run_id": run,
                "finding_ref": finding_ref.strip(),
                "claim": " ".join(claim.split()),
                "evidence_ids": list(evidence_ids),
                "confidence": confidence,
                "dimension_impacts": deepcopy(dict(impacts)),
                "channel_type": channel_type,
            }
        )
    return rows


def recommendation_ledger_rows(
    recommendations: Sequence[Mapping[str, Any]],
    *,
    run_id: str,
    channel_type_by_recommendation: Mapping[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Map recommendations to ``record_recommendations`` JSONB rows."""

    run = _uuid(run_id, "run_id")
    channel_map = channel_type_by_recommendation or {}
    rows: list[dict[str, Any]] = []
    for index, recommendation in enumerate(recommendations):
        if not isinstance(recommendation, Mapping):
            raise LedgerCommitError(f"recommendations[{index}] must be an object")
        ref = recommendation.get("id")
        if not isinstance(ref, str) or not ref.strip():
            raise LedgerCommitError(f"recommendations[{index}].id is required")
        action = recommendation.get("action")
        if not isinstance(action, str) or not action.strip():
            raise LedgerCommitError(f"recommendations[{index}].action is required")
        evidence_ids = recommendation.get("evidence_ids")
        if (
            not isinstance(evidence_ids, list)
            or not evidence_ids
            or not all(isinstance(item, str) for item in evidence_ids)
        ):
            raise LedgerCommitError(
                f"recommendations[{index}].evidence_ids must be non-empty"
            )
        content = {
            "action": " ".join(action.split()),
            "fingerprint": recommendation.get("fingerprint"),
        }
        for key in ("priority", "horizon", "rationale"):
            if key in recommendation:
                content[key] = deepcopy(recommendation[key])
        channel_type = recommendation.get("channel_type") or channel_map.get(ref)
        rows.append(
            {
                "run_id": run,
                "recommendation_ref": ref.strip(),
                "content": content,
                "evidence_ids": list(evidence_ids),
                "channel_type": channel_type,
            }
        )
    return rows


def proposal_ledger_rows(
    proposals: Sequence[Mapping[str, Any]],
    *,
    run_id: str,
) -> list[dict[str, Any]]:
    """Map context-update-proposal-v1 objects to kernel proposal RPC rows."""

    run = _uuid(run_id, "run_id")
    rows: list[dict[str, Any]] = []
    for index, proposal in enumerate(proposals):
        if not isinstance(proposal, Mapping):
            raise LedgerCommitError(f"proposals[{index}] must be an object")
        subject_id = _uuid(str(proposal.get("subject_id")), f"proposals[{index}].subject_id")
        base_version = proposal.get("base_version")
        if not isinstance(base_version, int) or base_version < 1:
            raise LedgerCommitError(f"proposals[{index}].base_version is invalid")
        path = proposal.get("path")
        if not isinstance(path, str) or not path.startswith("/"):
            raise LedgerCommitError(f"proposals[{index}].path is invalid")
        operation = proposal.get("operation")
        if operation not in {"add", "replace", "remove"}:
            raise LedgerCommitError(f"proposals[{index}].operation is invalid")
        evidence_ids = proposal.get("evidence_ids") or []
        if not isinstance(evidence_ids, list) or not all(
            isinstance(item, str) for item in evidence_ids
        ):
            raise LedgerCommitError(f"proposals[{index}].evidence_ids must be strings")
        reason = proposal.get("reason")
        if not isinstance(reason, str) or not reason.strip():
            raise LedgerCommitError(f"proposals[{index}].reason is required")
        fingerprint = proposal.get("semantic_fingerprint")
        if not isinstance(fingerprint, str) or len(fingerprint) != 64:
            raise LedgerCommitError(
                f"proposals[{index}].semantic_fingerprint is required (64 hex chars)"
            )
        rows.append(
            {
                "subject_id": subject_id,
                "base_version": base_version,
                "intelligence_run_id": run,
                "path": path,
                "operation": operation,
                "proposed_value": deepcopy(proposal.get("proposed_value")),
                "evidence_ids": list(evidence_ids),
                "reason": " ".join(reason.split()),
                "proposal_id": proposal.get("proposal_id"),
                "semantic_fingerprint": fingerprint,
            }
        )
    return rows


def finalize_payload(
    telemetry: RuntimeTelemetry | Mapping[str, Any],
    *,
    run_id: str,
    status: str = "completed",
    latency_ms: int | None = None,
) -> dict[str, Any]:
    """Build ``finalize_intelligence_run`` arguments from allowlisted telemetry."""

    run = _uuid(run_id, "run_id")
    if status not in {"completed", "failed", "running"}:
        raise LedgerCommitError("finalize status is invalid")
    data = telemetry.to_dict() if isinstance(telemetry, RuntimeTelemetry) else dict(telemetry)
    stage_timings = data.get("stage_timings") or {}
    if latency_ms is None:
        latency_ms = round(sum(float(value) for value in stage_timings.values()) * 1000)
    return {
        "p_run_id": run,
        "p_status": status,
        "p_latency_ms": max(0, int(latency_ms)),
        "p_tokens_in": max(0, int(data.get("tokens_in") or 0)),
        "p_tokens_out": max(0, int(data.get("tokens_out") or 0)),
        "p_cost_usd": round(max(0.0, float(data.get("cost_usd") or 0.0)), 6),
        "p_cache_mode": data.get("cache_mode"),
    }


def _channel_type_index(result: Mapping[str, Any]) -> tuple[dict[str, str], dict[str, str]]:
    finding_map: dict[str, str] = {}
    recommendation_map: dict[str, str] = {}
    for channel in result.get("channel_results") or []:
        if not isinstance(channel, Mapping):
            continue
        channel_type = channel.get("channel_type")
        if not isinstance(channel_type, str):
            continue
        for finding in channel.get("findings") or []:
            if isinstance(finding, Mapping) and isinstance(finding.get("id"), str):
                finding_map[finding["id"]] = channel_type
        for recommendation in channel.get("recommendations") or []:
            if isinstance(recommendation, Mapping) and isinstance(
                recommendation.get("id"), str
            ):
                recommendation_map[recommendation["id"]] = channel_type
    return finding_map, recommendation_map


def build_ledger_commit(
    completed: CompletedIntelligenceRun,
    *,
    run_id: str,
    evidence_items: Sequence[Mapping[str, Any]],
    latency_ms: int | None = None,
) -> LedgerCommitBatch:
    """Assemble all kernel RPC payloads from a completed intelligence run."""

    result = completed.result
    subject_id = _uuid(str(result.get("subject_id")), "subject_id")
    snapshot_id = _uuid(str(result.get("evidence_snapshot_id")), "evidence_snapshot_id")
    run = _uuid(run_id, "run_id")
    finding_map, recommendation_map = _channel_type_index(result)
    change_explanations = result.get("change_explanations") or []
    if not isinstance(change_explanations, list):
        raise LedgerCommitError("change_explanations must be an array")
    normalized_changes: list[dict[str, Any]] = []
    for index, explanation in enumerate(change_explanations):
        if (
            not isinstance(explanation, Mapping)
            or explanation.get("cause") not in CHANGE_KINDS
            or not isinstance(explanation.get("detail"), str)
        ):
            raise LedgerCommitError(f"change_explanations[{index}] is invalid")
        normalized_changes.append(
            {
                "cause": explanation["cause"],
                "detail": " ".join(str(explanation["detail"]).split()),
            }
        )

    return LedgerCommitBatch(
        run_id=run,
        subject_id=subject_id,
        evidence_snapshot_id=snapshot_id,
        upsert_evidence=tuple(
            evidence_upsert_rows(evidence_items, snapshot_id=snapshot_id)
        ),
        record_scores=tuple(
            score_ledger_rows(result.get("scores") or [], run_id=run)
        ),
        record_findings=tuple(
            finding_ledger_rows(
                result.get("findings") or [],
                run_id=run,
                channel_type_by_finding=finding_map,
            )
        ),
        record_recommendations=tuple(
            recommendation_ledger_rows(
                result.get("recommendations") or [],
                run_id=run,
                channel_type_by_recommendation=recommendation_map,
            )
        ),
        create_context_update_proposals=tuple(
            proposal_ledger_rows(completed.context_update_proposals, run_id=run)
        ),
        change_explanations=tuple(normalized_changes),
        finalize_intelligence_run=finalize_payload(
            completed.telemetry,
            run_id=run,
            status="completed" if completed.telemetry.status == "succeeded" else "failed",
            latency_ms=latency_ms,
        ),
    )


def commit_ledger_batch(writer: LedgerWriter, batch: LedgerCommitBatch) -> None:
    """Persist a commit batch through the injectable writer boundary."""

    if batch.upsert_evidence:
        writer.upsert_evidence(batch.upsert_evidence)
    if batch.record_scores:
        writer.record_scores(batch.record_scores)
    if batch.record_findings:
        writer.record_findings(batch.record_findings)
    if batch.record_recommendations:
        writer.record_recommendations(batch.record_recommendations)
    if batch.create_context_update_proposals:
        writer.create_context_update_proposals(batch.create_context_update_proposals)
    writer.finalize_intelligence_run(batch.finalize_intelligence_run)
