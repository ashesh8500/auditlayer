from io import BytesIO
import hashlib
import hmac
import time
from pathlib import Path
import re
from urllib.parse import urlencode

from auditlayer.config import Settings
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
        admin_token="test",
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
        checkout=FakeCheckout(),
        pdf_renderer=pdf_renderer_from_settings(settings),
    )
    service.bootstrap()
    return AuditLayerApp(service)


def call(app, method="GET", path="/", body="", query="", headers=None):
    captured = {}

    def start_response(status, headers):
        captured["status"] = status
        captured["headers"] = dict(headers)

    environ = {
        "REQUEST_METHOD": method,
        "PATH_INFO": path,
        "QUERY_STRING": query,
        "CONTENT_LENGTH": str(len(body.encode())),
        "wsgi.input": BytesIO(body.encode()),
    }
    for key, value in (headers or {}).items():
        environ[key] = value
    chunks = app(environ, start_response)
    return captured["status"], captured["headers"], b"".join(chunks).decode()


def csrf_from(body: str) -> str:
    match = re.search(r'name="csrf_token" value="([a-f0-9]{64})"', body)
    assert match
    return match.group(1)


def test_health_endpoint(tmp_path):
    app = make_app(tmp_path)
    status, headers, body = call(app, path="/health")
    assert status == "200 OK"
    assert headers["Content-Type"].startswith("application/json")
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["X-Frame-Options"] == "DENY"
    assert "frame-ancestors 'none'" in headers["Content-Security-Policy"]
    assert '"ok": true' in body
    assert '"checks"' in body
    assert '"queue"' in body


def test_intake_post_creates_tracked_audit(tmp_path):
    app = make_app(tmp_path)
    body = urlencode(
        {
            "email": "client@example.com",
            "name": "Dr Client",
            "handle": "@clientphd",
            "goal": "growth",
            "context": "PhD researcher",
            "platform": "instagram",
            "plan": "starter",
        }
    )
    status, headers, _ = call(app, method="POST", path="/audits", body=body)
    assert status == "303 See Other"
    assert headers["Location"].startswith("/audits/audit_")
    assert app.service.store.metrics()["audits"] == 1


def test_request_body_limit_returns_413_before_parsing(tmp_path):
    app = make_app(tmp_path)
    object.__setattr__(app.service.settings, "max_request_bytes", 16)
    body = urlencode({"email": "client@example.com", "name": "Client"})
    status, headers, response = call(app, method="POST", path="/login", body=body)
    assert status == "413 Payload Too Large"
    assert headers["Content-Type"].startswith("application/json")
    assert "exceeds 16 bytes" in response


def test_unhandled_errors_do_not_leak_exception_details(tmp_path, monkeypatch):
    app = make_app(tmp_path)

    def broken_health():
        raise RuntimeError("secret database path")

    monkeypatch.setattr(app.service, "health", broken_health)
    status, headers, body = call(app, path="/health")
    assert status == "500 Internal Server Error"
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert body == "Internal server error"
    assert "secret database path" not in body


def test_admin_requires_token(tmp_path):
    app = make_app(tmp_path)
    status, _, body = call(app, path="/admin")
    assert status == "401 Unauthorized"
    assert body == "Unauthorized"

    status, _, body = call(app, path="/admin", query="token=test")
    assert status == "200 OK"
    assert "Audit pipeline" in body


