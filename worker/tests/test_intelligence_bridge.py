"""Unit tests for the pipeline → subject ledger bridge."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

from auditlayer_worker.core import AuditRecord
from auditlayer_worker.intelligence.bridge import (
    maybe_commit_subject_ledger,
    resolve_subject_context,
)


def test_resolve_subject_context_returns_none_when_unbatched():
    gateway = MagicMock()
    gateway.client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = SimpleNamespace(
        data=[]
    )
    assert resolve_subject_context(gateway, "audit-1") is None


def test_resolve_subject_context_reads_batch_and_brief():
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
        data=[{"version": 3}]
    )

    def table(name: str):
        if name == "batch_audits":
            return batch_chain
        if name == "living_brief_versions":
            return brief_chain
        raise AssertionError(name)

    gateway.client.table.side_effect = table
    ctx = resolve_subject_context(gateway, "audit-1")
    assert ctx is not None
    assert ctx["subject_id"] == "11111111-1111-1111-1111-111111111111"
    assert ctx["batch_id"] == "batch-1"
    assert ctx["brief_version"] == 3


def test_maybe_commit_subject_ledger_noops_without_subject():
    gateway = MagicMock()
    gateway.client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = SimpleNamespace(
        data=[]
    )
    audit = AuditRecord(
        id="a1",
        handle="demo",
        platform="instagram",
        goal="growth",
    )
    assert (
        maybe_commit_subject_ledger(
            gateway,
            audit,
            overall_score=72,
            research_cache="cached research text",
            tokens_in=10,
            tokens_out=20,
            cost_usd=0.01,
            wall_clock_seconds=12.5,
            cache_mode="fresh",
            model="deepseek-v4-flash",
        )
        is None
    )


def test_maybe_commit_subject_ledger_commits_run_and_score():
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

    audit = AuditRecord(
        id="a1",
        handle="demo",
        platform="instagram",
        goal="growth",
    )
    run_id = maybe_commit_subject_ledger(
        gateway,
        audit,
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
    writer.upsert_evidence.assert_called_once()
    writer.record_scores.assert_called_once()
    score_payload = writer.record_scores.call_args.args[0][0]
    assert score_payload["run_id"] == run_id
    assert score_payload["dimension"] == "overall"
    assert score_payload["value"] == 81.0
    writer.finalize_intelligence_run.assert_called_once()
    assert gateway.set_intelligence_run_progress.call_count >= 2
