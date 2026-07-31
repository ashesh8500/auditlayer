"""Release wiring: SupabaseLedgerWriter speaks kernel RPC names."""

from __future__ import annotations

from typing import Any

from auditlayer_worker.intelligence.ledger import (
    LedgerWriter,
    MemoryLedgerWriter,
    commit_ledger_batch,
)
from auditlayer_worker.supabase_client import SupabaseLedgerWriter


class _FakeRpcClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, name: str, params: dict[str, Any]) -> Any:
        self.calls.append((name, params))

        class _Result:
            data = ["11111111-1111-4111-8111-111111111111"]

            def execute(self) -> "_Result":
                return self

        return _Result()


class _FakeGateway:
    def __init__(self) -> None:
        self.client = _FakeRpcClient()


def test_supabase_ledger_writer_satisfies_protocol() -> None:
    writer: LedgerWriter = SupabaseLedgerWriter(_FakeGateway())  # type: ignore[arg-type]
    assert callable(writer.upsert_evidence)
    assert callable(writer.record_scores)
    assert callable(writer.finalize_intelligence_run)


def test_supabase_ledger_writer_rpc_names_match_kernel() -> None:
    gateway = _FakeGateway()
    writer = SupabaseLedgerWriter(gateway)  # type: ignore[arg-type]

    writer.upsert_evidence(
        [
            {
                "subject_id": "22222222-2222-4222-8222-222222222222",
                "channel_id": None,
                "snapshot_id": "33333333-3333-4333-8333-333333333333",
                "source_type": "website",
                "source_url": "https://example.com",
                "observed_at": "2026-07-30T00:00:00+00:00",
                "expires_at": None,
                "content_hash": "abc",
                "confidence": "high",
                "coverage": {},
                "payload": {"ok": True},
            }
        ]
    )
    writer.record_scores(
        [
            {
                "run_id": "44444444-4444-4444-8444-444444444444",
                "dimension": "presence",
                "value": 70,
                "previous_value": 60,
                "evidence_ids": ["e1"],
                "methodology_version": "m1",
                "change_kind": "evidence",
            }
        ]
    )
    writer.record_findings([])
    writer.record_recommendations([])
    writer.create_context_update_proposals(
        [
            {
                "subject_id": "22222222-2222-4222-8222-222222222222",
                "base_version": 1,
                "intelligence_run_id": "44444444-4444-4444-8444-444444444444",
                "path": "/goals",
                "operation": "replace",
                "proposed_value": "Grow",
                "evidence_ids": [],
                "reason": "new evidence",
                "proposal_id": "ignored-client-id",
            }
        ]
    )
    writer.finalize_intelligence_run(
        {
            "p_run_id": "44444444-4444-4444-8444-444444444444",
            "p_status": "completed",
            "p_latency_ms": 10,
            "p_tokens_in": 1,
            "p_tokens_out": 2,
            "p_cost_usd": 0.01,
            "p_cache_mode": "miss",
        }
    )

    names = [name for name, _ in gateway.client.calls]
    assert names == [
        "upsert_evidence",
        "record_scores",
        "record_findings",
        "record_recommendations",
        "create_context_update_proposals",
        "finalize_intelligence_run",
    ]
    proposal_call = gateway.client.calls[4][1]
    assert "proposal_id" not in proposal_call["p_proposals"][0]
    score_call = gateway.client.calls[1][1]
    assert score_call["p_scores"][0]["previous_value"] == 60
    assert score_call["p_scores"][0]["change_kind"] == "evidence"


def test_memory_writer_still_commits() -> None:
    writer = MemoryLedgerWriter()
    # Empty-ish batch via direct finalize only path is covered elsewhere;
    # ensure protocol still works for release imports.
    writer.finalize_intelligence_run(
        {
            "p_run_id": "44444444-4444-4444-8444-444444444444",
            "p_status": "completed",
            "p_latency_ms": 1,
            "p_tokens_in": 0,
            "p_tokens_out": 0,
            "p_cost_usd": 0,
            "p_cache_mode": None,
        }
    )
    assert len(writer.finalizations) == 1
    assert commit_ledger_batch
