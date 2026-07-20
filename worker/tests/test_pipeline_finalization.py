from dataclasses import replace

from auditlayer_worker.config import WorkerSettings
from auditlayer_worker.core import AuditRecord, Plan
from auditlayer_worker.generation import MockReportGenerator
from auditlayer_worker.pipeline import GenerationPipeline, PrintEventSink


def test_database_finalization_failure_never_announces_ready(monkeypatch, tmp_path) -> None:
    settings = replace(
        WorkerSettings.from_env(),
        output_dir=tmp_path,
        phase_interval_seconds=0,
        generator="mock",
    )
    audit = AuditRecord(
        id="finalize-fail-1",
        handle="creator",
        platform="youtube",
        goal="growth",
        plan=Plan.STARTER.value,
    )

    class Gateway:
        def upload_report(self, audit_id: str, html: str, *, version: int | None = None):
            assert audit_id == audit.id
            assert "</html>" in html
            assert version == 1
            return (f"{audit_id}/v{version}.html", "")

        def update_audit(self, _audit_id: str, **_fields):
            raise RuntimeError("database unavailable")

    monkeypatch.setattr("auditlayer_worker.pipeline._fetch_benchmark_cache", lambda _gw: [])
    sink = PrintEventSink()

    summary = GenerationPipeline(settings, MockReportGenerator()).run(
        audit,
        sink,
        gateway=Gateway(),
    )

    assert summary.status == "failed"
    phases = [phase for _, phase, _ in sink.events]
    assert "succeeded" not in phases
    assert phases[-1] == "failed"
    assert summary.report_path == "finalize-fail-1/v1.html"
