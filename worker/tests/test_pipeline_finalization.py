from dataclasses import replace

from auditlayer_worker.config import WorkerSettings
from auditlayer_worker.core import AuditRecord, Plan
from auditlayer_worker.generation import GenerationStageError, MockReportGenerator
from auditlayer_worker.pipeline import GenerationPipeline, PrintEventSink


def test_database_finalization_failure_never_announces_ready(monkeypatch, tmp_path) -> None:
    settings = replace(
        WorkerSettings.from_env(),
        output_dir=tmp_path,
        phase_interval_seconds=0,
        generator="mock",
        alm_accounts_root=str(tmp_path / "accounts"),
    )
    audit = AuditRecord(
        id="finalize-fail-1",
        handle="creator",
        platform="youtube",
        goal="growth",
        plan=Plan.STARTER.value,
    )

    class Gateway:
        def __init__(self) -> None:
            self.updates = []

        def upload_report(self, audit_id: str, html: str, *, version: int | None = None):
            assert audit_id == audit.id
            assert "</html>" in html
            assert version == 1
            return (f"{audit_id}/v{version}.html", "")

        def update_audit(self, audit_id: str, **fields):
            self.updates.append((audit_id, fields))

        def finalize_initial_report(self, **_fields):
            raise RuntimeError("database unavailable")

    monkeypatch.setattr("auditlayer_worker.pipeline._fetch_benchmark_cache", lambda _gw: [])
    sink = PrintEventSink()

    gateway = Gateway()
    summary = GenerationPipeline(settings, MockReportGenerator()).run(
        audit,
        sink,
        gateway=gateway,
    )

    assert summary.status == "failed"
    phases = [phase for _, phase, _ in sink.events]
    assert "succeeded" not in phases
    assert phases[-1] == "failed"
    assert summary.report_path == "finalize-fail-1/v1.html"
    assert gateway.updates[-1][1]["status"] == "failed"


def test_retryable_generation_failure_persists_research_checkpoint_and_metrics(
    monkeypatch, tmp_path
) -> None:
    settings = replace(
        WorkerSettings.from_env(),
        output_dir=tmp_path,
        phase_interval_seconds=0,
        generator="hermes",
        hermes_provider="deepseek",
        hermes_model="deepseek-v4-flash",
        alm_accounts_root=str(tmp_path / "accounts"),
    )
    audit = AuditRecord(
        id="checkpoint-fail-1",
        handle="creator",
        platform="youtube",
        goal="growth",
        plan=Plan.STARTER.value,
    )

    class FailingGenerator:
        model = "deepseek-v4-flash"

        def generate(self, *_args, **_kwargs):
            cause = TimeoutError("provider stalled")
            error = GenerationStageError(
                stage="analysis",
                error_code="analysis_timeout",
                retryable=True,
                research_cache='{"web":[{"url":"https://example.com"}]}',
                stage_timings={"research": 1.2, "analysis": 150.0},
                tokens_in=900,
                tokens_out=0,
            )
            raise error from cause

        def refine(self, *_args, **_kwargs):
            raise AssertionError("not reached")

    class Gateway:
        def __init__(self) -> None:
            self.updates = []
            self.finished = []

        def start_report_generation_run(self, **_fields):
            return "run-1"

        def finish_report_generation_run(self, run_id, **fields):
            self.finished.append((run_id, fields))

        def update_audit(self, audit_id: str, **fields):
            self.updates.append((audit_id, fields))

        def emit_event(self, *_args, **_kwargs):
            return None

    monkeypatch.setattr("auditlayer_worker.pipeline._fetch_benchmark_cache", lambda _gw: [])
    monkeypatch.setattr("auditlayer_worker.pipeline._check_account_cache", lambda *_args: None)
    gateway = Gateway()

    summary = GenerationPipeline(settings, FailingGenerator()).run(
        audit,
        PrintEventSink(),
        gateway=gateway,
    )

    assert summary.status == "failed"
    assert summary.note == "analysis_timeout"
    assert gateway.updates[-1][1]["research_cache"].startswith('{"web"')
    assert gateway.updates[-1][1]["admin_notes"] == (
        "analysis_timeout at analysis; cause=TimeoutError"
    )
    assert gateway.finished == [
        (
            "run-1",
            {
                "status": "failed",
                "total_seconds": gateway.finished[0][1]["total_seconds"],
                "stage_timings": {"research": 1.2, "analysis": 150.0},
                "tokens_in": 900,
                "tokens_out": 0,
                "cost_usd": gateway.finished[0][1]["cost_usd"],
                "research_cache_used": False,
                "error_code": "analysis_timeout",
            },
        )
    ]


def test_benchmark_mode_writes_local_artifact_and_never_mutates_customer_rows(
    monkeypatch, tmp_path
) -> None:
    settings = replace(
        WorkerSettings.from_env(),
        output_dir=tmp_path,
        phase_interval_seconds=0,
        generator="mock",
        alm_accounts_root=str(tmp_path / "accounts"),
    )
    audit = AuditRecord(
        id="benchmark-local-1",
        handle="business",
        platform="youtube",
        goal="growth",
        plan=Plan.ENTERPRISE.value,
        report_type="standard",
        force_refresh=True,
    )

    class Gateway:
        def __init__(self) -> None:
            self.started = []
            self.finished = []

        def start_report_generation_run(self, **fields):
            self.started.append(fields)
            return "benchmark-run-1"

        def finish_report_generation_run(self, run_id, **fields):
            self.finished.append((run_id, fields))

        def upload_report(self, *_args, **_kwargs):
            raise AssertionError("benchmark must not upload a customer report")

        def update_audit(self, *_args, **_kwargs):
            raise AssertionError("benchmark must not update a customer audit")

        def finalize_initial_report(self, **_kwargs):
            raise AssertionError("benchmark must not finalize a customer audit")

    monkeypatch.setattr("auditlayer_worker.pipeline._fetch_benchmark_cache", lambda _gw: [])
    gateway = Gateway()

    summary = GenerationPipeline(settings, MockReportGenerator()).run(
        audit,
        PrintEventSink(),
        gateway=gateway,
        enforce_gate=False,
        persist_report=False,
        run_kind="benchmark",
    )

    assert summary.status == "ready"
    assert summary.report_path == str(tmp_path / "benchmark-local-1.html")
    assert gateway.started[0]["audit_id"] is None
    assert gateway.started[0]["run_kind"] == "benchmark"
    assert gateway.finished[0][1]["status"] == "ready"
