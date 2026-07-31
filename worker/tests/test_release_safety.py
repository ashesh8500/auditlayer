from __future__ import annotations

from dataclasses import replace
from unittest.mock import MagicMock, patch

import pytest

from auditlayer_worker.config import WorkerSettings
from auditlayer_worker.core import AuditRecord, inject_prompt_footer
from auditlayer_worker.generation import MockReportGenerator
from auditlayer_worker.pipeline import GenerationPipeline, PrintEventSink, SupabaseEventSink
from auditlayer_worker.supabase_client import SupabaseGateway


def _settings(**overrides: object) -> WorkerSettings:
    base = WorkerSettings.from_env()
    return replace(base, **overrides)


def _gateway() -> tuple[SupabaseGateway, MagicMock]:
    settings = _settings(
        supabase_url="https://example.supabase.co",
        supabase_service_role_key="test-service-role-key",
    )
    with patch("supabase.create_client", return_value=MagicMock()) as create_client:
        return SupabaseGateway(settings), create_client.return_value


def test_empty_atomic_queue_never_uses_legacy_claim() -> None:
    gateway, client = _gateway()
    client.rpc.return_value.execute.return_value.data = None

    assert gateway.claim_next_queued() is None
    client.table.assert_not_called()


def test_missing_rpc_fails_closed_without_legacy_claim() -> None:
    gateway, client = _gateway()
    client.rpc.side_effect = RuntimeError("PGRST202: Could not find the function")

    with pytest.raises(RuntimeError, match="PGRST202"):
        gateway.claim_next_queued()
    client.table.assert_not_called()


def test_transient_rpc_failure_is_not_downgraded_to_racy_claim() -> None:
    gateway, client = _gateway()
    client.rpc.side_effect = RuntimeError("connection reset")

    with pytest.raises(RuntimeError, match="connection reset"):
        gateway.claim_next_queued()
    client.table.assert_not_called()


def test_heartbeat_event_refreshes_audit_lease() -> None:
    gateway = MagicMock()
    sink = SupabaseEventSink(gateway, "audit-1")

    sink.emit("researching", "still working", event_type="heartbeat")

    gateway.emit_event.assert_called_once_with(
        "audit-1", "researching", "still working", event_type="heartbeat"
    )
    gateway.update_audit.assert_called_once_with("audit-1")


def test_prompt_footer_is_inserted_without_model_placeholder() -> None:
    html = "<html><body><main>Report</main></body></html>"
    result = inject_prompt_footer(html, "<p>Prompt v0.6</p>")

    assert "Prompt v0.6" in result
    assert result.index("Prompt v0.6") < result.index("</body>")


def test_budget_breach_blocks_without_entering_retry_loop(tmp_path) -> None:
    settings = _settings(
        generator="mock",
        output_dir=tmp_path,
        alm_accounts_root=str(tmp_path / "accounts"),
    )
    pipeline = GenerationPipeline(settings, MockReportGenerator())
    audit = AuditRecord(
        id="budget-test",
        handle="samplecreator",
        platform="youtube",
        goal="growth",
    )
    sink = PrintEventSink()
    gateway = MagicMock()
    gateway.client.table.return_value.select.return_value.execute.return_value.data = []

    summary = pipeline.run(
        audit,
        sink,
        gateway=gateway,
        token_cap=1,
        cost_cap_usd=0,
    )

    assert summary.status == "blocked"
    assert summary.tokens_in > 0
    assert gateway.update_audit.call_args.kwargs["status"] == "blocked"
    assert "Traceback" not in gateway.emit_event.call_args.kwargs["detail"]


def test_missing_benchmark_schema_fails_closed(tmp_path) -> None:
    settings = _settings(
        generator="mock",
        output_dir=tmp_path,
        alm_accounts_root=str(tmp_path / "accounts"),
    )
    pipeline = GenerationPipeline(settings, MockReportGenerator())
    audit = AuditRecord(
        id="schema-test",
        handle="samplecreator",
        platform="youtube",
        goal="growth",
    )
    gateway = MagicMock()
    gateway.client.table.side_effect = RuntimeError("PGRST205: table unavailable")

    summary = pipeline.run(audit, PrintEventSink(), gateway=gateway)

    assert summary.status == "failed"
    assert gateway.update_audit.call_args.kwargs["status"] == "failed"
