"""Offline tests: uploads persist storage paths, never signed URLs."""

from __future__ import annotations

from types import SimpleNamespace

from auditlayer_worker.core import AuditRecord
from auditlayer_worker.generation import MockReportGenerator
from auditlayer_worker.pipeline import GenerationPipeline, PrintEventSink
from auditlayer_worker.supabase_client import SupabaseGateway

from tests.test_worker import _settings


class _Bucket:
    def __init__(self, record: list):
        self._record = record

    def upload(self, *, path, file, file_options):
        self._record.append((path, file, file_options))

    def create_signed_url(self, path, ttl):  # pragma: no cover - must never be called
        raise AssertionError("uploads must not mint signed URLs")


class _FakeClient:
    def __init__(self):
        self.uploads: list = []
        self.storage = SimpleNamespace(from_=lambda bucket: _Bucket(self.uploads))


def _gateway_stub() -> SupabaseGateway:
    """SupabaseGateway with __init__ bypassed (no supabase-py, no network)."""
    gw = SupabaseGateway.__new__(SupabaseGateway)
    gw.client = _FakeClient()
    gw.settings = SimpleNamespace(reports_bucket="reports", pdfs_bucket="pdfs")
    return gw


def test_upload_report_returns_path_without_signing():
    gw = _gateway_stub()
    path = gw.upload_report("audit-1", "<html></html>")
    assert path == "audit-1.html"
    assert gw.client.uploads[0][0] == "audit-1.html"
    assert gw.client.uploads[0][2]["content-type"] == "text/html"


def test_upload_pdf_returns_path_without_signing():
    gw = _gateway_stub()
    path = gw.upload_pdf("audit-1", b"%PDF-1.4")
    assert path == "audit-1.pdf"
    assert gw.client.uploads[0][2]["content-type"] == "application/pdf"


class _FakeGateway:
    """Duck-typed gateway recording what the pipeline persists."""

    def __init__(self):
        self.audit_updates: list[dict] = []
        self.client = SimpleNamespace(
            table=lambda name: SimpleNamespace(
                select=lambda *a: SimpleNamespace(execute=lambda: SimpleNamespace(data=[]))
            )
        )

    def upload_report(self, audit_id: str, html: str) -> str:
        return f"{audit_id}.html"

    def update_audit(self, audit_id: str, **fields) -> None:
        self.audit_updates.append(fields)

    def emit_event(self, *a, **k) -> None:
        pass


def test_pipeline_persists_report_path_not_signed_urls(tmp_path):
    settings = _settings(generator="mock", output_dir=tmp_path, pdf_mode="stub")
    audit = AuditRecord(
        id="audit-paths-1",
        handle="hemalpatelphd",
        platform="instagram",
        goal="growth",
        context="UCSD professor, PhD",
    )
    gateway = _FakeGateway()
    pipeline = GenerationPipeline(settings, MockReportGenerator())
    summary = pipeline.run(audit, PrintEventSink(), gateway=gateway)

    assert summary.status == "ready"
    assert summary.report_path == "audit-paths-1.html"
    assert gateway.audit_updates, "pipeline must finalize the audit row"
    final = gateway.audit_updates[-1]
    assert final["report_path"] == "audit-paths-1.html"
    assert "report_url" not in final
    assert "pdf_url" not in final
