"""Deterministic telemetry-to-persistence ownership/parity contract.

Proves that every allowlisted ``RuntimeTelemetry`` field has exactly one
authoritative persistence owner (``intelligence_runs`` subject-domain run truth
vs private ``report_generation_runs`` attempt metrics) or is explicitly
UNSUPPORTED with a correction tip — nothing is silently dropped, double-written,
or fabricated. Success, inference timeout, total deadline, cancellation-UNKNOWN,
resumed/reused cache, failure, and honest-null cases project onto the existing
record contracts with distinct, order-stable status/cache/error vocabularies
normalized at one canonical boundary.

Mock/static only: zero live provider calls (the evidence fixture records
``provider_calls: 0``). Fixtures prove mapping, parity, redaction, and failure
semantics — never live persistence, cancellation, latency, cost, or customer
outcome.

The evidence fixture is regenerated deterministically by
``test_telemetry_persistence_evidence_fixture_records_zero_provider_calls`` into
``tests/fixtures/intelligence/telemetry_persistence/telemetry_persistence_evidence.json``.
"""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Mapping
from unittest.mock import MagicMock

import pytest

from auditlayer_worker.core import AuditRecord
from auditlayer_worker.intelligence import (
    RuntimeTelemetry,
    finalize_payload,
)
from auditlayer_worker.intelligence.bridge import maybe_commit_subject_ledger
from auditlayer_worker.intelligence.ledger import LedgerCommitError
from auditlayer_worker.intelligence.telemetry_persistence import (
    CACHE_MODE_VOCABULARY,
    INTELLIGENCE_RUN_STATUS_VOCABULARY,
    REPORT_RUN_STATUS_VOCABULARY,
    REPORT_STAGE_WHITELIST,
    RUNTIME_STAGE_KEYS,
    TELEMETRY_ALLOWLIST,
    TELEMETRY_FIELD_OWNERSHIP,
    TelemetryOwner,
    TelemetryPersistenceError,
    field_ownership_matrix,
    project_intelligence_run,
    project_report_attempt,
    project_telemetry,
)
from auditlayer_worker.supabase_client import ALLOWED_REPORT_STAGE_TIMINGS

RUN_ID = "11111111-1111-4111-8111-111111111111"


# ---------------------------------------------------------------------------
# shared scenario telemetry
# ---------------------------------------------------------------------------


def _succeeded_telemetry() -> RuntimeTelemetry:
    return RuntimeTelemetry(
        status="succeeded",
        failure_code=None,
        cache_mode="fresh",
        channel_calls=2,
        synthesis_calls=1,
        correction_calls=0,
        tokens_in=120,
        tokens_out=60,
        cost_usd=0.013,
        evidence_items=4,
        stage_timings={
            "projection": 0.5,
            "channel_analysis": 2.0,
            "synthesis": 0.4,
            "assembly": 0.1,
        },
        model="deepseek-v4-flash",
        provider="deepseek",
        deadline_seconds=10.0,
        deadline_exceeded=False,
    )


SCENARIO_TELEMETRY: dict[str, RuntimeTelemetry | Mapping[str, Any]] = {
    "succeeded": _succeeded_telemetry(),
    "inference_timeout": RuntimeTelemetry(
        status="failed",
        failure_code="inference_timeout",
        cache_mode="fresh",
        tokens_in=100,
        tokens_out=0,
        cost_usd=0.01,
        stage_timings={"projection": 0.2, "channel_analysis": 1.5},
    ),
    "total_deadline": RuntimeTelemetry(
        status="failed",
        failure_code="run_deadline_exceeded",
        cache_mode="fresh",
        tokens_in=300,
        tokens_out=150,
        cost_usd=0.03,
        stage_timings={"projection": 0.1, "channel_analysis": 2.0},
        deadline_seconds=5.0,
        deadline_exceeded=True,
    ),
    "cancellation_unknown": RuntimeTelemetry(
        status="failed",
        failure_code=None,
        cache_mode="fresh",
        tokens_in=10,
        tokens_out=5,
        cost_usd=0.001,
    ),
    "resumed": RuntimeTelemetry(
        status="succeeded",
        cache_mode="resume",
        tokens_in=40,
        tokens_out=20,
        cost_usd=0.004,
        stage_timings={"projection": 0.1, "channel_analysis": 1.0, "assembly": 0.05},
    ),
    "reused": RuntimeTelemetry(
        status="succeeded",
        cache_mode="reused",
        tokens_in=0,
        tokens_out=0,
        cost_usd=0.0,
    ),
    "failed": RuntimeTelemetry(
        status="failed",
        failure_code="inference_failed",
        cache_mode="fresh",
        tokens_in=50,
        tokens_out=10,
        cost_usd=0.005,
    ),
    # Honest null: only status is known; everything else is absent/None.
    "honest_null": {"status": "succeeded"},
}


