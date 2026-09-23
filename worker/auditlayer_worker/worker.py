"""Queue worker loop and generator factory."""

from __future__ import annotations

from datetime import datetime, timezone
import random
import time
import traceback

import httpx
from postgrest.exceptions import APIError

from .account_homes import get_report_bundle_version
from .billing import estimate_cost
from .generation import GenerationStageError
from .config import WorkerSettings
from .core import PROMPT_VERSION, AuditRecord
from .generation import HermesReportGenerator, MockReportGenerator, ReportGenerator
from .hermes_runtime import HermesRuntime
from .hermes_inprocess import run_bounded_refinement
from .observability import WorkerHealth, log_event, start_health_server
from .pipeline import GenerationPipeline, SupabaseEventSink
from .supabase_client import AppSettings, SupabaseGateway, ReportFinalizationRejected


# An observation budget, not an enforced provider timeout. Covers generation,
# correction and finalization; cannot be renewed by phase/event heartbeats.
# Exceeding it reports 503 but does not interrupt an ambiguous finalization.
ACTIVE_JOB_HEALTH_BUDGET_SECONDS = 900.0


def build_generator(
    settings: WorkerSettings,
    app_settings: AppSettings | None = None,
    *,
    runtime: HermesRuntime | None = None,
) -> ReportGenerator:
    if settings.generator == "mock":
        return MockReportGenerator(phase_interval=settings.phase_interval_seconds)

    model = app_settings.hermes_model if app_settings else settings.hermes_model
    from .openrouter import MODEL
    if settings.hermes_provider == "openrouter":
        model = settings.hermes_model  # Product pin, never a mutable admin/coding default.
    if (settings.hermes_provider, model) not in {("deepseek", "deepseek-v4-flash"), ("openrouter", MODEL)}:
        raise RuntimeError("AuditLayer generation requires DeepSeek V4 Flash")
    if settings.hermes_mode != "inprocess":
        raise RuntimeError("AuditLayer generation requires in-process bounded research")
    toolsets = app_settings.enabled_toolsets if app_settings else settings.enabled_toolsets
    hermes_runtime = runtime or HermesRuntime(settings)
    client = hermes_runtime.build_client()
    if settings.hermes_provider == "openrouter" and app_settings is not None:
        from dataclasses import replace
        client.settings = replace(client.settings,
            token_cap=min(settings.token_cap, app_settings.token_cap),
            cost_cap_usd=min(settings.cost_cap_usd, app_settings.cost_cap_usd))
    interval = settings.phase_interval_seconds or 20.0
    return HermesReportGenerator(
        client=client,
        model=model,
        toolsets=toolsets,
        max_tokens=settings.max_tokens,
        temperature=settings.temperature,
        phase_interval=interval,
    )


def _is_transient_control_plane_error(exc: Exception) -> bool:
    # Do not catch all TransportError/OSError: local protocol, configuration,
    # filesystem permissions and programming failures need operator correction.
    if isinstance(exc, (httpx.NetworkError, httpx.TimeoutException, httpx.RemoteProtocolError)):
        return True
    # PostgREST wraps non-JSON HTTP errors using a numeric (or string) code.
    # PGRST003 is pool acquisition timeout. Unknown/schema/auth codes stay fatal.
    if isinstance(exc, APIError):
        return str(exc.code) in {"408", "429", "500", "502", "503", "504", "PGRST003"}
    return isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in {
        408, 429, 500, 502, 503, 504,
    }


