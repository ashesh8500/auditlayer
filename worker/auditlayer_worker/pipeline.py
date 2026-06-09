"""Generation pipeline: turn a claimed audit into a stored, billed report.

Emits the shared granular event phases so the frontend can render a live
agentic timeline:

    started -> researching -> metrics -> peers -> scoring -> composing
            -> uploaded -> succeeded   (or -> failed)

The same code path serves the Supabase-backed worker and the standalone demo;
only the ``EventSink`` and storage differ.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
import time
from typing import Protocol

from .billing import estimate_cost
from .config import WorkerSettings
from .core import (
    AuditRecord,
    AuditStatus,
    Goal,
    Plan,
    Platform,
    evaluate_intake,
    next_milestone,
    replace_section,
)
from .generation import ReportGenerator
from .supabase_client import _utcnow


class EventSink(Protocol):
    def emit(self, phase: str, detail: str = "") -> None: ...


@dataclass
class PrintEventSink:
    """Prints events to stdout and records them (used by the demo)."""

    events: list[tuple[str, str, str]] = field(default_factory=list)

    def emit(self, phase: str, detail: str = "") -> None:
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
        self.events.append((ts, phase, detail))
        suffix = f" - {detail}" if detail else ""
        print(f"  [{ts}] {phase:<12}{suffix}", flush=True)


class SupabaseEventSink:
    def __init__(self, gateway, audit_id: str):
        self.gateway = gateway
        self.audit_id = audit_id

    def emit(self, phase: str, detail: str = "") -> None:
        self.gateway.emit_event(self.audit_id, phase, detail)


@dataclass
class RunSummary:
    audit_id: str
    status: str
    wall_clock_seconds: float
    tokens_in: int
    tokens_out: int
    cost_usd: float
    model: str
    estimated_tokens: bool
    report_path: str | None = None
    report_url: str | None = None
    pdf_url: str | None = None
    pdf_mode: str | None = None
    note: str = ""


def _plan_from(value: str | None) -> Plan:
    try:
        return Plan(value) if value else Plan.FREE
    except ValueError:
        return Plan.FREE


def recalibrate(audit: AuditRecord) -> AuditStatus:
    """Re-apply intake calibration as a worker-side gate.

    Returns the status the worker should honor. Only hard-blocks on BLOCKED
    (empty handle, plan limit reached). Does NOT gate on NEEDS_REVIEW — if the
    audit was explicitly queued by founder approval, the worker trusts that
    decision and does not re-block on platform uncertainty.
    """
    decision = evaluate_intake(
        handle=audit.handle,
        goal=audit.goal,
        context=audit.context,
        plan=Plan.FREE,
        platform=Platform(audit.platform) if audit.platform in Platform._value2member_map_ else Platform.UNKNOWN,
    )
    # Merge any new limitations the calibration surfaced.
    for lim in decision.limitations:
        if lim not in audit.limitations:
            audit.limitations.append(lim)
    if not audit.milestone_label:
        audit.milestone_label = decision.milestone_label or next_milestone(None)
    return decision.status


class GenerationPipeline:
    def __init__(self, settings: WorkerSettings, generator: ReportGenerator):
        self.settings = settings
        self.generator = generator

    def run(
        self,
        audit: AuditRecord,
        sink: EventSink,
        *,
        gateway=None,
        enforce_gate: bool = True,
    ) -> RunSummary:
        started_at = time.monotonic()
        sink.emit("started", f"Worker claimed audit for @{audit.handle} ({audit.goal})")

        if enforce_gate:
            gate = recalibrate(audit)
            # Only hard-block on truly invalid audits (empty handle, plan limit).
            # NEEDS_REVIEW (unknown platform) is a soft gate — if the audit was
            # explicitly queued by founder approval, the worker trusts that decision.
            if gate == AuditStatus.BLOCKED:
                note = "Hard-blocked by intake calibration"
                sink.emit("failed", note)
                if gateway is not None:
                    gateway.update_audit(
                        audit.id,
                        status=gate.value,
                        limitations=audit.limitations,
                        milestone_label=audit.milestone_label,
                    )
                return RunSummary(
                    audit_id=audit.id,
                    status=gate.value,
                    wall_clock_seconds=round(time.monotonic() - started_at, 2),
                    tokens_in=0,
                    tokens_out=0,
                    cost_usd=0.0,
                    model="-",
                    estimated_tokens=False,
                    note=note,
                )

        # Fetch live Instagram data if the client has connected their account
        ig_metrics = None
        if audit.platform == "instagram" and gateway is not None:
            try:
                token_info = gateway.get_instagram_token(audit.handle)
                if token_info is not None:
                    token, ig_user_id = token_info
                    from .instagram_api import InstagramAPIClient
                    client = InstagramAPIClient(token)
                    try:
                        ig_metrics = client.get_full_metrics(ig_user_id)
                        sink.emit("researching", f"Instagram Graph API: {ig_metrics.profile.followers_count:,} followers, ER {ig_metrics.avg_engagement_rate}%")
                    finally:
                        client.close()
            except Exception:
                # Fall through to free-toolset path — never block on API failure
                pass

        try:
            result = self.generator.generate(audit, sink.emit, ig_metrics=ig_metrics)
        except Exception as exc:  # noqa: BLE001 - record failure, never crash the loop
            sink.emit("failed", f"Generation error: {exc}")
            if gateway is not None:
                gateway.update_audit(audit.id, status=AuditStatus.FAILED.value, admin_notes=str(exc)[:500], last_failed_at=_utcnow())
            return RunSummary(
                audit_id=audit.id,
                status=AuditStatus.FAILED.value,
                wall_clock_seconds=round(time.monotonic() - started_at, 2),
                tokens_in=0,
                tokens_out=0,
                cost_usd=0.0,
                model="-",
                estimated_tokens=False,
                note=str(exc),
            )

        cost = estimate_cost(
            result.tokens_in,
            result.tokens_out,
            self.settings.price_in_per_mtok,
            self.settings.price_out_per_mtok,
        )

        report_path = report_url = pdf_url = None
        pdf_mode = None
        if gateway is not None:
            report_path, report_url = gateway.upload_report(audit.id, result.html)
            pdf_result = self._render_pdf(result.html)
            pdf_mode = pdf_result.mode
            _, pdf_url = gateway.upload_pdf(audit.id, pdf_result.data)
            sink.emit("uploaded", f"HTML + {pdf_result.mode} PDF stored")
            gateway.update_audit(
                audit.id,
                status=AuditStatus.READY.value,
                report_path=report_path,
                report_url=report_url,
                pdf_url=pdf_url,
                tokens_in=result.tokens_in,
                tokens_out=result.tokens_out,
                cost_usd=cost.total_usd,
                model=result.model,
                milestone_label=audit.milestone_label,
                limitations=audit.limitations,
            )
        else:
            report_path, pdf_url, pdf_mode = self._write_local(audit.id, result.html)
            sink.emit("uploaded", f"HTML + {pdf_mode} PDF written to {Path(report_path).parent}")

        sink.emit(
            "succeeded",
            f"Ready - {result.tokens_in}+{result.tokens_out} tok, ~${cost.total_usd:.2f}",
        )
        return RunSummary(
            audit_id=audit.id,
            status=AuditStatus.READY.value,
            wall_clock_seconds=round(time.monotonic() - started_at, 2),
            tokens_in=result.tokens_in,
            tokens_out=result.tokens_out,
            cost_usd=cost.total_usd,
            model=result.model,
            estimated_tokens=result.estimated,
            report_path=report_path,
            report_url=report_url,
            pdf_url=pdf_url,
            pdf_mode=pdf_mode,
        )

    def refine(
        self,
        audit: AuditRecord,
        current_html: str,
        section: str,
        instruction: str,
        sink: EventSink,
    ) -> tuple[str, int, int]:
        """Run a section-scoped refinement, returning (new_full_html, t_in, t_out)."""
        result = self.generator.refine(audit, current_html, section, instruction, sink.emit)
        new_html = replace_section(current_html, section, result.fragment)
        return new_html, result.tokens_in, result.tokens_out

    # -- helpers -----------------------------------------------------------

    def _render_pdf(self, html: str):
        from .pdf import render_pdf

        return render_pdf(html, mode=self.settings.pdf_mode, chromium_path=self.settings.chromium_path)

    def _write_local(self, audit_id: str, html: str) -> tuple[str, str, str]:
        from .pdf import render_pdf

        out = self.settings.output_dir
        out.mkdir(parents=True, exist_ok=True)
        html_path = out / f"{audit_id}.html"
        html_path.write_text(html, encoding="utf-8")
        pdf_result = render_pdf(html, mode=self.settings.pdf_mode, chromium_path=self.settings.chromium_path)
        pdf_path = out / f"{audit_id}.pdf"
        pdf_path.write_bytes(pdf_result.data)
        return str(html_path), str(pdf_path), pdf_result.mode
