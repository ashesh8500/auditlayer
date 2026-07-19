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
from .pipeline import _fetch_benchmark_cache
from .pdf import render_pdf
from .supabase_client import SupabaseGateway


def run_pdf_worker(settings: WorkerSettings, *, once: bool = False) -> None:
    gateway = SupabaseGateway(settings)
    print(f"[pdf-worker] connected; polling every {settings.poll_interval_seconds}s")

    try:
        while True:
            claimed = _claim_and_render_one(gateway, settings)
            if once:
                return
            if not claimed:
                time.sleep(settings.poll_interval_seconds)
    finally:
        pass  # gateway has no explicit close


def _claim_and_render_one(gateway: SupabaseGateway, settings: WorkerSettings) -> bool:
    res = (
        gateway.client.table("audits")
        .select("id, report_path")
        .eq("pdf_status", "pending")
        .order("created_at", ascending=True)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return False

    row = rows[0]
    audit_id = str(row["id"])
    report_path = row.get("report_path") or ""

    # Mark as generating so no other worker picks it up.
    gateway.client.table("audits").update({"pdf_status": "generating"}).eq(
        "id", audit_id
    ).execute()

    try:
        html_data = (
            gateway.client.storage.from_(settings.reports_bucket)
            .download(report_path)
        )
        html = html_data.decode("utf-8") if isinstance(html_data, (bytes, bytearray)) else str(
            html_data
        )
    except Exception as exc:
        print(f"[pdf-worker] failed to download HTML for {audit_id}: {exc}")
        gateway.client.table("audits").update({"pdf_status": "failed"}).eq(
            "id", audit_id
        ).execute()
        return True

    try:
        pdf_result = render_pdf(
            html, mode=settings.pdf_mode, chromium_path=settings.chromium_path
        )
        pdf_path = gateway.upload_pdf(audit_id, pdf_result.data)
        gateway.client.table("audits").update(
            {"pdf_status": "ready", "pdf_path": pdf_path}
        ).eq("id", audit_id).execute()
        gateway.emit_event(
            audit_id,
            "succeeded",
            f"PDF ready ({len(pdf_result.data):,} bytes, {pdf_result.mode})",
            event_type="pdf_ready",
        )
        print(f"[pdf-worker] {audit_id} PDF ready ({len(pdf_result.data):,} bytes)")
    except Exception as exc:
        print(f"[pdf-worker] {audit_id} PDF failed: {exc}\n{traceback.format_exc()[-500:]}")
        gateway.client.table("audits").update({"pdf_status": "failed"}).eq(
            "id", audit_id
        ).execute()
        gateway.emit_event(
            audit_id,
            "failed",
            "PDF generation failed. A founder has been notified.",
            event_type="error",
        )

    return True


if __name__ == "__main__":
    load_env_files()
    settings = WorkerSettings.from_env()
    run_pdf_worker(settings)