def run_worker_loop(settings: WorkerSettings, *, once: bool = False) -> None:
    gateway = SupabaseGateway(settings)
    runtime = HermesRuntime(settings)
    health = start_health_server(poll_interval_seconds=settings.poll_interval_seconds)
    log_event(
        "worker_started",
        poll_interval_seconds=settings.poll_interval_seconds,
        generator=settings.generator,
        hermes_mode=runtime.mode,
    )

    consecutive_failures = 0
    try:
        while True:
            try:
                # Opt-in control-plane only; SQL queues the canonical executor.
                # No scheduler or mail work runs from customer resource reads.
                import os
                from .brand_update_workflow import scheduler_tick
                scheduler_tick(gateway, enabled=os.environ.get("ALM_BRAND_WORKFLOWS_ENABLED") == "1")
                worked = _drain_once(settings, gateway, runtime, health=health)
                retried = gateway.sweep_retryable()
                if retried:
                    log_event("audits_requeued", count=retried)
                reaped = gateway.sweep_stale_running()
                if reaped:
                    log_event("stale_audits_reaped", count=reaped)
                crashed_runs = gateway.sweep_stale_report_generation_runs()
                if crashed_runs:
                    log_event("stale_generation_runs_reaped", count=crashed_runs)
                gateway.sweep_stale_refinements()
                runtime.tick_idle(worked)
                # A returned failed job is not a successful health recovery.
                # A subsequent successful idle poll or job can recover health.
                health.heartbeat(
                    worked=worked, error_type=health.last_error_type if worked else "",
                )
                if consecutive_failures:
                    log_event("worker_loop_recovered", consecutive_failures=consecutive_failures)
                consecutive_failures = 0
            except Exception as exc:
                health.heartbeat(worked=False, error_type=type(exc).__name__)
                log_event("worker_loop_failed", level="error", error_type=type(exc).__name__)
                if once or not _is_transient_control_plane_error(exc):
                    raise
                consecutive_failures += 1
                ceiling = min(30.0, 2.0 ** min(consecutive_failures - 1, 5))
                delay = random.uniform(ceiling / 2, ceiling)
                log_event("worker_loop_retrying", level="warning",
                          error_type=type(exc).__name__,
                          consecutive_failures=consecutive_failures,
                          retry_after_seconds=delay)
                # Start a fresh atomic claim; never replay a claimed job or a
                # possibly committed write after losing its response.
                time.sleep(delay)
                continue
            if once:
                return
            if not worked:
                _prewarm_account_homes(gateway, settings)
                time.sleep(settings.poll_interval_seconds)
    finally:
        runtime.shutdown()


def _drain_once(
    settings: WorkerSettings, gateway: SupabaseGateway, runtime: HermesRuntime,
    *, health: WorkerHealth,
) -> bool:
    app_settings = gateway.get_app_settings()
    generator = build_generator(settings, app_settings, runtime=runtime)
    pipeline = GenerationPipeline(settings, generator)

    audit_row = gateway.claim_next_queued()
    if audit_row is not None:
        health.start_job(kind="audit", budget_seconds=ACTIVE_JOB_HEALTH_BUDGET_SECONDS)
        error_type = "AuditJobInterrupted"
        try:
            audit = AuditRecord.from_row(audit_row)
            sink = SupabaseEventSink(gateway, audit.id)
            log_event("audit_claimed", audit_id=audit.id, handle=audit.handle)
            pin = gateway.commercial_execution_claim(audit.id, settings.hermes_model)
            run_settings = settings
            if pin is not None:
                from .commercial import pinned_settings, terminal_payload
                try:
                    run_settings = pinned_settings(settings, app_settings, pin)
                except RuntimeError as exc:
                    if not pin.get('research_policy'):
                        raise
                    # Admission has claimed the quote, but no provider dispatch
                    # or generator exists yet. Terminal zero is known here only.
                    gateway.update_audit(audit.id, status='blocked', admin_notes=str(exc))
                    gateway.emit_event(audit.id, 'failed', str(exc), event_type='research_admission_rejected')
                    gateway.commercial_execution_finish(pin['reservation_id'], terminal_payload(
                        audit.id, settings.worker_id, pin, None, []))
                    error_type = 'ResearchAdmissionRejected'
                    return True
                audit.context = gateway.commercial_brief_context(audit_row, pin)
                # A fresh client is essential: no inherited reservation or mutable
                # settings from the legacy runtime. No research occurs in build.
                generator = build_generator(run_settings, app_settings)
                pipeline = GenerationPipeline(run_settings, generator)
            summary = pipeline.run(audit, sink, gateway=gateway,
                                   token_cap=run_settings.token_cap if pin is not None else app_settings.token_cap,
                                   cost_cap_usd=run_settings.cost_cap_usd if pin is not None else app_settings.cost_cap_usd)
            if pin is not None and summary.status in {"ready", "needs_review", "failed", "blocked"}:
                calls = generator.client._inference_receipts
                gateway.commercial_execution_finish(pin["reservation_id"], terminal_payload(
                    audit.id, settings.worker_id, pin, summary, calls))
            # An ambiguous finalization returns running: retain the hold, do not
            # settle or replay. Existing immutable-version reconciliation owns it.
            error_type = "" if summary.status in {"ready", "needs_review"} else "AuditJobFailed"
        finally:
            health.end_job(error_type=error_type)
        log_event(
            "audit_finished",
            audit_id=audit.id,
            status=summary.status,
            wall_clock_seconds=summary.wall_clock_seconds,
            tokens_in=summary.tokens_in,
            tokens_out=summary.tokens_out,
            cost_usd=summary.cost_usd,
            quality_score=summary.quality_score,
            account_mode=summary.account_mode,
            cache_mode=summary.cache_mode,
            stage_timings=summary.stage_timings,
        )
        return True

    refinement_row = gateway.claim_next_refinement()
    if refinement_row is not None:
        health.start_job(kind="refinement", budget_seconds=ACTIVE_JOB_HEALTH_BUDGET_SECONDS)
        error_type = "RefinementJobInterrupted"
        try:
            succeeded = _process_refinement(settings, gateway, pipeline, refinement_row)
            error_type = "" if succeeded else "RefinementJobFailed"
        finally:
            health.end_job(error_type=error_type)
        return True

    return False