# ---------------------------------------------------------------------------
# ownership matrix
# ---------------------------------------------------------------------------


def test_ownership_matrix_covers_exactly_the_runtime_allowlist() -> None:
    matrix = field_ownership_matrix()
    # 15 W008 fields + 3 W007 cancellation-containment fields landed before
    # this gate; the matrix must cover the full runtime allowlist at origin.
    assert len(matrix) == 18
    assert tuple(item.field for item in matrix) == TELEMETRY_ALLOWLIST
    assert set(TELEMETRY_ALLOWLIST) == set(RuntimeTelemetry().to_dict())
    # Order matches the runtime emit order, so drift is a visible diff.
    runtime_order = tuple(RuntimeTelemetry().to_dict())
    assert TELEMETRY_ALLOWLIST == runtime_order


def test_ownership_matrix_assigns_exactly_one_owner_per_field() -> None:
    matrix = field_ownership_matrix()
    fields = [item.field for item in matrix]
    assert len(fields) == len(set(fields))
    for item in matrix:
        assert item.owner in (
            TelemetryOwner.INTELLIGENCE_RUN,
            TelemetryOwner.REPORT_GENERATION_RUN,
            TelemetryOwner.UNSUPPORTED,
        )
        assert item.note.strip()


def test_owner_sets_match_declared_vocabularies() -> None:
    intelligence_owned = {
        item.field
        for item in TELEMETRY_FIELD_OWNERSHIP
        if item.owner is TelemetryOwner.INTELLIGENCE_RUN
    }
    report_owned = {
        item.field
        for item in TELEMETRY_FIELD_OWNERSHIP
        if item.owner is TelemetryOwner.REPORT_GENERATION_RUN
    }
    unsupported = {
        item.field
        for item in TELEMETRY_FIELD_OWNERSHIP
        if item.owner is TelemetryOwner.UNSUPPORTED
    }
    assert intelligence_owned == {
        "status", "cache_mode", "tokens_in", "tokens_out", "cost_usd",
    }
    assert report_owned == {"failure_code", "evidence_items", "stage_timings"}
    assert unsupported == {
        "channel_calls", "synthesis_calls", "correction_calls",
        "model", "provider", "deadline_seconds", "deadline_exceeded",
        "queued_cancelled", "inflight_unknown", "cancellation_tip",
    }
    assert intelligence_owned.isdisjoint(report_owned)
    assert intelligence_owned.isdisjoint(unsupported)
    assert report_owned.isdisjoint(unsupported)


# ---------------------------------------------------------------------------
# scenario projections
# ---------------------------------------------------------------------------


def test_succeeded_projects_to_completed_and_ready() -> None:
    projection = project_telemetry(SCENARIO_TELEMETRY["succeeded"], run_id=RUN_ID)
    intel = projection.intelligence_run.payload
    assert intel["p_status"] == "completed"
    assert intel["p_cache_mode"] == "fresh"
    assert intel["p_tokens_in"] == 120
    assert intel["p_tokens_out"] == 60
    assert intel["p_cost_usd"] == 0.013
    assert intel["p_latency_ms"] == 3000  # aggregate of stage timings
    report = projection.report_attempt.payload
    assert report["status"] == "ready"
    assert report["error_code"] is None
    assert report["evidence_items"] == 4
    assert report["total_seconds"] == 3.0
    assert report["stage_timings"] == {}  # runtime stages are not report stages


def test_inference_timeout_maps_failed_with_error_code() -> None:
    projection = project_telemetry(
        SCENARIO_TELEMETRY["inference_timeout"], run_id=RUN_ID
    )
    assert projection.intelligence_run.payload["p_status"] == "failed"
    report = projection.report_attempt.payload
    assert report["status"] == "failed"
    assert report["error_code"] == "inference_timeout"


def test_total_deadline_maps_failed_and_deadline_fields_unsupported() -> None:
    projection = project_telemetry(SCENARIO_TELEMETRY["total_deadline"], run_id=RUN_ID)
    assert projection.intelligence_run.payload["p_status"] == "failed"
    assert projection.report_attempt.payload["error_code"] == "run_deadline_exceeded"
    unsupported_fields = {item.field for item in projection.unsupported_fields}
    assert "deadline_seconds" in unsupported_fields
    assert "deadline_exceeded" in unsupported_fields


