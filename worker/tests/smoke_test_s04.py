"""Smoke test for CostCapExceeded, token_cap, cost_cap_usd, and pipeline changes."""
from __future__ import annotations

from auditlayer_worker.core import AuditRecord, AuditStatus, CostCapExceeded, Plan
from auditlayer_worker.generation import MockReportGenerator
from auditlayer_worker.pipeline import GenerationPipeline, PrintEventSink


def _settings():
    from dataclasses import replace
    from auditlayer_worker.config import WorkerSettings
    base = WorkerSettings.from_env()
    return replace(base, generator="mock", pdf_mode="stub")


def _audit(**over):
    return AuditRecord(
        id="smoke-test",
        handle="test_user",
        platform="instagram",
        goal="growth",
        plan=Plan.STARTER.value,
        **over,
    )


def test_cost_cap_exceeded_exception():
    e = CostCapExceeded(150000, 120000, 2.50)
    assert e.total_tokens == 150000
    assert e.cap == 120000
    assert e.cost_usd == 2.50
    assert "cost_cap" in str(e)


def test_pipeline_without_cap():
    settings = _settings()
    pipeline = GenerationPipeline(settings, MockReportGenerator())
    sink = PrintEventSink()
    summary = pipeline.run(_audit(), sink, gateway=None, token_cap=0, cost_cap_usd=0.0)
    assert summary.status == AuditStatus.READY.value
    assert "failed" not in [p for _, p, _ in sink.events]


def test_pipeline_with_high_token_cap():
    settings = _settings()
    pipeline = GenerationPipeline(settings, MockReportGenerator())
    sink = PrintEventSink()
    summary = pipeline.run(_audit(), sink, gateway=None, token_cap=1_000_000, cost_cap_usd=0.0)
    assert summary.status == AuditStatus.READY.value


def test_pipeline_with_low_token_cap():
    settings = _settings()
    pipeline = GenerationPipeline(settings, MockReportGenerator())
    sink = PrintEventSink()
    summary = pipeline.run(_audit(), sink, gateway=None, token_cap=100, cost_cap_usd=0.0)
    assert summary.status == AuditStatus.FAILED.value
    assert "cost_cap" in summary.note
    # Verify the failed phase was emitted through the sink
    phases = [p for _, p, _ in sink.events]
    assert "failed" in phases


def test_pipeline_with_cost_cap_usd():
    """Mock generates ~40k tokens = ~$0.13 cost. Cap at $0.01 should trigger."""
    settings = _settings()
    pipeline = GenerationPipeline(settings, MockReportGenerator())
    sink = PrintEventSink()
    summary = pipeline.run(_audit(), sink, gateway=None, token_cap=0, cost_cap_usd=0.01)
    assert summary.status == AuditStatus.FAILED.value
    assert "cost_cap" in summary.note
    phases = [p for _, p, _ in sink.events]
    assert "failed" in phases


def test_pipeline_with_high_cost_cap_usd():
    """Mock generates ~$0.13 cost. Cap at $5.00 should pass."""
    settings = _settings()
    pipeline = GenerationPipeline(settings, MockReportGenerator())
    sink = PrintEventSink()
    summary = pipeline.run(_audit(), sink, gateway=None, token_cap=0, cost_cap_usd=5.00)
    assert summary.status == AuditStatus.READY.value


def test_pipeline_with_both_caps_pass():
    """Both caps set generously — should pass."""
    settings = _settings()
    pipeline = GenerationPipeline(settings, MockReportGenerator())
    sink = PrintEventSink()
    summary = pipeline.run(_audit(), sink, gateway=None, token_cap=1_000_000, cost_cap_usd=5.00)
    assert summary.status == AuditStatus.READY.value