REFINEMENT_TOTAL_SECONDS = 900.0
REFINEMENT_LEASE_RESERVE_SECONDS = 180.0


def _process_refinement(
    settings: WorkerSettings, gateway: SupabaseGateway, pipeline: GenerationPipeline, row: dict
) -> bool:
    # Keep the queue API stable, but never reuse parent HTTP pools in a fork.
    del gateway, pipeline
    started = time.monotonic()
    try:
        expires = datetime.fromisoformat(str(row['lease_expires_at']).replace('Z', '+00:00'))
        remaining = (expires - datetime.now(timezone.utc)).total_seconds()
        budget = min(REFINEMENT_TOTAL_SECONDS, remaining - REFINEMENT_LEASE_RESERVE_SECONDS)
        if budget <= 0:
            raise TimeoutError('Insufficient refinement lease remaining')
        return run_bounded_refinement(
            lambda: _refinement_child_attempt(settings, row), deadline=started + budget,
        )
    except (TimeoutError, KeyError, ValueError, TypeError, RuntimeError) as exc:
        # Do not issue unbounded control-plane I/O after containment. A commit
        # might have happened: leave done/known usage intact, unknown spend NULL.
        # The existing fenced reaper reconciles source identity or fails terminally;
        # it never requeues this paid attempt. Siblings stay excluded until then.
        log_event('refinement_contained', level='error', refinement_id=str(row['id']),
                  error_type=type(exc).__name__)
        return False


def _refinement_child_attempt(settings: WorkerSettings, row: dict) -> bool:
    gateway = SupabaseGateway(settings)
    runtime = HermesRuntime(settings)
    try:
        generator = build_generator(settings, gateway.get_app_settings(), runtime=runtime)
        return _process_refinement_attempt(settings, gateway, GenerationPipeline(settings, generator), row)
    finally:
        runtime.shutdown()


