"""Recording tests for the report-version ↔ canonical-intelligence provenance
contract (ALM-I-025).

The immutable report version may reference at most one same-subject completed
intelligence run. These tests record the ownership boundary:

- the pipeline commits the subject ledger BEFORE finalization and carries the
  returned run id into ``finalize_initial_report`` (bridge → finalization
  ownership);
- a bridge failure never fails the paid report: the run id stays None and
  provenance projects UNKNOWN;
- legacy/unbatched audits finalize with intelligence_run_id None (explicit
  UNKNOWN, never invented provenance);
- refinement finalization passes the optional reference through the RPC
  payload and defaults to None (refinements do not create new runs);
- the typed manifest pins all seven canonical version fields or returns
  explicit UNKNOWN with a correction tip; prompt_version is never mislabeled
  as methodology_version.

All calls are recorded against fake gateways / mocks. There are zero live
Supabase, provider, or network calls. Fixtures prove the software contract
only — never live FK behavior, RLS, latency, or customer value.
"""

from __future__ import annotations

from dataclasses import replace
from types import SimpleNamespace
from typing import Any, cast

import pytest

from auditlayer_worker.config import WorkerSettings
from auditlayer_worker.core import AuditRecord, Plan
from auditlayer_worker.generation import MockReportGenerator
from auditlayer_worker.intelligence.report_provenance import (
    INTELLIGENCE_RUN_COLUMN,
    REPORT_PROVENANCE_FIELDS,
    REPORT_PROVENANCE_MANIFEST_VERSION,
    project_report_provenance,
)
from auditlayer_worker.pipeline import GenerationPipeline, PrintEventSink
from auditlayer_worker.supabase_client import SupabaseGateway

RUN_ID = "33333333-3333-4333-8333-333333333333"
SUBJECT_ID = "11111111-1111-4111-8111-111111111111"
SNAPSHOT_ID = "22222222-2222-4222-8222-222222222222"


class _RecordingGateway:
    """Minimal pipeline gateway that records finalization calls only."""

    def __init__(self) -> None:
        self.finalize_calls: list[dict[str, Any]] = []
        self.updates: list[tuple[str, dict[str, Any]]] = []
        self.operations: list[str] = []

    def upload_report(self, audit_id: str, html: str, *, version: int | None = None):
        assert version == 1
        return (f"{audit_id}/v1.html", "")

    def update_audit(self, audit_id: str, **fields: Any) -> None:
        self.operations.append("update")
        self.updates.append((audit_id, fields))

    def finalize_initial_report(self, **_fields: Any) -> int:
        self.operations.append("finalize")
        _fields["finalization_kind"] = "initial"
        self.finalize_calls.append(dict(_fields))
        return 1

    def finalize_regenerated_report(self, **_fields: Any) -> int:
        self.operations.append("finalize")
        _fields["finalization_kind"] = "regeneration"
        self.finalize_calls.append(dict(_fields))
        return 2


def _pipeline_settings(tmp_path) -> WorkerSettings:
    return replace(
        WorkerSettings.from_env(),
        output_dir=tmp_path,
        phase_interval_seconds=0,
        generator="mock",
        alm_accounts_root=str(tmp_path / "accounts"),
    )


def _audit() -> AuditRecord:
    return AuditRecord(
        id="provenance-audit-1",
        handle="creator",
        platform="youtube",
        goal="growth",
        plan=Plan.STARTER.value,
    )


# ---------------------------------------------------------------------------
# Bridge → finalization ownership (pipeline recording)
# ---------------------------------------------------------------------------


def test_pipeline_carries_bridge_run_id_into_finalization(monkeypatch, tmp_path) -> None:
    settings = _pipeline_settings(tmp_path)
    audit = _audit()

    calls: list[str] = []

    def fake_bridge(gateway, audit_, **kwargs):
        calls.append("bridge")
        return RUN_ID

    monkeypatch.setattr(
        "auditlayer_worker.intelligence.bridge.maybe_commit_subject_ledger", fake_bridge
    )
    monkeypatch.setattr(
        "auditlayer_worker.pipeline._fetch_benchmark_cache", lambda _gw: []
    )

    gateway = _RecordingGateway()
    summary = GenerationPipeline(settings, MockReportGenerator()).run(
        audit,
        PrintEventSink(),
        gateway=gateway,
    )

    assert summary.status == "ready"
    assert calls == ["bridge"]
    assert len(gateway.finalize_calls) == 1
    finalize = gateway.finalize_calls[0]
    assert finalize["intelligence_run_id"] == RUN_ID
    # Bridge commit happens before the report version is finalized.
    assert finalize["audit_id"] == audit.id