def test_admin_links_and_founder_actions_are_authenticated(tmp_path):
    app = make_app(tmp_path)
    audit = app.service.submit_audit(
        email="client@example.com",
        name="Client",
        handle="@healthcreator",
        goal="growth",
        context="No credentials supplied",
        platform="instagram",
        plan="free",
    )
    status, _, body = call(app, path="/admin", query="token=test")
    assert status == "200 OK"
    assert f"/admin/audits/{audit.id}/block?token=test" in body
    csrf = csrf_from(body)

    status, _, response = call(
        app,
        method="POST",
        path=f"/admin/audits/{audit.id}/note",
        query="token=test",
        body=urlencode({"note": "This should be rejected."}),
    )
    assert status == "403 Forbidden"
    assert "Invalid CSRF token" in response

    status, headers, _ = call(
        app,
        method="POST",
        path=f"/admin/audits/{audit.id}/note",
        query="token=test",
        body=urlencode({"note": "Ask for MD or PhD credential evidence.", "csrf_token": csrf}),
    )
    assert status == "303 See Other"
    assert headers["Location"] == "/admin?token=test"
    assert "credential evidence" in app.service.store.get_audit(audit.id).admin_notes

    status, _, _ = call(
        app,
        method="POST",
        path=f"/admin/audits/{audit.id}/block",
        query="token=test",
        body=urlencode({"note": "Missing evidence for evidence-based health fit.", "csrf_token": csrf}),
    )
    assert status == "303 See Other"
    assert app.service.store.get_audit(audit.id).status == "blocked"

    status, _, _ = call(
        app,
        method="POST",
        path=f"/admin/clients/{audit.client_id}/onboarding",
        query="token=test",
        body=urlencode({"onboarding_status": "needs_founder_review", "csrf_token": csrf}),
    )
    assert status == "303 See Other"
    assert app.service.store.get_client(audit.client_id).onboarding_status == "needs_founder_review"


def test_worker_endpoint_requires_token_and_runs_queue(tmp_path):
    app = make_app(tmp_path)
    audit = app.service.submit_audit(
        email="client@example.com",
        name="Dr Client",
        handle="@clientphd",
        goal="growth",
        context="PhD researcher",
        platform="instagram",
        plan="starter",
    )
    status, _, _ = call(app, method="POST", path="/worker/run-next")
    assert status == "401 Unauthorized"

    status, _, body = call(app, method="POST", path="/worker/run-next", headers={"HTTP_X_AUDITLAYER_ADMIN_TOKEN": "test"})
    assert status == "200 OK"
    assert audit.id in body
    assert '"status": "ready"' in body
    status, _, admin_body = call(app, path="/admin", query="token=test")
    assert status == "200 OK"
    assert f"/reports/{audit.id}?token=test" in admin_body
    assert f"/reports/{audit.id}/pdf?token=test" in admin_body


def test_client_status_page_shows_limitations(tmp_path):
    app = make_app(tmp_path)
    audit = app.service.submit_audit(
        email="client@example.com",
        handle="@healthcreator",
        goal="growth",
        context="No credentials supplied",
        platform="instagram",
        plan="free",
    )
    status, _, body = call(app, path=f"/audits/{audit.id}")
    assert status == "200 OK"
    assert "Client status" in body
    assert "Credential fit is unverified" in body


def test_stripe_webhook_rejects_bad_signature(tmp_path):
    app = make_app(tmp_path)
    status, _, body = call(app, method="POST", path="/webhooks/stripe", body='{"type":"ping","data":{"object":{}}}')
    assert status == "400 Bad Request"
    assert "missing timestamp" in body


def test_stripe_webhook_updates_billing_with_valid_signature(tmp_path):
    app = make_app(tmp_path)
    body = """{
      "id": "evt_test",
      "type": "checkout.session.completed",
      "data": {
        "object": {
          "customer_email": "client@example.com",
          "customer": "cus_123",
          "subscription": "sub_123",
          "metadata": {"auditlayer_plan": "starter"}
        }
      }
    }"""
    timestamp = str(int(time.time()))
    signature = hmac.new(b"whsec_test", f"{timestamp}.{body}".encode(), hashlib.sha256).hexdigest()
    status, _, response = call(
        app,
        method="POST",
        path="/webhooks/stripe",
        body=body,
        headers={"HTTP_STRIPE_SIGNATURE": f"t={timestamp},v1={signature}"},
    )
    assert status == "200 OK"
    assert '"status": "applied"' in response
    client = app.service.store.get_client_by_email("client@example.com")
    assert client is not None
    assert client.plan == "starter"