def test_cancellation_unknown_never_becomes_success() -> None:
    projection = project_telemetry(
        SCENARIO_TELEMETRY["cancellation_unknown"], run_id=RUN_ID
    )
    # A failed run with no failure code must never project to success.
    assert projection.intelligence_run.payload["p_status"] == "failed"
    report = projection.report_attempt.payload
    assert report["status"] == "failed"
    assert report["error_code"] is None
    # The honest null is inspectable, not silently dropped.
    assert "failure_code" in projection.report_attempt.null_origin_fields


def test_resumed_and_reused_cache_projection() -> None:
    for scenario in ("resumed", "reused"):
        projection = project_telemetry(SCENARIO_TELEMETRY[scenario], run_id=RUN_ID)
        expected = "resume" if scenario == "resumed" else "reused"
        assert projection.intelligence_run.payload["p_cache_mode"] == expected
        assert projection.intelligence_run.payload["p_status"] == "completed"
        # cache_mode is intelligence-owned; the report payload never writes it.
        assert "cache_mode" not in projection.report_attempt.payload


def test_failed_maps_to_failed_on_both_records() -> None:
    projection = project_telemetry(SCENARIO_TELEMETRY["failed"], run_id=RUN_ID)
    assert projection.intelligence_run.payload["p_status"] == "failed"
    assert projection.report_attempt.payload["status"] == "failed"
    assert projection.report_attempt.payload["error_code"] == "inference_failed"


def test_honest_null_uses_schema_defaults_with_null_origin() -> None:
    projection = project_telemetry(SCENARIO_TELEMETRY["honest_null"], run_id=RUN_ID)
    intel = projection.intelligence_run.payload
    # tokens/cost are NOT NULL with default 0; nulls project to the schema
    # default and are recorded as null-origin rather than fabricated values.
    assert intel["p_tokens_in"] == 0
    assert intel["p_tokens_out"] == 0
    assert intel["p_cost_usd"] == 0.0
    assert intel["p_cache_mode"] is None
    assert intel["p_latency_ms"] == 0
    assert "tokens_in" in projection.intelligence_run.null_origin_fields
    assert "cache_mode" in projection.intelligence_run.null_origin_fields
    report = projection.report_attempt.payload
    assert report["error_code"] is None
    assert report["evidence_items"] == 0


# ---------------------------------------------------------------------------
# one-owner, deterministic normalization, redaction
# ---------------------------------------------------------------------------


def test_each_supported_field_has_one_owner_and_no_double_write() -> None:
    projection = project_telemetry(SCENARIO_TELEMETRY["succeeded"], run_id=RUN_ID)
    intel_supported = set(projection.intelligence_run.supported_fields)
    report_supported = set(projection.report_attempt.supported_fields)
    assert intel_supported == {
        "status", "cache_mode", "tokens_in", "tokens_out", "cost_usd",
    }
    assert report_supported == {"status", "failure_code", "evidence_items", "stage_timings"}

    owned = {
        item.field: item.owner
        for item in TELEMETRY_FIELD_OWNERSHIP
        if item.owner is not TelemetryOwner.UNSUPPORTED
    }
    for field, owner in owned.items():
        if field == "status":
            # status is the single documented compat projection: both records
            # persist it in distinct vocabularies normalized at this boundary.
            assert field in intel_supported and field in report_supported
            continue
        if owner is TelemetryOwner.INTELLIGENCE_RUN:
            assert field in intel_supported and field not in report_supported
        else:
            assert field in report_supported and field not in intel_supported

    # No telemetry value is written into both records: payload key sets are
    # disjoint (intelligence uses p_* RPC names, report uses adapter names).
    assert set(projection.intelligence_run.payload).isdisjoint(
        set(projection.report_attempt.payload)
    )


