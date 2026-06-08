from __future__ import annotations

import hashlib
import hmac
from hmac import compare_digest
import json
import logging
from pathlib import Path
from urllib.parse import parse_qs
from wsgiref.simple_server import make_server

from jinja2 import Environment, FileSystemLoader, select_autoescape

from .auth import SESSION_COOKIE, clear_cookie_header, cookie_header, parse_cookie
from .billing import StripeWebhookError, verify_stripe_signature
from .domain import AuditStatus, Goal, Plan, Platform
from .factory import create_service
from .service import ALLOWED_REFINEMENT_SECTIONS, ONBOARDING_STATUSES
from .service import AuditLayerService


ROOT = Path(__file__).resolve().parents[2]
TEMPLATE_DIR = ROOT / "templates"
LOG = logging.getLogger(__name__)

SECURITY_HEADERS = [
    ("X-Content-Type-Options", "nosniff"),
    ("X-Frame-Options", "DENY"),
    ("Referrer-Policy", "no-referrer"),
    ("Permissions-Policy", "camera=(), microphone=(), geolocation=()"),
    (
        "Content-Security-Policy",
        "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
        "base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    ),
]


class RequestTooLarge(ValueError):
    pass


class CsrfError(ValueError):
    pass


class AuditLayerApp:
    def __init__(self, service: AuditLayerService | None = None):
        self.service = service or create_service()
        self.templates = Environment(
            loader=FileSystemLoader(TEMPLATE_DIR),
            autoescape=select_autoescape(["html", "xml"]),
        )

    def __call__(self, environ, start_response):
        method = environ["REQUEST_METHOD"]
        path = environ.get("PATH_INFO", "/")
        self._current_environ = environ
        try:
            status, headers, body = self.route(method, path, environ)
        except RequestTooLarge as exc:
            status, headers, body = self.json_response({"ok": False, "error": str(exc)}, status="413 Payload Too Large")
        except CsrfError as exc:
            status, headers, body = self.json_response({"ok": False, "error": str(exc)}, status="403 Forbidden")
        except Exception as exc:
            LOG.exception("Unhandled AuditLayer request error: %s %s", method, path)
            status, headers, body = "500 Internal Server Error", [("Content-Type", "text/plain; charset=utf-8")], b"Internal server error"
        headers = self.with_security_headers(headers)
        start_response(status, headers)
        return [body]

    def route(self, method: str, path: str, environ) -> tuple[str, list[tuple[str, str]], bytes]:
        if method == "GET" and path == "/health":
            health = self.service.health()
            return self.json_response(health, status="200 OK" if health["ok"] else "503 Service Unavailable")
        if method == "GET" and path == "/":
            return self.html("intake.html", self.base_context())
        if method == "GET" and path == "/login":
            return self.html("login.html", {**self.base_context(), "magic_link": ""})
        if method == "POST" and path == "/login":
            form = self.read_form(environ)
            link = self.service.request_magic_link(
                email=value(form, "email"),
                name=value(form, "name"),
                base_url=self.base_url(environ),
            )
            return self.html("login.html", {**self.base_context(), "magic_link": link})
        if method == "GET" and path == "/auth/verify":
            return self.verify_login(environ)
        if method == "POST" and path == "/logout":
            form = self.read_form(environ)
            self.require_csrf(environ, form)
            self.service.logout(self.session_token(environ))
            return "303 See Other", [("Location", "/"), ("Set-Cookie", clear_cookie_header())], b""
        if method == "GET" and path == "/dashboard":
            return self.dashboard(environ)
        if method == "POST" and path == "/billing/checkout":
            return self.checkout(environ)
        if method == "POST" and path == "/audits":
            form = self.read_form(environ)
            audit = self.service.submit_audit(
                email=value(form, "email"),
                name=value(form, "name"),
                handle=value(form, "handle"),
                goal=value(form, "goal", Goal.GROWTH.value),
                context=value(form, "context"),
                platform=value(form, "platform", Platform.UNKNOWN.value),
                plan=value(form, "plan", Plan.FREE.value),
            )
            return self.redirect(f"/audits/{audit.id}")
        if method == "POST" and path.startswith("/audits/") and path.endswith("/refinements"):
            return self.refine_audit(path.split("/")[2], environ)
        if method == "GET" and path.startswith("/audits/"):
            return self.audit_status(path.split("/")[-1])
        if method == "GET" and path == "/admin":
            auth = self.require_admin(environ)
            if auth:
                return auth
            return self.admin(environ)
        if method == "POST" and path.startswith("/admin/audits/") and path.endswith("/approve"):
            auth = self.require_admin(environ)
            if auth:
                return auth
            audit_id = path.split("/")[3]
            form = self.read_form(environ)
            self.require_csrf(environ, form)
            self.service.approve_for_generation(audit_id, value(form, "note", "Founder approved for generation."))
            return self.redirect(self.admin_url(environ))
        if method == "POST" and path.startswith("/admin/audits/") and path.endswith("/run"):
            auth = self.require_admin(environ)
            if auth:
                return auth
            audit_id = path.split("/")[3]
            self.require_csrf(environ, self.read_form(environ))
            self.service.run_audit(audit_id)
            return self.redirect(self.admin_url(environ))
        if method == "POST" and path.startswith("/admin/audits/") and path.endswith("/block"):
            auth = self.require_admin(environ)
            if auth:
                return auth
            audit_id = path.split("/")[3]
            form = self.read_form(environ)
            self.require_csrf(environ, form)
            self.service.block_audit(audit_id, value(form, "note"))
            return self.redirect(self.admin_url(environ))
        if method == "POST" and path.startswith("/admin/audits/") and path.endswith("/note"):
            auth = self.require_admin(environ)
            if auth:
                return auth
            audit_id = path.split("/")[3]
            form = self.read_form(environ)
            self.require_csrf(environ, form)
            self.service.add_audit_note(audit_id, value(form, "note"))
            return self.redirect(self.admin_url(environ))
        if method == "POST" and path.startswith("/admin/clients/") and path.endswith("/onboarding"):
            auth = self.require_admin(environ)
            if auth:
                return auth
            client_id = path.split("/")[3]
            form = self.read_form(environ)
            self.require_csrf(environ, form)
            self.service.update_client_onboarding(client_id, value(form, "onboarding_status"))
            return self.redirect(self.admin_url(environ))
        if method == "POST" and path == "/worker/run-next":
            auth = self.require_admin(environ)
            if auth:
                return auth
            audit = self.service.run_next_audit()
            return self.json_response({"ok": True, "audit_id": audit.id if audit else None, "status": audit.status if audit else "idle"})
        if method == "POST" and path == "/webhooks/stripe":
            return self.stripe_webhook(environ)
        if method == "GET" and path.startswith("/reports/"):
            parts = [part for part in path.split("/") if part]
            if len(parts) == 3 and parts[2] == "pdf":
                return self.report_pdf(parts[1])
            return self.report(parts[-1])
        return "404 Not Found", [("Content-Type", "text/plain; charset=utf-8")], b"Not found"

    def admin(self, environ) -> tuple[str, list[tuple[str, str]], bytes]:
        query = parse_qs(environ.get("QUERY_STRING", ""))
        return self.html(
            "admin.html",
            {
                **self.base_context(),
                "metrics": self.service.store.metrics(),
                "clients": self.service.store.list_clients(),
                "audits": self.service.store.list_audits(),
                "events": self.service.store.list_events(limit=25),
                "created": query.get("created", [""])[0],
                "statuses": AuditStatus,
                "onboarding_statuses": sorted(ONBOARDING_STATUSES),
                "admin_query": self.admin_query(environ),
                "csrf_token": self.csrf_token(environ),
            },
        )

    def audit_status(self, audit_id: str) -> tuple[str, list[tuple[str, str]], bytes]:
        audit = self.service.store.get_audit(audit_id)
        if audit is None:
            return "404 Not Found", [("Content-Type", "text/plain; charset=utf-8")], b"Audit not found"
        return self.html(
            "audit_status.html",
            {
                **self.base_context(),
                "audit": audit,
                "events": self.service.store.list_events(audit_id=audit.id, limit=20),
                "refinements": self.service.store.list_refinements(audit_id=audit.id, limit=20),
                "allowed_sections": sorted(ALLOWED_REFINEMENT_SECTIONS),
                "csrf_token": self.csrf_token(self._current_environ),
                "can_refine": self.current_client(self._current_environ) is not None
                and self.current_client(self._current_environ).id == audit.client_id
                and audit.status == AuditStatus.READY.value,
            },
        )

    def report(self, audit_id: str) -> tuple[str, list[tuple[str, str]], bytes]:
        audit = self.service.store.get_audit(audit_id)
        if audit is None or not audit.report_path:
            return "404 Not Found", [("Content-Type", "text/plain; charset=utf-8")], b"Report not found"
        if not self.can_view_audit(audit, self._current_environ):
            return "401 Unauthorized", [("Content-Type", "text/plain; charset=utf-8"), ("Cache-Control", "no-store")], b"Unauthorized"
        path = Path(audit.report_path)
        if not path.exists():
            return "404 Not Found", [("Content-Type", "text/plain; charset=utf-8")], b"Report file missing"
        return "200 OK", [("Content-Type", "text/html; charset=utf-8"), ("Cache-Control", "private, no-cache")], path.read_bytes()

    def report_pdf(self, audit_id: str) -> tuple[str, list[tuple[str, str]], bytes]:
        audit = self.service.store.get_audit(audit_id)
        if audit is None:
            return "404 Not Found", [("Content-Type", "text/plain; charset=utf-8")], b"Report not found"
        if not self.can_view_audit(audit, self._current_environ):
            return "401 Unauthorized", [("Content-Type", "text/plain; charset=utf-8"), ("Cache-Control", "no-store")], b"Unauthorized"
        try:
            pdf_path = self.service.export_pdf(audit_id)
        except Exception as exc:
            return self.json_response({"ok": False, "error": str(exc)}, status="400 Bad Request")
        return (
            "200 OK",
            [
                ("Content-Type", "application/pdf"),
                ("Cache-Control", "private, no-cache"),
                ("Content-Disposition", f'attachment; filename="{audit.handle}-audit.pdf"'),
            ],
            pdf_path.read_bytes(),
        )

    def stripe_webhook(self, environ) -> tuple[str, list[tuple[str, str]], bytes]:
        secret = self.service.settings.stripe_webhook_secret
        if not secret:
            return self.json_response({"ok": False, "error": "stripe webhook secret is not configured"}, status="503 Service Unavailable")
        payload = self.read_body(environ)
        try:
            verify_stripe_signature(payload, environ.get("HTTP_STRIPE_SIGNATURE", ""), secret)
            result = self.service.handle_stripe_event(payload)
        except StripeWebhookError as exc:
            return self.json_response({"ok": False, "error": str(exc)}, status="400 Bad Request")
        return self.json_response({"ok": True, **result})

    def dashboard(self, environ) -> tuple[str, list[tuple[str, str]], bytes]:
        client = self.current_client(environ)
        if client is None:
            return self.redirect("/login")
        audits = self.service.store.list_audits(client_id=client.id)
        return self.html(
            "dashboard.html",
            {
                **self.base_context(),
                "client": client,
                "audits": audits,
                "usage": self.service.store.usage_for_client(client.id),
                "csrf_token": self.csrf_token(environ),
            },
        )

    def verify_login(self, environ) -> tuple[str, list[tuple[str, str]], bytes]:
        query = parse_qs(environ.get("QUERY_STRING", ""))
        token = query.get("token", [""])[0]
        verified = self.service.verify_magic_link(token)
        if verified is None:
            return "400 Bad Request", [("Content-Type", "text/plain; charset=utf-8"), ("Cache-Control", "no-store")], b"Invalid or expired login link"
        raw_session, _client_id = verified
        return "303 See Other", [("Location", "/dashboard"), ("Set-Cookie", cookie_header(raw_session))], b""

    def checkout(self, environ) -> tuple[str, list[tuple[str, str]], bytes]:
        client = self.current_client(environ)
        if client is None:
            return self.redirect("/login")
        form = self.read_form(environ)
        self.require_csrf(environ, form)
        try:
            checkout_url = self.service.create_checkout_url(client.id, value(form, "plan"))
        except Exception as exc:
            return self.json_response({"ok": False, "error": str(exc)}, status="400 Bad Request")
        return self.redirect(checkout_url)

    def refine_audit(self, audit_id: str, environ) -> tuple[str, list[tuple[str, str]], bytes]:
        client = self.current_client(environ)
        if client is None:
            return self.redirect("/login")
        form = self.read_form(environ)
        self.require_csrf(environ, form)
        try:
            self.service.request_refinement(
                audit_id=audit_id,
                client_id=client.id,
                section=value(form, "section"),
                instruction=value(form, "instruction"),
            )
        except Exception as exc:
            self.service.store.append_event(
                "refinement_rejected",
                detail=str(exc),
                audit_id=audit_id,
                client_id=client.id,
                actor="system",
            )
        return self.redirect(f"/audits/{audit_id}")

    def base_context(self) -> dict:
        return {
            "goals": Goal,
            "plans": Plan,
            "platforms": Platform,
            "generator": self.service.settings.generator,
        }

    def html(self, template: str, context: dict) -> tuple[str, list[tuple[str, str]], bytes]:
        body = self.templates.get_template(template).render(**context).encode()
        return "200 OK", [("Content-Type", "text/html; charset=utf-8"), ("Cache-Control", "private, no-cache")], body

    def json_response(self, payload: dict, status: str = "200 OK") -> tuple[str, list[tuple[str, str]], bytes]:
        return status, [("Content-Type", "application/json; charset=utf-8")], json.dumps(payload).encode()

    def redirect(self, location: str) -> tuple[str, list[tuple[str, str]], bytes]:
        return "303 See Other", [("Location", location), ("Content-Type", "text/plain; charset=utf-8")], b""

    def read_form(self, environ) -> dict[str, list[str]]:
        raw = self.read_body(environ).decode()
        return parse_qs(raw)

    def read_body(self, environ) -> bytes:
        length = int(environ.get("CONTENT_LENGTH") or 0)
        if length > self.service.settings.max_request_bytes:
            raise RequestTooLarge(f"Request body exceeds {self.service.settings.max_request_bytes} bytes")
        return environ["wsgi.input"].read(length)

    def csrf_token(self, environ) -> str:
        subject = self.csrf_subject(environ)
        if not subject:
            return ""
        return self.csrf_for_subject(subject)

    def csrf_for_subject(self, subject: str) -> str:
        return hmac.new(self.service.settings.admin_token.encode(), subject.encode(), hashlib.sha256).hexdigest()

    def csrf_subject(self, environ) -> str:
        session_token = self.session_token(environ)
        if session_token:
            return f"session:{session_token}"
        query = parse_qs(environ.get("QUERY_STRING", ""))
        admin_token = query.get("token", [""])[0]
        if admin_token:
            return f"admin:{admin_token}"
        return ""

    def require_csrf(self, environ, form: dict[str, list[str]]) -> None:
        subject = self.csrf_subject(environ)
        if not subject:
            raise CsrfError("Missing CSRF subject")
        supplied = value(form, "csrf_token")
        expected = self.csrf_for_subject(subject)
        if not supplied or not compare_digest(supplied, expected):
            raise CsrfError("Invalid CSRF token")

    def with_security_headers(self, headers: list[tuple[str, str]]) -> list[tuple[str, str]]:
        existing = {name.lower() for name, _value in headers}
        hardened = list(headers)
        for name, value in SECURITY_HEADERS:
            if name.lower() not in existing:
                hardened.append((name, value))
        return hardened

    def require_admin(self, environ) -> tuple[str, list[tuple[str, str]], bytes] | None:
        expected = self.service.settings.admin_token
        supplied = environ.get("HTTP_X_AUDITLAYER_ADMIN_TOKEN", "")
        if not supplied:
            query = parse_qs(environ.get("QUERY_STRING", ""))
            supplied = query.get("token", [""])[0]
        if expected and compare_digest(supplied, expected):
            return None
        return "401 Unauthorized", [("Content-Type", "text/plain; charset=utf-8"), ("Cache-Control", "no-store")], b"Unauthorized"

    def session_token(self, environ) -> str | None:
        return parse_cookie(environ.get("HTTP_COOKIE", ""), SESSION_COOKIE)

    def current_client(self, environ):
        return self.service.client_for_session(self.session_token(environ))

    def can_view_audit(self, audit, environ) -> bool:
        if self.require_admin(environ) is None:
            return True
        client = self.current_client(environ)
        return client is not None and client.id == audit.client_id

    @property
    def _current_environ(self):
        return getattr(self, "__current_environ", {})

    @_current_environ.setter
    def _current_environ(self, environ):
        setattr(self, "__current_environ", environ)

    def admin_query(self, environ) -> str:
        query = parse_qs(environ.get("QUERY_STRING", ""))
        token = query.get("token", [""])[0]
        return f"?token={token}" if token else ""

    def admin_url(self, environ) -> str:
        return "/admin" + self.admin_query(environ)

    def base_url(self, environ) -> str:
        scheme = environ.get("wsgi.url_scheme", "http")
        host = environ.get("HTTP_HOST") or environ.get("SERVER_NAME") or "127.0.0.1:8000"
        return f"{scheme}://{host}"


def value(form: dict[str, list[str]], key: str, default: str = "") -> str:
    values = form.get(key)
    return values[0].strip() if values else default


def app(environ, start_response):
    return AuditLayerApp()(environ, start_response)


def main() -> None:
    server = make_server("127.0.0.1", 8000, AuditLayerApp())
    print("AuditLayer portal listening on http://127.0.0.1:8000")
    server.serve_forever()


if __name__ == "__main__":
    main()
