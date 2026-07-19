"""Lightweight PDF worker — claims audits with pdf_status='pending',
renders the Chromium PDF, uploads to storage, and marks complete.

Runs in the background alongside the main audit workers. A single instance
is sufficient since PDF rendering is CPU-bound and Chromium is single-threaded.
"""

from __future__ import annotations

import time
import traceback
from pathlib import Path

from .config import WorkerSettings, load_env_files
from .observability import log_event
from .pipeline import _fetch_benchmark_cache
from .pdf import render_pdf
from .supabase_client import SupabaseGateway


def run_pdf_worker(settings: WorkerSettings, *, once: bool = False) -> None:
    gateway = SupabaseGateway(settings)
    log_event("pdf_worker_started", poll_interval_seconds=settings.poll_interval_seconds)

    try:
        while True:
            recovered = gateway.reap_stale_pdf_claims()
            if recovered.get("retried") or recovered.get("exhausted"):
                log_event("stale_pdf_claims_reaped", **recovered)
            claimed = _claim_and_render_one(gateway, settings)
            if once:
                return
            if not claimed:
                time.sleep(settings.poll_interval_seconds)
    finally:
        pass  # gateway has no explicit close


def _claim_and_render_one(gateway: SupabaseGateway, settings: WorkerSettings) -> bool:
    row = gateway.claim_next_pdf()
    if row is None:
        return False

    audit_id = str(row["id"])
    report_path = row.get("report_path") or ""

    try:
        html_data = (
            gateway.client.storage.from_(settings.reports_bucket)
            .download(report_path)
        )
        html = html_data.decode("utf-8") if isinstance(html_data, (bytes, bytearray)) else str(
            html_data
        )
    except Exception as exc:
        log_event(
            "pdf_source_download_failed",
            level="error",
            audit_id=audit_id,
            error_type=type(exc).__name__,
        )
        gateway.mark_pdf_attempt_failed(audit_id, type(exc).__name__)
        return True

    try:
        pdf_result = render_pdf(
            html, mode=settings.pdf_mode, chromium_path=settings.chromium_path
        )
        pdf_path, _ = gateway.upload_pdf(audit_id, pdf_result.data)
        gateway.client.table("audits").update(
            {
                "pdf_status": "ready",
                "pdf_path": pdf_path,
                "pdf_claimed_at": None,
                "pdf_claimed_by": None,
                "pdf_last_error": None,
            }
        ).eq("id", audit_id).execute()
        gateway.emit_event(
            audit_id,
            "succeeded",
            f"PDF ready ({len(pdf_result.data):,} bytes, {pdf_result.mode})",
            event_type="pdf_ready",
        )
        log_event(
            "pdf_ready",
            audit_id=audit_id,
            bytes=len(pdf_result.data),
            mode=pdf_result.mode,
        )
    except Exception as exc:
        log_event(
            "pdf_failed",
            level="error",
            audit_id=audit_id,
            error_type=type(exc).__name__,
            traceback_tail=traceback.format_exc()[-500:],
        )
        gateway.mark_pdf_attempt_failed(audit_id, type(exc).__name__)

    return True


if __name__ == "__main__":
    load_env_files()
    settings = WorkerSettings.from_env()
    run_pdf_worker(settings)