def test_normalization_is_deterministic_and_order_stable() -> None:
    first = project_telemetry(SCENARIO_TELEMETRY["succeeded"], run_id=RUN_ID)
    succeeded = SCENARIO_TELEMETRY["succeeded"]
    assert isinstance(succeeded, RuntimeTelemetry)
    second = project_telemetry(dict(succeeded.to_dict()), run_id=RUN_ID)
    assert json.dumps(first.intelligence_run.payload, sort_keys=True) == json.dumps(
        second.intelligence_run.payload, sort_keys=True
    )
    assert json.dumps(first.report_attempt.payload, sort_keys=True) == json.dumps(
        second.report_attempt.payload, sort_keys=True
    )
    # Unsupported lists follow the matrix order per record and are stable
    # across calls.
    assert [item.field for item in first.unsupported_fields] == [
        item.field for item in second.unsupported_fields
    ]
    matrix_order = [item.field for item in TELEMETRY_FIELD_OWNERSHIP]
    for record_projection in (
        first.intelligence_run,
        first.report_attempt,
        second.intelligence_run,
        second.report_attempt,
    ):
        fields = [
            item.field
            for item in record_projection.unsupported_fields
            if "." not in item.field
        ]
        assert fields == sorted(fields, key=matrix_order.index)


def test_unsupported_fields_carry_correction_tips() -> None:
    projection = project_telemetry(SCENARIO_TELEMETRY["succeeded"], run_id=RUN_ID)
    assert projection.unsupported_fields
    for item in projection.unsupported_fields:
        assert item.field
        assert item.record in {"intelligence_run", "report_generation_run"}
        if item.field.startswith("stage_timings."):
            assert "not in the report stage whitelist" in item.correction_tip
        else:
            assert "not persistable" in item.correction_tip
        assert len(item.correction_tip) > 20
    # Every truly unsupported matrix field is surfaced on at least one record.
    unsupported_matrix = {
        item.field
        for item in TELEMETRY_FIELD_OWNERSHIP
        if item.owner is TelemetryOwner.UNSUPPORTED
    }
    surfaced = {
        item.field
        for item in projection.unsupported_fields
        if "." not in item.field
    }
    assert unsupported_matrix <= surfaced


def test_projection_is_redacted_no_payload_leakage() -> None:
    projection = project_telemetry(SCENARIO_TELEMETRY["succeeded"], run_id=RUN_ID)
    assert projection.redacted is True
    rendered = json.dumps(
        {
            "intelligence_run": projection.intelligence_run.payload,
            "report_attempt": projection.report_attempt.payload,
            "unsupported": [
                {"field": item.field, "tip": item.correction_tip}
                for item in projection.unsupported_fields
            ],
        },
        sort_keys=True,
    )
    for secret in (
        "Ada",
        "public locator",
        "evidence body",
        "handle",
        "subject_id",
        "payload",
        "traceback",
        "credentials",
    ):
        assert secret.lower() not in rendered.lower()


def test_non_allowlisted_input_fields_fail_closed() -> None:
    with pytest.raises(TelemetryPersistenceError, match="non-allowlisted"):
        project_intelligence_run(
            {"status": "succeeded", "subject_id": RUN_ID}, run_id=RUN_ID
        )
    with pytest.raises(TelemetryPersistenceError, match="non-allowlisted"):
        project_report_attempt({"status": "succeeded", "evidence": {"x": 1}})


def test_unknown_cache_mode_fails_closed() -> None:
    with pytest.raises(TelemetryPersistenceError, match="cache_mode"):
        project_intelligence_run(
            {"status": "succeeded", "cache_mode": "miss"}, run_id=RUN_ID
        )


# ---------------------------------------------------------------------------
# adapter/schema drift fails closed
# ---------------------------------------------------------------------------


def test_report_stage_whitelist_matches_adapter_drift_fails_closed() -> None:
    # The contract's whitelist and the adapter's persistable stage set are one
    # constant; if either drifts, this test fails.
    assert frozenset(REPORT_STAGE_WHITELIST) == ALLOWED_REPORT_STAGE_TIMINGS
    # Runtime stage keys are never report stages, so they cannot be persisted
    # as attempt telemetry.
    assert frozenset(RUNTIME_STAGE_KEYS).isdisjoint(ALLOWED_REPORT_STAGE_TIMINGS)


def test_runtime_stage_keys_never_silently_dropped() -> None:
    # A RuntimeTelemetry's own allowlist already restricts stage_timings to
    # runtime keys; a mixed mapping exercises the contract boundary directly.
    projection = project_report_attempt(
        {
            "status": "succeeded",
            "stage_timings": {
                "projection": 1.0,
                "channel_analysis": 2.0,
                "research": 3.0,
                "analysis": 4.0,
            },
        }
    )
    # Report-stage keys persist; runtime keys surface as explicit unsupported
    # entries instead of being silently dropped by the adapter whitelist.
    assert projection.payload["stage_timings"] == {"research": 3.0, "analysis": 4.0}
    runtime_unsupported = {
        item.field
        for item in projection.unsupported_fields
        if item.field.startswith("stage_timings.")
    }
    assert runtime_unsupported == {
        "stage_timings.projection",
        "stage_timings.channel_analysis",
    }
    for item in projection.unsupported_fields:
        if item.field.startswith("stage_timings."):
            assert "not in the report stage whitelist" in item.correction_tip


