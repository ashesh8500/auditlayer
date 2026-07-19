"""Queue worker loop and generator factory."""

from __future__ import annotations

import time
import traceback

from .config import WorkerSettings
from .core import PROMPT_VERSION, AuditRecord
from .generation import HermesReportGenerator, MockReportGenerator, ReportGenerator
from .hermes_runtime import HermesRuntime
from .observability import log_event, start_health_server
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
    if settings.hermes_provider != "deepseek" or model != "deepseek-v4-flash":
        raise RuntimeError("AuditLayer generation requires DeepSeek V4 Flash")
    if settings.hermes_mode != "inprocess":
        raise RuntimeError("AuditLayer generation requires in-process bounded research")
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
    health = start_health_server(poll_interval_seconds=settings.poll_interval_seconds)
    log_event(
        "worker_started",
        poll_interval_seconds=settings.poll_interval_seconds,
        generator=settings.generator,
        hermes_mode=runtime.mode,
        pdf_mode=settings.pdf_mode,
    )

    try:
        while True:
            try:
                worked = _drain_once(settings, gateway, runtime)
                retried = gateway.sweep_retryable()
                if retried:
                    log_event("audits_requeued", count=retried)
                reaped = gateway.sweep_stale_running()
                if reaped:
                    log_event("stale_audits_reaped", count=reaped)
                runtime.tick_idle(worked)
                health.heartbeat(worked=worked)
            except Exception as exc:
                health.heartbeat(worked=False, error_type=type(exc).__name__)
                log_event("worker_loop_failed", level="error", error_type=type(exc).__name__)
                raise
            if once:
                return
            if not worked:
                _prewarm_account_homes(gateway, settings)
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
        log_event("audit_claimed", audit_id=audit.id, handle=audit.handle)
        summary = pipeline.run(audit, sink, gateway=gateway, token_cap=app_settings.token_cap,
                              cost_cap_usd=app_settings.cost_cap_usd)
        log_event(
            "audit_finished",
            audit_id=audit.id,
            status=summary.status,
            wall_clock_seconds=summary.wall_clock_seconds,
            tokens_in=summary.tokens_in,
            tokens_out=summary.tokens_out,
            cost_usd=summary.cost_usd,
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
    log_event(
        "refinement_claimed",
        refinement_id=refinement_id,
        audit_id=audit_id,
        section=section,
    )

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
        gateway.update_audit(audit_id, prompt_version=PROMPT_VERSION)
        sink.emit("refinement", f"Section '{section}' refined and re-uploaded")
    except Exception as exc:  # noqa: BLE001
        log_event(
            "refinement_failed",
            level="error",
            refinement_id=refinement_id,
            audit_id=audit_id,
            error_type=type(exc).__name__,
            traceback_tail=traceback.format_exc()[-500:],
        )
        public_error = "Refinement failed safely. The team has the diagnostic details."
        gateway.emit_event(
            audit_id,
            "failed",
            detail=public_error,
            event_type="error",
            actor="worker",
        )
        gateway.update_refinement(refinement_id, status="failed", error=public_error)


def _download_report(gateway: SupabaseGateway, settings: WorkerSettings, report_path: str | None) -> str:
    path = report_path or ""
    if not path:
        raise RuntimeError("audit has no report_path to refine")
    data = gateway.client.storage.from_(settings.reports_bucket).download(path)
    return data.decode("utf-8") if isinstance(data, (bytes, bytearray)) else str(data)


def _prewarm_account_homes(gateway: SupabaseGateway, settings: WorkerSettings) -> None:
    """Pre-create account homes for the next few queued audits.

    Called during idle cycles so the first audit after a quiet period
    doesn't pay filesystem setup cost on the critical path.
    """
    try:
        rows = (
            gateway.client.table("audits")
            .select("user_id")
            .eq("status", "queued")
            .not_.is_("user_id", "null")
            .order("created_at", desc=False)
            .limit(3)
            .execute()
        )
    except Exception as exc:
        log_event(
            "account_home_prewarm_query_failed",
            level="warning",
            error_type=type(exc).__name__,
        )
        return

    seen: set[str] = set()
    for row in rows.data or []:
        uid = str(row.get("user_id", ""))
        if uid and uid not in seen:
            seen.add(uid)
            try:
                from .account_homes import ensure_account_home
                ensure_account_home(uid, settings.alm_accounts_root)
            except Exception as exc:
                log_event(
                    "account_home_prewarm_failed",
                    level="warning",
                    user_id=uid,
                    error_type=type(exc).__name__,
                )
