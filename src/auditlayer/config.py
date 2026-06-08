from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    env: str
    db_path: Path
    report_dir: Path
    admin_token: str
    generator: str
    hermes_api_base: str
    hermes_api_key: str | None
    hermes_model: str
    hermes_timeout_seconds: float
    stripe_webhook_secret: str | None
    stripe_secret_key: str | None
    stripe_starter_price_id: str | None
    stripe_pro_price_id: str | None
    stripe_success_url: str
    stripe_cancel_url: str
    email_mode: str
    email_from: str
    email_outbox_path: Path
    smtp_host: str | None
    smtp_port: int
    smtp_username: str | None
    smtp_password: str | None
    smtp_use_tls: bool
    pdf_mode: str
    pdf_dir: Path
    chromium_path: str | None
    max_request_bytes: int

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            env=os.getenv("AUDITLAYER_ENV", "development"),
            db_path=Path(os.getenv("AUDITLAYER_DB_PATH", "var/data/auditlayer.db")),
            report_dir=Path(os.getenv("AUDITLAYER_REPORT_DIR", "var/reports")),
            admin_token=os.getenv("AUDITLAYER_ADMIN_TOKEN", "dev-admin-token"),
            generator=os.getenv("AUDITLAYER_GENERATOR", "mock").lower(),
            hermes_api_base=os.getenv("HERMES_API_BASE", "http://127.0.0.1:8642/v1"),
            hermes_api_key=os.getenv("HERMES_API_KEY") or None,
            hermes_model=os.getenv("HERMES_MODEL", "deepseek-v4-pro"),
            hermes_timeout_seconds=float(os.getenv("HERMES_TIMEOUT_SECONDS", "300")),
            stripe_webhook_secret=os.getenv("STRIPE_WEBHOOK_SECRET") or None,
            stripe_secret_key=os.getenv("STRIPE_SECRET_KEY") or None,
            stripe_starter_price_id=os.getenv("STRIPE_STARTER_PRICE_ID") or None,
            stripe_pro_price_id=os.getenv("STRIPE_PRO_PRICE_ID") or None,
            stripe_success_url=os.getenv("STRIPE_SUCCESS_URL", "http://127.0.0.1:8000/dashboard?checkout=success"),
            stripe_cancel_url=os.getenv("STRIPE_CANCEL_URL", "http://127.0.0.1:8000/dashboard?checkout=cancelled"),
            email_mode=os.getenv("AUDITLAYER_EMAIL_MODE", "outbox").lower(),
            email_from=os.getenv("AUDITLAYER_EMAIL_FROM", "AuditLayer <noreply@auditlayer.local>"),
            email_outbox_path=Path(os.getenv("AUDITLAYER_EMAIL_OUTBOX", "var/email-outbox.jsonl")),
            smtp_host=os.getenv("SMTP_HOST") or None,
            smtp_port=int(os.getenv("SMTP_PORT", "587")),
            smtp_username=os.getenv("SMTP_USERNAME") or None,
            smtp_password=os.getenv("SMTP_PASSWORD") or None,
            smtp_use_tls=os.getenv("SMTP_USE_TLS", "true").lower() == "true",
            pdf_mode=os.getenv("AUDITLAYER_PDF_MODE", "stub").lower(),
            pdf_dir=Path(os.getenv("AUDITLAYER_PDF_DIR", "var/pdfs")),
            chromium_path=os.getenv("CHROMIUM_PATH") or None,
            max_request_bytes=int(os.getenv("AUDITLAYER_MAX_REQUEST_BYTES", "1048576")),
        )

    def ensure_dirs(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.report_dir.mkdir(parents=True, exist_ok=True)
        self.email_outbox_path.parent.mkdir(parents=True, exist_ok=True)
        self.pdf_dir.mkdir(parents=True, exist_ok=True)

    def validation_errors(self) -> list[str]:
        errors: list[str] = []
        if self.env == "production":
            if self.admin_token in {"", "dev-admin-token", "change-me-before-production"}:
                errors.append("AUDITLAYER_ADMIN_TOKEN must be set to a non-default value")
            if self.generator == "hermes" and not self.hermes_api_key:
                errors.append("HERMES_API_KEY is required when AUDITLAYER_GENERATOR=hermes")
            if self.generator not in {"mock", "hermes"}:
                errors.append("AUDITLAYER_GENERATOR must be mock or hermes")
            if not self.stripe_webhook_secret:
                errors.append("STRIPE_WEBHOOK_SECRET is required in production")
            if not self.stripe_secret_key:
                errors.append("STRIPE_SECRET_KEY is required in production")
            if not self.stripe_starter_price_id:
                errors.append("STRIPE_STARTER_PRICE_ID is required in production")
            if not self.stripe_pro_price_id:
                errors.append("STRIPE_PRO_PRICE_ID is required in production")
            if self.email_mode == "smtp" and not self.smtp_host:
                errors.append("SMTP_HOST is required when AUDITLAYER_EMAIL_MODE=smtp")
            if self.email_mode not in {"outbox", "smtp"}:
                errors.append("AUDITLAYER_EMAIL_MODE must be outbox or smtp")
            if self.pdf_mode not in {"stub", "browser"}:
                errors.append("AUDITLAYER_PDF_MODE must be stub or browser")
            if self.pdf_mode == "browser" and not self.chromium_path:
                errors.append("CHROMIUM_PATH is required when AUDITLAYER_PDF_MODE=browser")
            if self.max_request_bytes < 1024:
                errors.append("AUDITLAYER_MAX_REQUEST_BYTES must be at least 1024")
        return errors

    def validate_for_startup(self) -> None:
        errors = self.validation_errors()
        if errors:
            raise RuntimeError("Invalid AuditLayer configuration: " + "; ".join(errors))


def get_settings() -> Settings:
    settings = Settings.from_env()
    settings.ensure_dirs()
    settings.validate_for_startup()
    return settings
