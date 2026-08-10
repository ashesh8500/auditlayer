from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

from auditlayer_worker.supabase_client import SupabaseGateway


REGENERATION_MIGRATION = (
    Path(__file__).parents[2]
    / "supabase/migrations/20260810153500_report_regeneration_finalization.sql"
)


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
    gateway = object.__new__(SupabaseGateway)
    gateway.client = client
    gateway.settings = cast(Any, SimpleNamespace(reports_bucket="reports"))
    return gateway, client


def test_initial_report_finalization_uses_atomic_rpc() -> None:
    gateway, client = _gateway(1)

    version = gateway.finalize_initial_report(
        audit_id="audit-1",
        delivery_status="ready",
        report_path="audit-1/revisions/random.html",
        prompt_version="1.1",
        agent_bundle_version="1.0.0",
    )

    assert version == 1
    assert client.calls == [
        (
            "finalize_initial_report",
            {
                "p_audit_id": "audit-1",
                "p_delivery_status": "ready",
                "p_report_path": "audit-1/revisions/random.html",
                "p_prompt_version": "1.1",
                "p_template_version": "master-skeleton-v1",
                "p_agent_bundle_version": "1.0.0",
                "p_intelligence_run_id": None,
            },
        )
    ]


def test_initial_report_finalization_carries_pinned_intelligence_run() -> None:
    gateway, client = _gateway(1)

    version = gateway.finalize_initial_report(
        audit_id="audit-1",
        delivery_status="ready",
        report_path="audit-1/revisions/random.html",
        prompt_version="1.1",
        agent_bundle_version="1.0.0",
        intelligence_run_id="33333333-3333-4333-8333-333333333333",
    )

    assert version == 1
    name, params = client.calls[0]
    assert name == "finalize_initial_report"
    assert (
        params["p_intelligence_run_id"]
        == "33333333-3333-4333-8333-333333333333"
    )


def test_regenerated_report_finalization_delegates_version_allocation_to_database() -> None:
    gateway, client = _gateway([2])

    version = gateway.finalize_regenerated_report(
        audit_id="audit-1",
        delivery_status="ready",
        report_path="audit-1/revisions/regenerated.html",
        prompt_version="1.4",
        agent_bundle_version="1.0.0",
        intelligence_run_id="33333333-3333-4333-8333-333333333333",
    )

    assert version == 2
    name, params = client.calls[0]
    assert name == "finalize_regenerated_report"
    assert params["p_delivery_status"] == "ready"
    assert params["p_report_path"].endswith("regenerated.html")
    assert params["p_intelligence_run_id"] == "33333333-3333-4333-8333-333333333333"


def test_regeneration_rpc_is_atomic_idempotent_and_service_role_only() -> None:
    sql = REGENERATION_MIGRATION.read_text().lower()

    assert "security definer" in sql
    assert "set search_path = ''" in sql
    assert "where id = p_audit_id for update" in sql
    assert "coalesce(max(version), 0) + 1" in sql
    assert "and report_path = p_report_path" in sql
    assert "'generation'" in sql
    assert "force_refresh = false" in sql
    assert "from public, anon, authenticated" in sql
    assert "to service_role" in sql


def test_refinement_finalization_delegates_version_allocation_to_database() -> None:
    gateway, client = _gateway([3])

    version = gateway.finalize_refinement_report(
        audit_id="audit-1",
        refinement_id="refinement-1",
        report_path="audit-1/revisions/unique.html",
        prompt_version="1.1",
        agent_bundle_version="1.0.0",
        changed_section="Creative Board",
        change_summary="Use the approved content pillars",
    )

    assert version == 3
    name, params = client.calls[0]
    assert name == "finalize_refinement_report"
    assert params["p_refinement_id"] == "refinement-1"
    assert params["p_report_path"].endswith("unique.html")
    assert params["p_agent_bundle_version"] == "1.0.0"
    assert params["p_intelligence_run_id"] is None
    assert "p_version" not in params
