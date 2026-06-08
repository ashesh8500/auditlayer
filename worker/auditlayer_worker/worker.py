"""Queue worker loop and generator factory."""

from __future__ import annotations

import time

from .config import WorkerSettings
from .core import AuditRecord
from .generation import HermesReportGenerator, MockReportGenerator, ReportGenerator
from .hermes_runtime import HermesRuntime
from .pipeline import GenerationPipeline, SupabaseEventSink
from .supabase_client import AppSettings, SupabaseGateway


def build_generator(
    settings: WorkerSettings,
    app_settings: AppSettings | None = None,
    *,
    runtime: HermesRuntime | None = None,
) -> ReportGenerator:
    if settings.generator == "mock":
        return MockReportGenerator(phase_interval=settings.phase_interval_seconds)

    model = app_settings.hermes_model if app_settings else settings.hermes_model
    toolsets = app_settings.enabled_toolsets if app_settings else settings.enabled_toolsets
    hermes_runtime = runtime or HermesRuntime(settings)
    client = hermes_runtime.build_client()
    interval = settings.phase_interval_seconds or 20.0
    return HermesReportGenerator(
        client=client,
        model=model,
        toolsets=toolsets,
        max_tokens=settings.max_tokens,
        temperature=settings.temperature,
        phase_interval=interval,
    )


def run_worker_loop(settings: WorkerSettings, *, once: bool = False) -> None:
    gateway = SupabaseGateway(settings)
    runtime = HermesRuntime(settings)
    print(f"[worker] connected to Supabase; polling every {settings.poll_interval_seconds}s")
    print(f"[worker] generator={settings.generator} hermes_mode={runtime.mode} pdf_mode={settings.pdf_mode}")

    try:
        while True:
            worked = _drain_once(settings, gateway, runtime)
            runtime.tick_idle(worked)
            if once:
                return
            if not worked:
                time.sleep(settings.poll_interval_seconds)
    finally:
        runtime.shutdown()


def _drain_once(
    settings: WorkerSettings, gateway: SupabaseGateway, runtime: HermesRuntime
) -> bool:
    app_settings = gateway.get_app_settings()
    generator = build_generator(settings, app_settings, runtime=runtime)
    pipeline = GenerationPipeline(settings, generator)

    audit_row = gateway.claim_next_queued()
    if audit_row is not None:
        audit = AuditRecord.from_row(audit_row)
        sink = SupabaseEventSink(gateway, audit.id)
        print(f"[worker] claimed audit {audit.id} @{audit.handle}")
        summary = pipeline.run(audit, sink, gateway=gateway)
        print(
            f"[worker] audit {audit.id} -> {summary.status} "
            f"({summary.wall_clock_seconds}s, {summary.tokens_in}+{summary.tokens_out} tok, "
            f"${summary.cost_usd:.2f})"
        )
        return True

    refinement_row = gateway.claim_next_refinement()
    if refinement_row is not None:
        _process_refinement(settings, gateway, pipeline, refinement_row)
        return True

    return False


def _process_refinement(
    settings: WorkerSettings, gateway: SupabaseGateway, pipeline: GenerationPipeline, row: dict
) -> None:
    refinement_id = str(row["id"])
    audit_id = str(row["audit_id"])
    section = row.get("section", "")
    instruction = row.get("instruction", "")
    print(f"[worker] claimed refinement {refinement_id} (audit {audit_id}, section '{section}')")

    audit_res = gateway.client.table("audits").select("*").eq("id", audit_id).limit(1).execute()
    audit_rows = audit_res.data or []
    if not audit_rows:
        gateway.update_refinement(refinement_id, status="failed", error="audit not found")
        return
    audit = AuditRecord.from_row(audit_rows[0])
    report_path = audit_rows[0].get("report_path")

    sink = SupabaseEventSink(gateway, audit_id)
    try:
        current_html = _download_report(gateway, settings, report_path)
        new_html, _t_in, _t_out = pipeline.refine(audit, current_html, section, instruction, sink)
        gateway.upload_report(audit_id, new_html)
        gateway.update_refinement(refinement_id, status="done", error="")
        sink.emit("refinement", f"Section '{section}' refined and re-uploaded")
    except Exception as exc:  # noqa: BLE001
        gateway.update_refinement(refinement_id, status="failed", error=str(exc)[:500])
        sink.emit("failed", f"Refinement error: {exc}")


def _download_report(gateway: SupabaseGateway, settings: WorkerSettings, report_path: str | None) -> str:
    path = report_path or ""
    if not path:
        raise RuntimeError("audit has no report_path to refine")
    data = gateway.client.storage.from_(settings.reports_bucket).download(path)
    return data.decode("utf-8") if isinstance(data, (bytes, bytearray)) else str(data)