def _process_refinement_attempt(
    settings: WorkerSettings, gateway: SupabaseGateway, pipeline: GenerationPipeline, row: dict
) -> bool:
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
        return False
    audit = AuditRecord.from_row(audit_rows[0])
    report_path = audit_rows[0].get("report_path")

    sink = SupabaseEventSink(gateway, audit_id)
    finalization_started = False
    refinement_run_id = None
    refinement_started = time.monotonic()

    def finish_refinement_run(status):
        if refinement_run_id is None:
            return
        try:
            calls = client._inference_receipts
            gateway.finish_report_generation_run(
                refinement_run_id, status=status,
                total_seconds=time.monotonic() - refinement_started,
                stage_timings={"_inference": calls},
                tokens_in=sum(c.get("tokens_in") or 0 for c in calls),
                tokens_out=sum(c.get("tokens_out") or 0 for c in calls),
                cost_usd=sum(c.get("cost_usd") or 0 for c in calls))
        except Exception as exc:
            log_event("refinement_metrics_finish_failed", level="warning",
                      refinement_id=refinement_id, error_type=type(exc).__name__)

    def record_usage(tokens_in, tokens_out, estimated, telemetry=None):
        cost = estimate_cost(tokens_in, tokens_out, settings.price_in_per_mtok,
                             settings.price_out_per_mtok, data_api_allowance_usd=0,
                             inference_calls=[telemetry] if telemetry else None)
        unknown = bool(telemetry and telemetry.get("cost_source") == "unknown")
        estimated = estimated or bool(telemetry and telemetry.get("cost_source") == "rate_estimated")
        if telemetry:
            from .openrouter import safe_receipts
            log_event("refinement_inference_receipt", refinement_id=refinement_id,
                      audit_id=audit_id, inference=safe_receipts([telemetry]))
        gateway.update_refinement(refinement_id, tokens_in=tokens_in, tokens_out=tokens_out,
                                  cost_usd=None if unknown else cost.total_usd, usage_estimated=estimated or unknown,
                                  usage_status="unknown" if unknown else "estimated" if estimated else "reported")
    try:
        if row.get("base_report_version") is not None and row["base_report_version"] != audit.report_version:
            raise ValueError("refinement base report changed before inference")
        if row.get("lease_expires_at") and datetime.fromisoformat(row["lease_expires_at"].replace("Z", "+00:00")) <= datetime.now(timezone.utc):
            raise ValueError("refinement lease expired before inference")
        from .hermes_inprocess import InProcessHermesClient
        client = getattr(getattr(pipeline, "generator", None), "client", None)
        if isinstance(client, InProcessHermesClient) and settings.hermes_provider == "openrouter":
            refinement_run_id = gateway.start_report_generation_run(
                audit_id=None, refinement_id=refinement_id, worker_id=settings.worker_id,
                report_type="refinement", model=settings.hermes_model,
                prompt_version=PROMPT_VERSION, bundle_version=get_report_bundle_version(settings.alm_profile_bundle_root),
                cache_mode="fresh")
            client.begin_inference_run("refinement-" + refinement_id)
            client.inference_recorder = lambda calls: gateway.record_report_inference_calls(refinement_run_id, calls)
        current_html = _download_report(gateway, settings, report_path)
        new_html, _t_in, _t_out = pipeline.refine(audit, current_html, section, instruction, sink, usage_callback=record_usage)
        new_report_path, _ = gateway.upload_report(audit_id, new_html)
        finalization_started = True
        new_version = gateway.finalize_refinement_report(
            audit_id=audit_id,
            refinement_id=refinement_id,
            report_path=new_report_path,
            prompt_version=PROMPT_VERSION,
            agent_bundle_version=get_report_bundle_version(settings.alm_profile_bundle_root),
            changed_section=section,
            change_summary=instruction,
        )
        finish_refinement_run("ready")
        sink.emit(
            "refinement",
            f"Section '{section}' saved as report version {new_version}",
        )
        return True
    except Exception as exc:  # noqa: BLE001
        if finalization_started and not isinstance(exc, ReportFinalizationRejected):
            # The RPC may have committed (or only the subsequent event failed).
            # Never overwrite done with failed or replay generation. Leave the
            # row for reconciliation and let the loop classify the exception.
            raise
        log_event(
            "refinement_failed",
            level="error",
            refinement_id=refinement_id,
            audit_id=audit_id,
            error_type=type(exc).__name__,
            traceback_tail=traceback.format_exc()[-500:],
        )
        from .openrouter import ProviderCallError
        if isinstance(exc, ProviderCallError):
            receipt = exc.telemetry
            record_usage(receipt.get("tokens_in") or 0, receipt.get("tokens_out") or 0,
                         receipt.get("usage_status") != "actual", receipt)
        elif isinstance(exc, GenerationStageError):
            receipts = exc.stage_timings.get("_inference") or []
            record_usage(exc.tokens_in, exc.tokens_out, getattr(exc, "usage_estimated", True),
                         receipts[-1] if receipts else None)
        public_error = "Refinement failed safely. The previous report is retained."
        gateway.emit_event(
            audit_id,
            "failed",
            detail=public_error,
            event_type="error",
            actor="worker",
        )
        gateway.update_refinement(refinement_id, status="failed", error=public_error)
        finish_refinement_run("failed")
        return False


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
                ensure_account_home(
                    uid,
                    settings.alm_accounts_root,
                    settings.alm_profile_bundle_root,
                )
            except Exception as exc:
                log_event(
                    "account_home_prewarm_failed",
                    level="warning",
                    user_id=uid,
                    error_type=type(exc).__name__,
                )