def test_magic_link_login_sets_session_and_dashboard_is_scoped(tmp_path):
    app = make_app(tmp_path)
    body = urlencode({"email": "client@example.com", "name": "Dr Client"})
    status, _, login_body = call(app, method="POST", path="/login", body=body)
    assert status == "200 OK"
    match = re.search(r"/auth/verify\?token=[A-Za-z0-9_\-]+", login_body)
    assert match

    status, headers, _ = call(app, path="/auth/verify", query=match.group(0).split("?", 1)[1])
    assert status == "303 See Other"
    assert headers["Location"] == "/dashboard"
    cookie = headers["Set-Cookie"].split(";", 1)[0]

    app.service.submit_audit(
        email="client@example.com",
        name="Dr Client",
        handle="@clientphd",
        goal="growth",
        context="PhD researcher",
        platform="instagram",
        plan="starter",
    )
    status, _, dashboard = call(app, path="/dashboard", headers={"HTTP_COOKIE": cookie})
    assert status == "200 OK"
    assert "Client dashboard" in dashboard
    assert "@clientphd" in dashboard


def test_dashboard_redirects_without_session_and_logout_clears_cookie(tmp_path):
    app = make_app(tmp_path)
    status, headers, _ = call(app, path="/dashboard")
    assert status == "303 See Other"
    assert headers["Location"] == "/login"

    link = app.service.request_magic_link("client@example.com")
    token = link.split("token=", 1)[1]
    _status, verify_headers, _ = call(app, path="/auth/verify", query=f"token={token}")
    cookie = verify_headers["Set-Cookie"].split(";", 1)[0]
    status, _, dashboard = call(app, path="/dashboard", headers={"HTTP_COOKIE": cookie})
    assert status == "200 OK"
    csrf = csrf_from(dashboard)

    status, _, response = call(app, method="POST", path="/logout", headers={"HTTP_COOKIE": cookie})
    assert status == "403 Forbidden"
    assert "Invalid CSRF token" in response

    status, headers, _ = call(
        app,
        method="POST",
        path="/logout",
        body=urlencode({"csrf_token": csrf}),
        headers={"HTTP_COOKIE": cookie},
    )
    assert status == "303 See Other"
    assert "Max-Age=0" in headers["Set-Cookie"]


def test_report_requires_owner_session_or_admin_token(tmp_path):
    app = make_app(tmp_path)
    audit = app.service.submit_audit(
        email="client@example.com",
        name="Dr Client",
        handle="@clientphd",
        goal="growth",
        context="PhD researcher",
        platform="instagram",
        plan="starter",
    )
    ready = app.service.run_audit(audit.id)
    assert ready.report_path

    status, _, _ = call(app, path=f"/reports/{audit.id}")
    assert status == "401 Unauthorized"

    link = app.service.request_magic_link("client@example.com")
    token = link.split("token=", 1)[1]
    status, headers, _ = call(app, path="/auth/verify", query=f"token={token}")
    cookie = headers["Set-Cookie"].split(";", 1)[0]
    status, _, report = call(app, path=f"/reports/{audit.id}", headers={"HTTP_COOKIE": cookie})
    assert status == "200 OK"
    assert "@clientphd social media audit" in report

    status, _, _ = call(app, path=f"/reports/{audit.id}", query="token=test")
    assert status == "200 OK"


def test_checkout_requires_session_and_redirects_to_stripe_checkout(tmp_path):
    app = make_app(tmp_path)
    status, headers, _ = call(app, method="POST", path="/billing/checkout", body=urlencode({"plan": "starter"}))
    assert status == "303 See Other"
    assert headers["Location"] == "/login"

    link = app.service.request_magic_link("client@example.com")
    token = link.split("token=", 1)[1]
    _status, verify_headers, _ = call(app, path="/auth/verify", query=f"token={token}")
    cookie = verify_headers["Set-Cookie"].split(";", 1)[0]
    status, _, dashboard = call(app, path="/dashboard", headers={"HTTP_COOKIE": cookie})
    assert status == "200 OK"
    csrf = csrf_from(dashboard)

    status, _, response = call(
        app,
        method="POST",
        path="/billing/checkout",
        body=urlencode({"plan": "starter"}),
        headers={"HTTP_COOKIE": cookie},
    )
    assert status == "403 Forbidden"
    assert "Invalid CSRF token" in response

    status, headers, _ = call(
        app,
        method="POST",
        path="/billing/checkout",
        body=urlencode({"plan": "starter", "csrf_token": csrf}),
        headers={"HTTP_COOKIE": cookie},
    )
    assert status == "303 See Other"
    assert headers["Location"].startswith("https://checkout.example/starter/client_")


