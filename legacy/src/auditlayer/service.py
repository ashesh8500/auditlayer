from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import time

from .auth import expires_in, new_token
from .billing import BillingUpdate, CheckoutClient, billing_update_from_event, parse_stripe_event
from .config import Settings
from .delivery import DeliveryClient, magic_link_message, report_ready_message
from .domain import AuditIntake, AuditStatus, Goal, Plan, Platform, evaluate_intake, normalize_handle
from .hermes import ReportGenerator, diagnose_hermes, replace_section, validate_hermes_connection, write_report
from .pdf import PdfRenderer
from .store import AuditRecord, Store


ALLOWED_REFINEMENT_SECTIONS = {
    "Data Quality Notes",
    "The Six Audit Outputs",
    "Executive Summary",
    "Brand Snapshot",
    "Platform-by-Platform Audit",
    "Strengths",
    "Weaknesses",
    "Root Cause Analysis",
    "Peer Comparison",
    "Growth Bottlenecks",
    "Content Gaps",
    "Audience Psychology Patterns",
    "Viral Opportunities",
    "Engagement Growth Strategy",
    "Performance Score",
    "Road to Milestone",
    "High-Impact Recommendations",
    "Content Ideas",
    "How Often Should You Re-Audit?",
}

BLOCKED_REFINEMENT_TERMS = (
    "system prompt",
    "developer message",
    "token budget",
    "backend",
    "config",
    "api key",
    "execute",
    "shell",
    "pricing",
    "stripe",
    "all reports",
    "other users",
)


ONBOARDING_STATUSES = {
    "lead",
    "login_requested",
    "audit_requested",
    "active",
    "needs_founder_review",
    "paid",
    "report_ready",
    "refinement_requested",
    "blocked",
    "churn_risk",
}