def test_status_vocabularies_stay_distinct() -> None:
    for scenario in ("succeeded", "failed", "inference_timeout"):
        projection = project_telemetry(SCENARIO_TELEMETRY[scenario], run_id=RUN_ID)
        intel_status = projection.intelligence_run.payload["p_status"]
        report_status = projection.report_attempt.payload["status"]
        assert intel_status in INTELLIGENCE_RUN_STATUS_VOCABULARY
        assert report_status in REPORT_RUN_STATUS_VOCABULARY
        # The vocabularies never conflate.
        assert intel_status != report_status or intel_status in {"running", "failed"}


# ---------------------------------------------------------------------------
# existing adapter compatibility
# ---------------------------------------------------------------------------


def test_finalize_payload_delegates_to_contract_identical_output() -> None:
    telemetry = _succeeded_telemetry()
    direct = finalize_payload(telemetry, run_id=RUN_ID)
    contract = project_intelligence_run(telemetry, run_id=RUN_ID).payload
    assert direct == contract
    assert set(direct) == {
        "p_run_id", "p_status", "p_latency_ms", "p_tokens_in",
        "p_tokens_out", "p_cost_usd", "p_cache_mode",
    }


def test_finalize_payload_rejects_invalid_status() -> None:
    with pytest.raises(LedgerCommitError, match="finalize status is invalid"):
        finalize_payload(_succeeded_telemetry(), run_id=RUN_ID, status="bogus")


def test_finalize_payload_rejects_contract_violations_as_ledger_error() -> None:
    with pytest.raises(LedgerCommitError, match="cache_mode"):
        finalize_payload(
            {"status": "succeeded", "cache_mode": "unknown-mode"},
            run_id=RUN_ID,
        )


# ---------------------------------------------------------------------------
# bridge consumes the canonical contract
# ---------------------------------------------------------------------------


def _gateway_with_subject() -> tuple[MagicMock, MagicMock]:
    gateway = MagicMock()
    batch_chain = MagicMock()
    batch_chain.select.return_value.eq.return_value.limit.return_value.execute.return_value = (
        SimpleNamespace(
            data=[
                {
                    "batch_id": "batch-1",
                    "audit_batches": {
                        "id": "batch-1",
                        "subject_id": "11111111-1111-1111-1111-111111111111",
                    },
                }
            ]
        )
    )
    brief_chain = MagicMock()
    brief_chain.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = SimpleNamespace(
        data=[{"version": 1}]
    )

    def table(name: str):
        if name == "batch_audits":
            return batch_chain
        if name == "living_brief_versions":
            return brief_chain
        raise AssertionError(name)

    gateway.client.table.side_effect = table
    gateway.create_evidence_snapshot.return_value = (
        "22222222-2222-2222-2222-222222222222"
    )
    gateway.start_intelligence_run.return_value = (
        "33333333-3333-3333-3333-333333333333"
    )
    writer = MagicMock()
    gateway.intelligence_ledger_writer.return_value = writer
    return gateway, writer


def _audit() -> AuditRecord:
    return AuditRecord(id="a1", handle="demo", platform="instagram", goal="growth")


def test_bridge_consumes_contract_when_telemetry_supplied() -> None:
    gateway, writer = _gateway_with_subject()
    run_id = maybe_commit_subject_ledger(
        gateway,
        _audit(),
        overall_score=70,
        research_cache="evidence body " * 20,
        tokens_in=1,
        tokens_out=2,
        cost_usd=0.001,
        wall_clock_seconds=999.0,
        cache_mode="fresh",
        model="deepseek-v4-flash",
        telemetry=RuntimeTelemetry(
            status="failed",
            failure_code="inference_timeout",
            cache_mode="resume",
            tokens_in=88,
            tokens_out=44,
            cost_usd=0.009,
            stage_timings={"projection": 0.25, "channel_analysis": 1.25},
        ),
    )
    assert run_id == "33333333-3333-3333-3333-333333333333"
    writer.finalize_intelligence_run.assert_called_once()
    payload = writer.finalize_intelligence_run.call_args.args[0]
    assert payload["p_run_id"] == run_id
    assert payload["p_status"] == "failed"
    assert payload["p_cache_mode"] == "resume"
    assert payload["p_tokens_in"] == 88
    assert payload["p_latency_ms"] == 1500  # from telemetry, not report wall clock
    assert payload["p_latency_ms"] != 999_000


