from __future__ import annotations

from datetime import datetime, timedelta, timezone
import secrets


SESSION_COOKIE = "auditlayer_session"


def new_token() -> str:
    return secrets.token_urlsafe(32)


def expires_in(minutes: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat(timespec="seconds")


def cookie_header(raw_session_token: str, max_age_seconds: int = 60 * 60 * 24 * 30) -> str:
    return (
        f"{SESSION_COOKIE}={raw_session_token}; "
        f"Max-Age={max_age_seconds}; Path=/; HttpOnly; SameSite=Lax"
    )


def clear_cookie_header() -> str:
    return f"{SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax"


def parse_cookie(cookie_header_value: str, name: str = SESSION_COOKIE) -> str | None:
    for part in cookie_header_value.split(";"):
        if "=" not in part:
            continue
        key, value = part.strip().split("=", 1)
        if key == name:
            return value
    return None

