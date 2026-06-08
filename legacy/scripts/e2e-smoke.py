#!/usr/bin/env python3
from __future__ import annotations

from io import BytesIO
import json
from pathlib import Path
import re
import sys
import tempfile
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from auditlayer.config import Settings
from auditlayer.delivery import delivery_from_settings
from auditlayer.hermes import MockReportGenerator
from auditlayer.pdf import pdf_renderer_from_settings
from auditlayer.service import AuditLayerService
from auditlayer.store import Store
from auditlayer.web import AuditLayerApp


class FakeCheckout:
    def create_subscription_checkout(self, email: str, plan: str, client_id: str) -> str:
        return f"https://checkout.example/{plan}/{client_id}"


def make_app(tmp_path: Path) -> AuditLayerApp:
    settings = Settings(
        env="test",
        db_path=tmp_path / "auditlayer.db",
        report_dir=tmp_path / "reports",
        admin_token="e2e-admin",
        generator="mock",
        hermes_api_base="http://127.0.0.1:8642/v1",
        hermes_api_key=None,
        hermes_model="deepseek-v4-pro",
        hermes_timeout_seconds=1,
        stripe_webhook_secret="whsec_test",
        stripe_secret_key="sk_test",
        stripe_starter_price_id="price_starter",
        stripe_pro_price_id="price_pro",
        stripe_success_url="https://auditlayer.test/dashboard?checkout=success",
        stripe_cancel_url="https://auditlayer.test/dashboard?checkout=cancelled",
        email_mode="outbox",
        email_from="AuditLayer <test@example.com>",
        email_outbox_path=tmp_path / "outbox.jsonl",
        smtp_host=None,
        smtp_port=587,
        smtp_username=None,
        smtp_password=None,
        smtp_use_tls=True,
        pdf_mode="stub",
        pdf_dir=tmp_path / "pdfs",
        chromium_path=None,
        max_request_bytes=1048576,
    )
    service = AuditLayerService(
        Store(settings.db_path),
        settings,
        MockReportGenerator(),
        delivery_from_settings(settings),
        FakeCheckout(),
        pdf_renderer_from_settings(settings),
    )
    service.bootstrap()
    return AuditLayerApp(service)


def call(app: AuditLayerApp, method: str = "GET", path: str = "/", body: str = "", query: str = "", headers: dict | None = None):
    captured = {}

    def start_response(status, response_headers):
        captured["status"] = status
        captured["headers"] = dict(response_headers)

    environ = {
        "REQUEST_METHOD": method,
        "PATH_INFO": path,
        "QUERY_STRING": query,
        "CONTENT_LENGTH": str(len(body.encode())),
        "wsgi.input": BytesIO(body.encode()),
        "wsgi.url_scheme": "https",
        "HTTP_HOST": "auditlayer.test",
    }
    for key, value in (headers or {}).items():
        environ[key] = value
    chunks = app(environ, start_response)
    raw = b"".join(chunks)
    return captured["status"], captured["headers"], raw


def assert_status(status: str, expected: str) -> None:
    if status != expected:
        raise AssertionError(f"Expected {expected}, got {status}")


def csrf_from(body: bytes) -> str:
    match = re.search(rb'name="csrf_token" value="([a-f0-9]{64})"', body)
    if not match:
        raise AssertionError("CSRF token was not rendered")
    return match.group(1).decode()


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="auditlayer-e2e-") as tmp:
        app = make_app(Path(tmp))

        status, _headers, body = call(app, path="/health")
        assert_status(status, "200 OK")
        assert json.loads(body)["ok"] is True

        intake = urlencode(
            {
                "email": "client@example.com",
                "name": "Dr Client",
                "handle": "@clientphd",
                "goal": "growth",
                "context": "PhD researcher in sleep and recovery",
                "platform": "instagram",
                "plan": "starter",
            }
        )
        status, headers, _body = call(app, method="POST", path="/audits", body=intake)
        assert_status(status, "303 See Other")
        audit_id = headers["Location"].split("/")[-1]

        status, _headers, login_body = call(app, method="POST", path="/login", body=urlencode({"email": "client@example.com"}))
        assert_status(status, "200 OK")
        match = re.search(rb"/auth/verify\?token=[A-Za-z0-9_\-]+", login_body)
        if not match:
            raise AssertionError("Magic link was not rendered")

        status, headers, _body = call(app, path="/auth/verify", query=match.group(0).decode().split("?", 1)[1])
        assert_status(status, "303 See Other")
        cookie = headers["Set-Cookie"].split(";", 1)[0]

        status, _headers, dashboard = call(app, path="/dashboard", headers={"HTTP_COOKIE": cookie})
        assert_status(status, "200 OK")
        if b"@clientphd" not in dashboard:
            raise AssertionError("Dashboard did not show submitted audit")

        status, _headers, body = call(app, method="POST", path="/worker/run-next", headers={"HTTP_X_AUDITLAYER_ADMIN_TOKEN": "e2e-admin"})
        assert_status(status, "200 OK")
        if json.loads(body)["status"] != "ready":
            raise AssertionError("Worker did not produce a ready audit")

        status, _headers, _body = call(app, path=f"/reports/{audit_id}")
        assert_status(status, "401 Unauthorized")

        status, _headers, report = call(app, path=f"/reports/{audit_id}", headers={"HTTP_COOKIE": cookie})
        assert_status(status, "200 OK")
        if b"@clientphd social media audit" not in report:
            raise AssertionError("Report body did not render")

        status, headers, pdf = call(app, path=f"/reports/{audit_id}/pdf", headers={"HTTP_COOKIE": cookie})
        assert_status(status, "200 OK")
        if headers["Content-Type"] != "application/pdf" or not pdf.startswith(b"%PDF-1.4"):
            raise AssertionError("PDF export did not return a PDF artifact")

        status, _headers, status_body = call(app, path=f"/audits/{audit_id}", headers={"HTTP_COOKIE": cookie})
        assert_status(status, "200 OK")
        csrf = csrf_from(status_body)
        refinement = urlencode(
            {
                "section": "The Six Audit Outputs",
                "instruction": "Make this more specific for a launch week content plan.",
                "csrf_token": csrf,
            }
        )
        status, headers, _body = call(
            app,
            method="POST",
            path=f"/audits/{audit_id}/refinements",
            body=refinement,
            headers={"HTTP_COOKIE": cookie},
        )
        assert_status(status, "303 See Other")
        if headers["Location"] != f"/audits/{audit_id}":
            raise AssertionError("Refinement did not redirect back to audit status")

        status, _headers, refined = call(app, path=f"/reports/{audit_id}", headers={"HTTP_COOKIE": cookie})
        assert_status(status, "200 OK")
        if b"launch week content plan" not in refined:
            raise AssertionError("Refinement did not update the report")

        status, _headers, admin = call(app, path="/admin", query="token=e2e-admin")
        assert_status(status, "200 OK")
        if b"Audit pipeline" not in admin:
            raise AssertionError("Admin dashboard did not render")

    print("auditlayer e2e smoke passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
