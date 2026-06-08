from pathlib import Path

from auditlayer.config import Settings


def test_production_config_validation_catches_unsafe_defaults(tmp_path: Path):
    settings = Settings(
        env="production",
        db_path=tmp_path / "auditlayer.db",
        report_dir=tmp_path / "reports",
        admin_token="dev-admin-token",
        generator="hermes",
        hermes_api_base="http://127.0.0.1:8642/v1",
        hermes_api_key=None,
        hermes_model="deepseek-v4-pro",
        hermes_timeout_seconds=1,
        stripe_webhook_secret=None,
        stripe_secret_key=None,
        stripe_starter_price_id=None,
        stripe_pro_price_id=None,
        stripe_success_url="https://example.com/success",
        stripe_cancel_url="https://example.com/cancel",
        email_mode="smtp",
        email_from="AuditLayer <test@example.com>",
        email_outbox_path=tmp_path / "outbox.jsonl",
        smtp_host=None,
        smtp_port=587,
        smtp_username=None,
        smtp_password=None,
        smtp_use_tls=True,
        pdf_mode="browser",
        pdf_dir=tmp_path / "pdfs",
        chromium_path=None,
        max_request_bytes=512,
    )
    errors = settings.validation_errors()
    assert "AUDITLAYER_ADMIN_TOKEN must be set to a non-default value" in errors
    assert "HERMES_API_KEY is required when AUDITLAYER_GENERATOR=hermes" in errors
    assert "STRIPE_SECRET_KEY is required in production" in errors
    assert "SMTP_HOST is required when AUDITLAYER_EMAIL_MODE=smtp" in errors
    assert "CHROMIUM_PATH is required when AUDITLAYER_PDF_MODE=browser" in errors
    assert "AUDITLAYER_MAX_REQUEST_BYTES must be at least 1024" in errors