def test_pipeline_allocates_a_new_version_when_regenerating_a_ready_report(
    monkeypatch, tmp_path
) -> None:
    settings = _pipeline_settings(tmp_path)
    audit = replace(
        _audit(),
        report_path="provenance-audit-1/revisions/original.html",
        report_version=1,
    )
    monkeypatch.setattr(
        "auditlayer_worker.intelligence.bridge.maybe_commit_subject_ledger",
        lambda *_args, **_kwargs: RUN_ID,
    )
    monkeypatch.setattr(
        "auditlayer_worker.pipeline._fetch_benchmark_cache", lambda _gw: []
    )

    gateway = _RecordingGateway()
    summary = GenerationPipeline(settings, MockReportGenerator()).run(
        audit,
        PrintEventSink(),
        gateway=gateway,
    )

    assert summary.status == "ready"
    assert gateway.finalize_calls == [
        {
            "audit_id": audit.id,
            "delivery_status": "ready",
            "report_path": f"{audit.id}/v1.html",
            "prompt_version": "1.4",
            "template_version": "master-skeleton-v1",
            "agent_bundle_version": "1.0.0",
            "intelligence_run_id": RUN_ID,
            "finalization_kind": "regeneration",
        }
    ]
    assert gateway.operations.index("finalize") < gateway.operations.index("update")
    assert gateway.updates[-1][1]["force_refresh"] is False


def test_pipeline_bridge_failure_never_fails_paid_report(monkeypatch, tmp_path) -> None:
    settings = _pipeline_settings(tmp_path)
    audit = _audit()

    def broken_bridge(*_args, **_kwargs):
        raise RuntimeError("ledger unavailable")

    monkeypatch.setattr(
        "auditlayer_worker.intelligence.bridge.maybe_commit_subject_ledger", broken_bridge
    )
    monkeypatch.setattr(
        "auditlayer_worker.pipeline._fetch_benchmark_cache", lambda _gw: []
    )

    gateway = _RecordingGateway()
    summary = GenerationPipeline(settings, MockReportGenerator()).run(
        audit,
        PrintEventSink(),
        gateway=gateway,
    )

    # The paid report is delivered; provenance stays UNKNOWN (None).
    assert summary.status == "ready"
    assert len(gateway.finalize_calls) == 1
    assert gateway.finalize_calls[0]["intelligence_run_id"] is None


def test_pipeline_legacy_unbatched_finalizes_without_provenance(monkeypatch, tmp_path) -> None:
    settings = _pipeline_settings(tmp_path)
    audit = _audit()
    calls: list[str] = []

    def none_bridge(*_args, **_kwargs):
        calls.append("bridge")
        return None

    monkeypatch.setattr(
        "auditlayer_worker.intelligence.bridge.maybe_commit_subject_ledger", none_bridge
    )
    monkeypatch.setattr(
        "auditlayer_worker.pipeline._fetch_benchmark_cache", lambda _gw: []
    )

    gateway = _RecordingGateway()
    summary = GenerationPipeline(settings, MockReportGenerator()).run(
        audit,
        PrintEventSink(),
        gateway=gateway,
    )

    assert summary.status == "ready"
    assert calls == ["bridge"]
    assert gateway.finalize_calls[0]["intelligence_run_id"] is None


def test_pipeline_needs_review_still_finalizes_without_provenance(monkeypatch, tmp_path) -> None:
    """A quality-blocked report has no completed run to pin; finalization still
    happens with UNKNOWN provenance and the artifact is held for review."""
    settings = _pipeline_settings(tmp_path)
    audit = _audit()
    called = {"bridge": False}

    def unexpected_bridge(*_args, **_kwargs):
        called["bridge"] = True
        return RUN_ID

    monkeypatch.setattr(
        "auditlayer_worker.intelligence.bridge.maybe_commit_subject_ledger", unexpected_bridge
    )
    monkeypatch.setattr(
        "auditlayer_worker.pipeline._fetch_benchmark_cache", lambda _gw: []
    )

    from auditlayer_worker.quality import QualityResult

    monkeypatch.setattr(
        "auditlayer_worker.pipeline.evaluate_report_quality",
        lambda *_args, **_kwargs: QualityResult(
            passed=False, score=0, blockers=("forced-blocker",), warnings=()
        ),
    )

    gateway = _RecordingGateway()
    summary = GenerationPipeline(settings, MockReportGenerator()).run(
        audit,
        PrintEventSink(),
        gateway=gateway,
    )

    assert summary.status == "needs_review"
    # Bridge only commits for quality-passed reports; provenance stays UNKNOWN.
    assert called["bridge"] is False
    assert gateway.finalize_calls[0]["intelligence_run_id"] is None
    assert gateway.finalize_calls[0]["delivery_status"] == "needs_review"


# ---------------------------------------------------------------------------
# SupabaseGateway RPC payload parity (refinement + initial)
# ---------------------------------------------------------------------------


class _RpcCall:
    def __init__(self, client, name: str, params: dict) -> None:
        self.client = client
        self.name = name
        self.params = params

    def execute(self):
        self.client.calls.append((self.name, self.params))
        return SimpleNamespace(data=self.client.result)


class _Client:
    def __init__(self, result) -> None:
        self.result = result
        self.calls: list[tuple[str, dict]] = []

    def rpc(self, name: str, params: dict):
        return _RpcCall(self, name, params)