def test_bridge_raw_args_project_through_contract() -> None:
    gateway, writer = _gateway_with_subject()
    run_id = maybe_commit_subject_ledger(
        gateway,
        _audit(),
        overall_score=81,
        research_cache="evidence body " * 20,
        tokens_in=100,
        tokens_out=200,
        cost_usd=0.05,
        wall_clock_seconds=30.0,
        cache_mode="fresh",
        model="deepseek-v4-flash",
    )
    assert run_id == "33333333-3333-3333-3333-333333333333"
    payload = writer.finalize_intelligence_run.call_args.args[0]
    assert payload["p_run_id"] == run_id
    assert payload["p_status"] == "completed"
    assert payload["p_latency_ms"] == 30_000
    assert payload["p_tokens_in"] == 100
    assert payload["p_tokens_out"] == 200
    assert payload["p_cost_usd"] == 0.05
    assert payload["p_cache_mode"] == "fresh"


# ---------------------------------------------------------------------------
# deterministic evidence fixture
# ---------------------------------------------------------------------------


def test_telemetry_persistence_evidence_fixture_records_zero_provider_calls() -> None:
    ownership = {
        "intelligence_run": sorted(
            item.field
            for item in TELEMETRY_FIELD_OWNERSHIP
            if item.owner is TelemetryOwner.INTELLIGENCE_RUN
        ),
        "report_generation_run": sorted(
            item.field
            for item in TELEMETRY_FIELD_OWNERSHIP
            if item.owner is TelemetryOwner.REPORT_GENERATION_RUN
        ),
        "unsupported": sorted(
            item.field
            for item in TELEMETRY_FIELD_OWNERSHIP
            if item.owner is TelemetryOwner.UNSUPPORTED
        ),
    }
    scenarios: dict[str, dict[str, Any]] = {}
    for name, telemetry in SCENARIO_TELEMETRY.items():
        projection = project_telemetry(telemetry, run_id=RUN_ID)
        scenarios[name] = {
            "intelligence_run": projection.intelligence_run.payload,
            "report_attempt": projection.report_attempt.payload,
            "unsupported": sorted(
                item.field for item in projection.unsupported_fields
            ),
            "null_origin_intelligence": sorted(
                projection.intelligence_run.null_origin_fields
            ),
            "null_origin_report": sorted(
                projection.report_attempt.null_origin_fields
            ),
        }
    document = {
        "schema_version": "1.0",
        "generated_by": "worker/tests/test_intelligence_telemetry_persistence.py",
        "live_provider": False,
        "provider_calls": 0,
        "ownership": ownership,
        "scenarios": scenarios,
    }
    out = (
        Path(__file__).resolve().parent
        / "fixtures"
        / "intelligence"
        / "telemetry_persistence"
        / "telemetry_persistence_evidence.json"
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    loaded = json.loads(out.read_text(encoding="utf-8"))
    assert loaded["provider_calls"] == 0
    assert loaded["live_provider"] is False
    assert set(loaded["scenarios"]) == set(SCENARIO_TELEMETRY)

    data = loaded["scenarios"]
    assert data["succeeded"]["intelligence_run"]["p_status"] == "completed"
    assert data["succeeded"]["report_attempt"]["status"] == "ready"
    assert data["inference_timeout"]["report_attempt"]["error_code"] == "inference_timeout"
    assert data["total_deadline"]["intelligence_run"]["p_status"] == "failed"
    assert "deadline_seconds" in data["total_deadline"]["unsupported"]
    assert data["cancellation_unknown"]["intelligence_run"]["p_status"] == "failed"
    assert data["cancellation_unknown"]["report_attempt"]["error_code"] is None
    assert data["resumed"]["intelligence_run"]["p_cache_mode"] == "resume"
    assert data["reused"]["intelligence_run"]["p_cache_mode"] == "reused"
    assert data["failed"]["report_attempt"]["error_code"] == "inference_failed"
    assert data["honest_null"]["intelligence_run"]["p_tokens_in"] == 0
    assert "cache_mode" in data["honest_null"]["null_origin_intelligence"]
    assert data["honest_null"]["intelligence_run"]["p_cache_mode"] is None

    rendered = json.dumps(loaded, sort_keys=True)
    for secret in ("Ada", "public locator", "evidence body", "handle", "credentials"):
        assert secret.lower() not in rendered.lower()
