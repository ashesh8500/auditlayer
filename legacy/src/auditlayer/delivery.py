from __future__ import annotations

from dataclasses import dataclass
from email.message import EmailMessage
import json
from pathlib import Path
import smtplib
from typing import Protocol

from .config import Settings


@dataclass(frozen=True)
class DeliveryMessage:
    to: str
    subject: str
    text: str
    html: str | None = None
    attachment_path: Path | None = None


class DeliveryClient(Protocol):
    def send(self, message: DeliveryMessage) -> None:
        """Deliver or persist a message."""


@dataclass(frozen=True)
class OutboxDeliveryClient:
    path: Path
    sender: str

    def send(self, message: DeliveryMessage) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        record = {
            "from": self.sender,
            "to": message.to,
            "subject": message.subject,
            "text": message.text,
            "html": message.html,
            "attachment_path": str(message.attachment_path) if message.attachment_path else None,
        }
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, sort_keys=True) + "\n")


@dataclass(frozen=True)
class SmtpDeliveryClient:
    settings: Settings

    def send(self, message: DeliveryMessage) -> None:
        if not self.settings.smtp_host:
            raise RuntimeError("SMTP_HOST is required when AUDITLAYER_EMAIL_MODE=smtp")
        email = EmailMessage()
        email["From"] = self.settings.email_from
        email["To"] = message.to
        email["Subject"] = message.subject
        email.set_content(message.text)
        if message.html:
            email.add_alternative(message.html, subtype="html")
        if message.attachment_path:
            data = message.attachment_path.read_bytes()
            email.add_attachment(data, maintype="text", subtype="html", filename=message.attachment_path.name)
        with smtplib.SMTP(self.settings.smtp_host, self.settings.smtp_port, timeout=30) as smtp:
            if self.settings.smtp_use_tls:
                smtp.starttls()
            if self.settings.smtp_username:
                smtp.login(self.settings.smtp_username, self.settings.smtp_password or "")
            smtp.send_message(email)


def delivery_from_settings(settings: Settings) -> DeliveryClient:
    if settings.email_mode == "smtp":
        return SmtpDeliveryClient(settings)
    return OutboxDeliveryClient(settings.email_outbox_path, settings.email_from)


def magic_link_message(to: str, link: str) -> DeliveryMessage:
    return DeliveryMessage(
        to=to,
        subject="Your AuditLayer login link",
        text=f"Use this link to access your AuditLayer workspace:\n\n{link}\n\nThis link expires shortly.",
        html=f"<p>Use this link to access your AuditLayer workspace:</p><p><a href=\"{link}\">{link}</a></p><p>This link expires shortly.</p>",
    )


def report_ready_message(to: str, handle: str, report_url: str, report_path: Path | None) -> DeliveryMessage:
    return DeliveryMessage(
        to=to,
        subject=f"AuditLayer report ready for @{handle}",
        text=f"Your AuditLayer report for @{handle} is ready:\n\n{report_url}\n",
        html=f"<p>Your AuditLayer report for <strong>@{handle}</strong> is ready.</p><p><a href=\"{report_url}\">View report</a></p>",
        attachment_path=report_path,
    )