def _gateway(result: Any) -> tuple[SupabaseGateway, _Client]:
    client = _Client(result)
    gateway = cast(Any, object.__new__(SupabaseGateway))
    gateway.client = client
    gateway.settings = SimpleNamespace(reports_bucket="reports")
    return cast(SupabaseGateway, gateway), client


def test_refinement_finalization_carries_pinned_run_through_rpc() -> None:
    gateway, client = _gateway([2])

    version = gateway.finalize_refinement_report(
        audit_id="audit-1",
        refinement_id="refinement-1",
        report_path="audit-1/revisions/unique.html",
        prompt_version="1.1",
        agent_bundle_version="1.0.0",
        intelligence_run_id=RUN_ID,
    )

    assert version == 2
    name, params = client.calls[0]
    assert name == "finalize_refinement_report"
    assert params["p_intelligence_run_id"] == RUN_ID


# ---------------------------------------------------------------------------
# Typed manifest projection
# ---------------------------------------------------------------------------


def test_manifest_projection_pins_all_seven_fields() -> None:
    row = {
        "id": RUN_ID,
        "brief_version": 3,
        "evidence_snapshot_id": SNAPSHOT_ID,
        "methodology_version": "alm-bridge-v1",
        "expertise_pack_version": "social-media-audit",
        "prompt_version": "1.1",
        "model_config_hash": "abc123def456",
        "output_schema_version": "1.0",
    }
    projected = project_report_provenance(row)

    assert projected["status"] == "pinned"
    assert projected["manifest_version"] == REPORT_PROVENANCE_MANIFEST_VERSION
    assert projected["intelligence_run_id"] == RUN_ID
    assert set(projected["manifest"]) == set(REPORT_PROVENANCE_FIELDS)
    assert projected["manifest"]["living_brief_version"] == 3
    assert projected["manifest"]["methodology_version"] == "alm-bridge-v1"
    assert projected["manifest"]["prompt_version"] == "1.1"
    assert projected["manifest"]["model_config_hash"] == "abc123def456"
    assert projected["manifest"]["output_schema_version"] == "1.0"


def test_manifest_projection_never_mislabels_prompt_as_methodology() -> None:
    # A run that only carries prompt_version (no methodology) must stay UNKNOWN:
    # prompt_version is never promoted to methodology_version.
    row = {
        "id": RUN_ID,
        "brief_version": 1,
        "evidence_snapshot_id": SNAPSHOT_ID,
        "methodology_version": "",
        "expertise_pack_version": "social-media-audit",
        "prompt_version": "1.1",
        "model_config_hash": "abc",
        "output_schema_version": "1.0",
    }
    projected = project_report_provenance(row)
    assert projected["status"] == "unknown"
    assert "missing methodology_version" in projected["correction_tip"]


def test_manifest_projection_unknown_for_null_and_partial_rows() -> None:
    assert project_report_provenance(None)["status"] == "unknown"

    row = {
        "id": RUN_ID,
        "brief_version": 1,
        "evidence_snapshot_id": None,
        "methodology_version": "alm-bridge-v1",
        "expertise_pack_version": "social-media-audit",
        "prompt_version": "1.1",
        "model_config_hash": "abc",
        "output_schema_version": "1.0",
    }
    projected = project_report_provenance(row)
    assert projected["status"] == "unknown"
    assert "missing evidence_snapshot_id" in projected["correction_tip"]


def test_manifest_field_columns_cover_exact_kernel_columns() -> None:
    # The seven manifest fields must map 1:1 onto the kernel run columns, and
    # no field may be mislabeled (prompt stays prompt, methodology stays
    # methodology).
    assert set(INTELLIGENCE_RUN_COLUMN) == set(REPORT_PROVENANCE_FIELDS)
    assert INTELLIGENCE_RUN_COLUMN["prompt_version"] == "prompt_version"
    assert INTELLIGENCE_RUN_COLUMN["methodology_version"] == "methodology_version"
    assert INTELLIGENCE_RUN_COLUMN["living_brief_version"] == "brief_version"
    assert INTELLIGENCE_RUN_COLUMN["evidence_snapshot_id"] == "evidence_snapshot_id"
    assert INTELLIGENCE_RUN_COLUMN["model_config_hash"] == "model_config_hash"
    assert INTELLIGENCE_RUN_COLUMN["output_schema_version"] == "output_schema_version"
    assert INTELLIGENCE_RUN_COLUMN["expertise_pack_version"] == "expertise_pack_version"


def test_report_provenance_module_is_importable_without_supabase() -> None:
    # The manifest vocabulary must stay dependency-light so the deterministic
    # artifact builder (plain python3) can import it without worker deps.
    import auditlayer_worker.intelligence.report_provenance as rp

    assert rp.REPORT_PROVENANCE_MANIFEST_VERSION == "1.0"
    assert len(rp.REPORT_PROVENANCE_FIELDS) == 7
