from dataclasses import replace

import pytest

from auditlayer_worker.core import AuditRecord
from auditlayer_worker.generation import GenerationStageError, MockReportGenerator
from auditlayer_worker.pipeline import GenerationPipeline, PrintEventSink
from test_openrouter_production import settings


@pytest.mark.parametrize("failed", [False, True])
def test_pipeline_records_provider_cost_not_token_rate(settings, tmp_path, failed):
    class Generator(MockReportGenerator):
        def generate(self, *args, **kwargs):
            result = super().generate(*args, **kwargs)
            timing = {"_inference": [{"cost_usd": 0.007, "cost_source": "provider_actual",
                       "provider": "openrouter", "tokens_in": 100, "tokens_out": 50}]}
            if failed:
                raise GenerationStageError(stage="analysis", error_code="provider_failed", retryable=False,
                                           stage_timings=timing, tokens_in=100, tokens_out=50)
            return replace(result, tokens_in=100, tokens_out=50, stage_timings=timing)
    config = replace(settings, generator="mock", output_dir=tmp_path,
                     alm_accounts_root=str(tmp_path / "accounts"))
    summary = GenerationPipeline(config, Generator()).run(
        AuditRecord(id="cost-audit", handle="example", platform="youtube", goal="growth"),
        PrintEventSink(), persist_report=False)
    assert summary.cost_usd == 0.127
    assert summary.stage_timings["_inference"][0]["cost_source"] == "provider_actual"


def test_post_call_cap_preserves_receipts(settings, tmp_path):
    class Generator(MockReportGenerator):
        def generate(self, *args, **kwargs):
            return replace(super().generate(*args, **kwargs), stage_timings={"_inference": [{"cost_usd": 0.007, "cost_source": "provider_actual"}]})
    config = replace(settings, generator="mock", output_dir=tmp_path, alm_accounts_root=str(tmp_path / "accounts"))
    summary = GenerationPipeline(config, Generator()).run(
        AuditRecord(id="cap", handle="example", platform="youtube", goal="growth"),
        PrintEventSink(), persist_report=False, token_cap=1)
    assert summary.status == "blocked"
    assert summary.stage_timings["_inference"][0]["cost_usd"] == 0.007


def test_unverified_data_only_report_is_never_qualified_success(settings, tmp_path):
    class Generator(MockReportGenerator):
        def generate(self, *args, **kwargs):
            return replace(super().generate(*args, **kwargs), evidence_qualified=False)
    config = replace(settings, generator="mock", output_dir=tmp_path, alm_accounts_root=str(tmp_path / "accounts"))
    summary = GenerationPipeline(config, Generator()).run(
        AuditRecord(id="unverified", handle="example", platform="youtube", goal="growth"),
        PrintEventSink(), persist_report=False)
    assert summary.status == "needs_review"
    assert summary.quality_score == 0


def test_pipeline_binds_durable_inference_recorder(settings, tmp_path, monkeypatch):
    from unittest.mock import MagicMock
    from auditlayer_worker.hermes_inprocess import InProcessHermesClient
    class Generator(MockReportGenerator):
        client = InProcessHermesClient(settings)
        def generate(self, *args, **kwargs):
            self.client._record_inference({"attempt_id": "attempt-1", "status": "reserved"})
            return super().generate(*args, **kwargs)
    gateway = MagicMock()
    gateway.start_report_generation_run.return_value = "run-1"
    gateway.upload_report.return_value = ("private/report.html", "")
    gateway.finalize_initial_report.return_value = 1
    monkeypatch.setattr("auditlayer_worker.pipeline._fetch_benchmark_cache", lambda _: [])
    config = replace(settings, generator="mock", output_dir=tmp_path, alm_accounts_root=str(tmp_path / "accounts"))
    GenerationPipeline(config, Generator()).run(
        AuditRecord(id="durable", handle="example", platform="youtube", goal="growth"),
        PrintEventSink(), gateway=gateway)
    gateway.record_report_inference_calls.assert_called_once_with("run-1", [{"attempt_id": "attempt-1", "status": "reserved"}])


@pytest.mark.parametrize("failed", [False, True])
def test_refinement_usage_callback_records_provider_actual(settings, tmp_path, monkeypatch, failed):
    from types import SimpleNamespace
    from test_refinement_bundle_lineage import _Gateway
    from auditlayer_worker import worker
    gateway = _Gateway({"id": "audit-1", "handle": "example", "platform": "youtube", "goal": "growth", "report_path": "old"})
    def refine(*args, **kwargs):
        if failed:
            from auditlayer_worker.openrouter import ProviderCallError
            raise ProviderCallError("openrouter_response_rejected", {"cost_usd": 0.004, "cost_source": "provider_actual", "usage_status": "actual", "tokens_in": 100, "tokens_out": 50})
        kwargs["usage_callback"](100, 50, False, {"cost_usd": 0.004, "cost_source": "provider_actual", "usage_status": "actual"})
        return "<html>refined</html>", 100, 50
    monkeypatch.setattr(worker, "_download_report", lambda *_: "<html>old</html>")
    assert worker._process_refinement_attempt(settings, gateway, SimpleNamespace(refine=refine),
        {"id": "ref-1", "audit_id": "audit-1", "section": "Key Gaps"}) is (not failed)
    usage = next(payload[1] for name, payload in gateway.calls if name == "update_refinement")
    assert usage["cost_usd"] == 0.004
