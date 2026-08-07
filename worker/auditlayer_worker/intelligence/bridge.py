"""Bridge GenerationPipeline → subject intelligence ledger.

When an audit belongs to an ALM batch (and therefore a Subject), commit a
minimal intelligence run after successful report generation so Subject home
has live scores/runs instead of fixtures. Failures here never fail the audit.
"""

from __future__ import annotations

import hashlib
from typing import Any, Mapping

from ..core import AuditRecord, PROMPT_VERSION
from ..observability import log_event
from .runtime import RuntimeTelemetry
from .telemetry_persistence import project_intelligence_run


def resolve_subject_context(gateway: Any, audit_id: str) -> dict[str, Any] | None:
    """Return ``{subject_id, batch_id, brief_version}`` when the audit is batched."""
    try:
        link = (
            gateway.client.table("batch_audits")
            .select("batch_id, audit_batches(subject_id, id)")
            .eq("audit_id", audit_id)
            .limit(1)
            .execute()
        )
        rows = link.data or []
        if not rows:
            return None
        batch = rows[0].get("audit_batches") or {}
        if isinstance(batch, list):
            batch = batch[0] if batch else {}
        subject_id = batch.get("subject_id")
        batch_id = batch.get("id") or rows[0].get("batch_id")
        if not subject_id:
            return None

        brief_version = 1
        briefs = (
            gateway.client.table("living_brief_versions")
            .select("version")
            .eq("subject_id", subject_id)
            .order("version", desc=True)
            .limit(1)
            .execute()
        )
        if briefs.data:
            brief_version = int(briefs.data[0].get("version") or 1)

        return {
            "subject_id": str(subject_id),
            "batch_id": str(batch_id) if batch_id else None,
            "brief_version": brief_version,
        }
    except Exception as exc:  # noqa: BLE001
        log_event(
            "intelligence_subject_resolve_failed",
            level="warning",
            audit_id=audit_id,
            error_type=type(exc).__name__,
        )
        return None


def maybe_commit_subject_ledger(
    gateway: Any,
    audit: AuditRecord,
    *,
    overall_score: int | None,
    research_cache: str,
    tokens_in: int,
    tokens_out: int,
    cost_usd: float,
    wall_clock_seconds: float,
    cache_mode: str,
    model: str,
    sink: Any | None = None,
    telemetry: RuntimeTelemetry | Mapping[str, Any] | None = None,
) -> str | None:
    """Create snapshot + intelligence run + score row for a batched audit.

    Returns the intelligence_run id when committed, else None.

    When a ``RuntimeTelemetry`` (or allowlisted telemetry mapping) is supplied,
    the finalize payload is projected through the canonical telemetry-to-
    persistence contract; otherwise the raw report-pipeline arguments are
    wrapped into an honest partial telemetry mapping and projected through the
    same boundary, so status/cache/token/cost normalization has exactly one
    canonical owner.
    """
    ctx = resolve_subject_context(gateway, audit.id)
    if ctx is None:
        return None

    subject_id = ctx["subject_id"]
    try:
        if sink is not None:
            sink.emit(
                "scoring",
                "Recording subject intelligence ledger…",
                event_type="analysis_running",
            )

        snapshot_id = gateway.create_evidence_snapshot(subject_id)
        evidence_items: list[dict[str, Any]] = []
        if research_cache.strip():
            content = research_cache.strip()[:8000]
            digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
            from datetime import datetime, timezone

            evidence_items.append(
                {
                    "subject_id": subject_id,
                    "channel_id": None,
                    "snapshot_id": snapshot_id,
                    "source_type": "public_web",
                    "source_url": "",
                    "content_hash": digest,
                    "confidence": "medium",
                    "observed_at": datetime.now(timezone.utc).isoformat(),
                    "payload": {"text": content, "audit_id": audit.id},
                }
            )
        writer = gateway.intelligence_ledger_writer()
        if evidence_items:
            try:
                writer.upsert_evidence(evidence_items)
            except Exception as exc:  # noqa: BLE001
                log_event(
                    "intelligence_evidence_upsert_failed",
                    level="warning",
                    audit_id=audit.id,
                    error_type=type(exc).__name__,
                )

        model_hash = hashlib.sha256(
            f"{model}|{PROMPT_VERSION}|alm-bridge-v1".encode()
        ).hexdigest()[:32]
        run_id = gateway.start_intelligence_run(
            subject_id=subject_id,
            brief_version=ctx["brief_version"],
            evidence_snapshot_id=snapshot_id,
            methodology_version="alm-bridge-v1",
            expertise_pack_version="social-media-audit",
            prompt_version=PROMPT_VERSION or "1.1",
            model_config_hash=model_hash,
            output_schema_version="1.0",
            batch_id=ctx.get("batch_id"),
        )
        gateway.set_intelligence_run_progress(
            run_id, "analyzing", detail=f"audit={audit.id}"
        )
        gateway.set_intelligence_run_progress(
            run_id, "finalizing", detail=f"audit={audit.id}"
        )

        if overall_score is not None:
            writer.record_scores(
                [
                    {
                        "run_id": run_id,
                        "dimension": "overall",
                        "value": float(overall_score),
                        "evidence_ids": [],
                        "methodology_version": "alm-bridge-v1",
                        "previous_value": None,
                        "change_kind": None,
                    }
                ]
            )

        if telemetry is not None:
            telemetry_source: RuntimeTelemetry | Mapping[str, Any] = telemetry
            latency_ms: int | None = None  # derive from telemetry stage timings
        else:
            # Honest partial mapping from report-pipeline arguments: only fields
            # the pipeline actually knows are present; absent fields stay absent
            # so the contract records them as null-origin rather than inventing
            # values. The report wall clock is the best available latency here.
            telemetry_source = {
                "status": "succeeded",
                "cache_mode": cache_mode,
                "tokens_in": tokens_in,
                "tokens_out": tokens_out,
                "cost_usd": cost_usd,
                "model": model,
            }
            latency_ms = int(wall_clock_seconds * 1000)

        projection = project_intelligence_run(
            telemetry_source,
            run_id=run_id,
            latency_ms=latency_ms,
        )
        writer.finalize_intelligence_run(projection.payload)
        gateway.set_intelligence_run_progress(
            run_id, "succeeded", detail=f"audit={audit.id}"
        )
        if sink is not None:
            sink.emit(
                "scoring",
                "Subject intelligence ledger updated.",
                event_type="scoring_complete",
            )
        return run_id
    except Exception as exc:  # noqa: BLE001 - never fail paid report delivery
        log_event(
            "intelligence_ledger_bridge_failed",
            level="warning",
            audit_id=audit.id,
            subject_id=subject_id,
            error_type=type(exc).__name__,
        )
        return None