def test_refinement_route_requires_owner_session_and_updates_report(tmp_path):
    app = make_app(tmp_path)
    audit = app.service.submit_audit(
        email="client@example.com",
        name="Dr Client",
        handle="@clientphd",
        goal="growth",
        context="PhD researcher",
        platform="instagram",
        plan="starter",
    )
    ready = app.service.run_audit(audit.id)

    status, headers, _ = call(
        app,
        method="POST",
        path=f"/audits/{audit.id}/refinements",
        body=urlencode({"section": "The Six Audit Outputs", "instruction": "Make it more specific."}),
    )
    assert status == "303 See Other"
    assert headers["Location"] == "/login"

    link = app.service.request_magic_link("client@example.com")
    token = link.split("token=", 1)[1]
    _status, verify_headers, _ = call(app, path="/auth/verify", query=f"token={token}")
    cookie = verify_headers["Set-Cookie"].split(";", 1)[0]
    status, _, status_body = call(app, path=f"/audits/{audit.id}", headers={"HTTP_COOKIE": cookie})
    assert status == "200 OK"
    csrf = csrf_from(status_body)

    status, _, response = call(
        app,
        method="POST",
        path=f"/audits/{audit.id}/refinements",
        body=urlencode(
            {
                "section": "The Six Audit Outputs",
                "instruction": "Make this more specific for a launch week content plan.",
            }
        ),
        headers={"HTTP_COOKIE": cookie},
    )
    assert status == "403 Forbidden"
    assert "Invalid CSRF token" in response

    status, headers, _ = call(
        app,
        method="POST",
        path=f"/audits/{audit.id}/refinements",
        body=urlencode(
            {
                "section": "The Six Audit Outputs",
                "instruction": "Make this more specific for a launch week content plan.",
                "csrf_token": csrf,
            }
        ),
        headers={"HTTP_COOKIE": cookie},
    )
    assert status == "303 See Other"
    assert headers["Location"] == f"/audits/{audit.id}"
    report = Path(ready.report_path).read_text()
    assert "launch week content plan" in report


def test_audit_status_shows_refinement_form_only_to_owner(tmp_path):
    app = make_app(tmp_path)
    audit = app.service.submit_audit(
        email="client@example.com",
        name="Dr Client",
        handle="@clientphd",
        goal="growth",
        context="PhD researcher",
        platform="instagram",
        plan="starter",
    )
    app.service.run_audit(audit.id)
    status, _, body = call(app, path=f"/audits/{audit.id}")
    assert status == "200 OK"
    assert "Refine a section" not in body

    link = app.service.request_magic_link("client@example.com")
    token = link.split("token=", 1)[1]
    _status, verify_headers, _ = call(app, path="/auth/verify", query=f"token={token}")
    cookie = verify_headers["Set-Cookie"].split(";", 1)[0]
    status, _, body = call(app, path=f"/audits/{audit.id}", headers={"HTTP_COOKIE": cookie})
    assert status == "200 OK"
    assert "Refine a section" in body


def test_pdf_export_requires_owner_or_admin_and_returns_pdf(tmp_path):
    app = make_app(tmp_path)
    audit = app.service.submit_audit(
        email="client@example.com",
        name="Dr Client",
        handle="@clientphd",
        goal="growth",
        context="PhD researcher",
        platform="instagram",
        plan="starter",
    )
    app.service.run_audit(audit.id)

    status, _, _ = call(app, path=f"/reports/{audit.id}/pdf")
    assert status == "401 Unauthorized"

    status, headers, body = call(app, path=f"/reports/{audit.id}/pdf", query="token=test")
    assert status == "200 OK"
    assert headers["Content-Type"] == "application/pdf"
    assert body.startswith("%PDF-1.4")