@dataclass
class AuditLayerService:
    store: Store
    settings: Settings
    generator: ReportGenerator
    delivery: DeliveryClient | None = None
    checkout: CheckoutClient | None = None
    pdf_renderer: PdfRenderer | None = None

    def bootstrap(self) -> None:
        self.settings.ensure_dirs()
        self.store.init()

    def submit_audit(
        self,
        email: str,
        handle: str,
        goal: str,
        context: str = "",
        platform: str = "unknown",
        plan: str = "free",
        name: str = "",
    ) -> AuditRecord:
        normalized_plan = Plan(plan) if plan in Plan._value2member_map_ else Plan.FREE
        client = self.store.upsert_client(email=email.strip().lower(), name=name.strip(), plan=normalized_plan.value, onboarding_status="audit_requested")
        intake = AuditIntake(
            email=client.email,
            handle=handle,
            goal=Goal(goal) if goal in Goal._value2member_map_ else Goal.GROWTH,
            context=context.strip(),
            platform=Platform(platform) if platform in Platform._value2member_map_ else Platform.UNKNOWN,
            plan=normalized_plan,
        )
        completed = self.store.count_completed_audits(client.id)
        decision = evaluate_intake(intake, completed_audits=completed)
        notes = "; ".join(decision.reasons)
        audit = self.store.create_audit(
            client_id=client.id,
            handle=normalize_handle(handle),
            platform=decision.platform.value,
            goal=intake.goal.value,
            context=intake.context,
            status=decision.status.value,
            limitations=list(decision.limitations),
            admin_notes=notes,
        )
        self.store.append_event(
            "audit_submitted",
            detail=f"status={audit.status}; platform={audit.platform}; plan={normalized_plan.value}",
            audit_id=audit.id,
            client_id=client.id,
            actor="client",
        )
        if decision.limitations:
            self.store.append_event(
                "limitations_recorded",
                detail=" | ".join(decision.limitations),
                audit_id=audit.id,
                client_id=client.id,
                actor="system",
            )
        return audit

    def run_next_audit(self) -> AuditRecord | None:
        queued = self.store.list_audits(status=AuditStatus.QUEUED.value)
        if not queued:
            self.store.append_event("worker_idle", detail="No queued audits were available.")
            return None
        audit = queued[-1]
        return self.run_audit(audit.id)

    def run_audit(self, audit_id: str) -> AuditRecord:
        audit = self.store.get_audit(audit_id)
        if audit is None:
            raise KeyError(audit_id)
        if audit.status not in {AuditStatus.QUEUED.value, AuditStatus.FAILED.value}:
            self.store.append_event(
                "generation_skipped",
                detail=f"Audit status {audit.status} is not runnable.",
                audit_id=audit.id,
                client_id=audit.client_id,
            )
            return audit
        running = self.store.update_audit(audit_id, status=AuditStatus.RUNNING.value)
        self.store.append_event("generation_started", audit_id=running.id, client_id=running.client_id)
        try:
            html_report = self.generator.generate(running)
            report_path = write_report(self.settings.report_dir, audit_id, html_report)
            ready = self.store.update_audit(audit_id, status=AuditStatus.READY.value, report_path=str(report_path))
            self.store.append_event(
                "generation_succeeded",
                detail=str(report_path),
                audit_id=ready.id,
                client_id=ready.client_id,
            )
            self.notify_report_ready(ready)
            return ready
        except Exception as exc:
            failed = self.store.update_audit(audit_id, status=AuditStatus.FAILED.value, admin_notes=f"Generation failed: {exc}")
            self.store.append_event(
                "generation_failed",
                detail=str(exc),
                audit_id=failed.id,
                client_id=failed.client_id,
            )
            return failed

    def approve_for_generation(self, audit_id: str, note: str = "") -> AuditRecord:
        audit = self.store.get_audit(audit_id)
        if audit is None:
            raise KeyError(audit_id)
        admin_notes = "\n".join(part for part in [audit.admin_notes, note] if part)
        approved = self.store.update_audit(audit_id, status=AuditStatus.QUEUED.value, admin_notes=admin_notes)
        self.store.append_event(
            "audit_approved",
            detail=note,
            audit_id=approved.id,
            client_id=approved.client_id,
            actor="admin",
        )
        return approved

    def block_audit(self, audit_id: str, note: str) -> AuditRecord:
        audit = self.store.get_audit(audit_id)
        if audit is None:
            raise KeyError(audit_id)
        normalized_note = note.strip()
        if len(normalized_note) < 4:
            raise ValueError("Blocking an audit requires a clear founder note")
        admin_notes = "\n".join(part for part in [audit.admin_notes, f"Blocked: {normalized_note}"] if part)
        blocked = self.store.update_audit(audit_id, status=AuditStatus.BLOCKED.value, admin_notes=admin_notes)
        self.store.append_event(
            "audit_blocked",
            detail=normalized_note,
            audit_id=blocked.id,
            client_id=blocked.client_id,
            actor="admin",
        )
        return blocked

    def add_audit_note(self, audit_id: str, note: str) -> AuditRecord:
        audit = self.store.get_audit(audit_id)
        if audit is None:
            raise KeyError(audit_id)
        normalized_note = note.strip()
        if len(normalized_note) < 3:
            raise ValueError("Admin note is too short")
        admin_notes = "\n".join(part for part in [audit.admin_notes, normalized_note] if part)
        updated = self.store.update_audit(audit_id, admin_notes=admin_notes)
        self.store.append_event(
            "audit_note_added",
            detail=normalized_note,
            audit_id=updated.id,
            client_id=updated.client_id,
            actor="admin",
        )
        return updated

    def update_client_onboarding(self, client_id: str, onboarding_status: str) -> None:
        normalized_status = onboarding_status.strip().lower()
        if normalized_status not in ONBOARDING_STATUSES:
            raise ValueError("Unsupported onboarding status")
        client = self.store.update_client_onboarding(client_id, normalized_status)
        self.store.append_event(
            "client_onboarding_updated",
            detail=f"onboarding_status={client.onboarding_status}",
            client_id=client.id,
            actor="admin",
        )

    def handle_stripe_event(self, payload: bytes) -> dict[str, str | None]:
        event = parse_stripe_event(payload)
        update = billing_update_from_event(event)
        if update is None:
            self.store.append_event("stripe_event_ignored", detail=event["type"], actor="stripe")
            return {"status": "ignored", "event_type": event["type"], "client_id": None}
        client = self.apply_billing_update(update)
        return {"status": "applied", "event_type": update.event_type, "client_id": client.id}

    def apply_billing_update(self, update: BillingUpdate):
        client = self.store.update_client_billing(
            email=update.email,
            plan=update.plan,
            subscription_status=update.subscription_status,
            stripe_customer_id=update.stripe_customer_id,
            stripe_subscription_id=update.stripe_subscription_id,
            current_period_end=update.current_period_end,
            onboarding_status="paid" if update.subscription_status in {"active", "trialing"} else update.subscription_status,
        )
        self.store.append_event(
            "billing_updated",
            detail=f"{update.event_type}; plan={client.plan}; subscription_status={client.subscription_status}",
            client_id=client.id,
            actor="stripe",
        )
        return client

    def request_magic_link(self, email: str, name: str = "", base_url: str = "") -> str:
        normalized_email = email.strip().lower()
        existing = self.store.get_client_by_email(normalized_email)
        client = self.store.upsert_client(
            email=normalized_email,
            name=name.strip(),
            plan=existing.plan if existing else Plan.FREE.value,
            onboarding_status="login_requested",
            subscription_status=existing.subscription_status if existing else None,
            stripe_customer_id=existing.stripe_customer_id if existing else None,
            stripe_subscription_id=existing.stripe_subscription_id if existing else None,
            current_period_end=existing.current_period_end if existing else None,
        )
        raw_token = new_token()
        self.store.create_auth_token(normalized_email, raw_token, expires_at=expires_in(15))
        self.store.append_event("magic_link_requested", client_id=client.id, actor="client")
        prefix = base_url.rstrip("/")
        link = f"{prefix}/auth/verify?token={raw_token}" if prefix else f"/auth/verify?token={raw_token}"
        if self.delivery:
            self.delivery.send(magic_link_message(normalized_email, link))
            self.store.append_event("magic_link_sent", client_id=client.id, actor="system", detail=self.settings.email_mode)
        return link

    def verify_magic_link(self, raw_token: str) -> tuple[str, str] | None:
        token = self.store.consume_auth_token(raw_token)
        if token is None:
            return None
        client = self.store.upsert_client(email=token.email, onboarding_status="active")
        raw_session = new_token()
        self.store.create_session(client.id, raw_session, expires_at=expires_in(60 * 24 * 30))
        self.store.append_event("client_logged_in", client_id=client.id, actor="client")
        return raw_session, client.id

    def client_for_session(self, raw_session: str | None):
        if not raw_session:
            return None
        session = self.store.get_session(raw_session)
        if session is None:
            return None
        return self.store.get_client(session.client_id)

    def logout(self, raw_session: str | None) -> None:
        if raw_session:
            self.store.revoke_session(raw_session)

    def notify_report_ready(self, audit: AuditRecord, base_url: str = "") -> None:
        client = self.store.get_client(audit.client_id)
        if client is None:
            return
        if client.onboarding_status not in {"paid", "blocked", "churn_risk"}:
            self.store.update_client_onboarding(client.id, "report_ready")
        if not self.delivery:
            return
        prefix = base_url.rstrip("/")
        report_url = f"{prefix}/reports/{audit.id}" if prefix else f"/reports/{audit.id}"
        report_path = Path(audit.report_path) if audit.report_path else None
        self.delivery.send(report_ready_message(client.email, audit.handle, report_url, report_path))
        self.store.append_event(
            "report_delivery_sent",
            detail=self.settings.email_mode,
            audit_id=audit.id,
            client_id=client.id,
            actor="system",
        )

    def create_checkout_url(self, client_id: str, plan: str) -> str:
        if plan not in {Plan.STARTER.value, Plan.PRO.value}:
            raise ValueError("Only starter and pro plans can be purchased through self-serve Checkout")
        if self.checkout is None:
            raise RuntimeError("Checkout client is not configured")
        client = self.store.get_client(client_id)
        if client is None:
            raise KeyError(client_id)
        url = self.checkout.create_subscription_checkout(client.email, plan, client.id)
        self.store.append_event(
            "checkout_started",
            detail=f"plan={plan}",
            client_id=client.id,
            actor="client",
        )
        return url

    def health(self) -> dict:
        checks: dict[str, dict] = {}
        overall_ok = True
        try:
            started = time.time()
            metrics = self.store.metrics()
            checks["database"] = {"ok": True, "latency_ms": round((time.time() - started) * 1000, 2)}
        except Exception as exc:
            overall_ok = False
            metrics = {}
            checks["database"] = {"ok": False, "error": str(exc)}
        for name, path in {
            "reports": self.settings.report_dir,
            "email_outbox": self.settings.email_outbox_path.parent,
        }.items():
            writable = path.exists() and path.is_dir()
            checks[name] = {"ok": writable, "path": str(path)}
            overall_ok = overall_ok and writable
        queued = len(self.store.list_audits(status=AuditStatus.QUEUED.value)) if checks["database"]["ok"] else 0
        running = len(self.store.list_audits(status=AuditStatus.RUNNING.value)) if checks["database"]["ok"] else 0
        config_errors = self.settings.validation_errors()
        if self.settings.env == "production" and config_errors:
            overall_ok = False
        checks["configuration"] = {
            "ok": not config_errors,
            "environment": self.settings.env,
            "generator": self.settings.generator,
            "email_mode": self.settings.email_mode,
            "errors": config_errors,
        }
        return {
            "ok": overall_ok,
            "metrics": metrics,
            "queue": {"queued": queued, "running": running},
            "checks": checks,
        }

    def validate_hermes(self) -> dict:
        if self.settings.generator != "hermes":
            return {
                "ok": True,
                "skipped": True,
                "reason": "AUDITLAYER_GENERATOR is not hermes",
                "model": self.settings.hermes_model,
                "endpoint": self.settings.hermes_api_base.rstrip("/") + "/chat/completions",
            }
        result = validate_hermes_connection(self.settings)
        payload = {
            "ok": result.ok,
            "skipped": False,
            "endpoint": result.endpoint,
            "latency_ms": result.latency_ms,
            "model": result.model,
        }
        if result.error:
            payload["error"] = result.error
        self.store.append_event(
            "hermes_validation_succeeded" if result.ok else "hermes_validation_failed",
            detail=f"{result.endpoint}; {result.error}" if result.error else result.endpoint,
            actor="system",
        )
        return payload

    def diagnose_hermes(self) -> dict:
        result = diagnose_hermes(self.settings)
        payload = {
            "ok": result.ok,
            "endpoint": result.endpoint,
            "host": result.host,
            "port": result.port,
            "tcp_reachable": result.tcp_reachable,
            "auth_ok": result.auth_ok,
            "auth_status_code": result.auth_status_code,
            "gateway_state_path": result.gateway_state_path,
            "gateway_state": result.gateway_state,
            "api_server_state": result.api_server_state,
        }
        if result.error:
            payload["error"] = result.error
        if result.recommendation:
            payload["recommendation"] = result.recommendation
        self.store.append_event(
            "hermes_diagnostic_succeeded" if result.ok else "hermes_diagnostic_failed",
            detail=result.endpoint if result.ok else f"{result.endpoint}; {result.error}",
            actor="system",
        )
        return payload

    def request_refinement(self, audit_id: str, client_id: str, section: str, instruction: str):
        audit = self.store.get_audit(audit_id)
        if audit is None:
            raise KeyError(audit_id)
        if audit.client_id != client_id:
            raise PermissionError("Client cannot refine another client's audit")
        if not audit.report_path or audit.status != AuditStatus.READY.value:
            raise ValueError("Only ready reports can be refined")
        normalized_section = section.strip()
        if normalized_section not in ALLOWED_REFINEMENT_SECTIONS:
            raise ValueError("Refinement section is not allowed")
        normalized_instruction = instruction.strip()
        if len(normalized_instruction) < 8:
            raise ValueError("Refinement instruction is too short")
        lowered = normalized_instruction.lower()
        if any(term in lowered for term in BLOCKED_REFINEMENT_TERMS):
            raise ValueError("Refinement request is outside section-scoped report editing")
        refinement = self.store.create_refinement(audit.id, client_id, normalized_section, normalized_instruction, status="running")
        self.store.append_event(
            "refinement_started",
            detail=normalized_section,
            audit_id=audit.id,
            client_id=client_id,
            actor="client",
        )
        try:
            path = Path(audit.report_path)
            current_html = path.read_text(encoding="utf-8")
            fragment = self.generator.refine_section(audit, current_html, normalized_section, normalized_instruction)
            updated_html = replace_section(current_html, normalized_section, fragment)
            path.write_text(updated_html, encoding="utf-8")
            done = self.store.update_refinement(refinement.id, status="ready")
            self.store.append_event(
                "refinement_succeeded",
                detail=normalized_section,
                audit_id=audit.id,
                client_id=client_id,
                actor="system",
            )
            return done
        except Exception as exc:
            failed = self.store.update_refinement(refinement.id, status="failed", error=str(exc))
            self.store.append_event(
                "refinement_failed",
                detail=str(exc),
                audit_id=audit.id,
                client_id=client_id,
                actor="system",
            )
            return failed

    def export_pdf(self, audit_id: str) -> Path:
        audit = self.store.get_audit(audit_id)
        if audit is None:
            raise KeyError(audit_id)
        if not audit.report_path or audit.status != AuditStatus.READY.value:
            raise ValueError("Only ready reports can be exported as PDF")
        if self.pdf_renderer is None:
            raise RuntimeError("PDF renderer is not configured")
        html_path = Path(audit.report_path)
        if not html_path.exists():
            raise FileNotFoundError(html_path)
        pdf_path = self.settings.pdf_dir / f"{audit.id}.pdf"
        rendered = self.pdf_renderer.render(html_path, pdf_path)
        self.store.append_event(
            "pdf_exported",
            detail=str(rendered),
            audit_id=audit.id,
            client_id=audit.client_id,
            actor="system",
        )
        return rendered
