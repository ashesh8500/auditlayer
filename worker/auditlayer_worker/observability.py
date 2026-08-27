"""Minimal structured logging and local worker health endpoint.

The endpoint binds to loopback by default. Operators may proxy it through an
authenticated tunnel, but it must not be exposed directly to the public web.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import threading
import time
from typing import Any
from urllib.parse import urlsplit, urlunsplit


_SENTRY_SECRET_KEYS = {
    "authorization",
    "cookie",
    "set-cookie",
    "access_token",
    "refresh_token",
    "creator_handle",
    "creatorhandle",
    "handle",
    "report_html",
    "reporthtml",
    "report",
    "instruction",
    "context",
    "email",
    "user_id",
    "userid",
    "api_key",
    "apikey",
    "service_role_key",
    "traceback",
    "traceback_tail",
    "session",
    "session_id",
    "token",
    "password",
    "secret",
}


def _is_sensitive_key(key: str) -> bool:
    normalized = key.lower().replace("-", "_")
    return normalized in _SENTRY_SECRET_KEYS or normalized.endswith(
        ("_api_key", "_access_token", "_refresh_token", "_password", "_secret")
    )


def _scrub_value(value: Any, key: str = "") -> Any:
    if _is_sensitive_key(key):
        return "[Filtered]"
    if isinstance(value, dict):
        return {k: _scrub_value(v, str(k)) for k, v in value.items()}
    if isinstance(value, list):
        return [_scrub_value(item) for item in value[:50]]
    return value


_DIAGNOSTIC_TAGS = ("service", "surface", "operation", "error_class", "status")
_SENTRY_LEVELS = {"debug", "info", "warning", "error", "fatal"}
WORKER_SENTRY_SURFACES = frozenset(
    {
        "worker_runtime",
        "instagram_connection",
        "instagram_graph",
        "instagram_insights",
        "report_projection",
        "audit_finalization",
    }
)
WORKER_SENTRY_OPERATIONS = frozenset(
    {
        "worker_loop",
        "connection_lookup",
        "token_refresh",
        "connection_persist",
        "profile_fetch",
        "metrics_fetch",
        "insights_fetch",
        "report_projection",
        "generation",
        "finalization",
    }
)
SENTRY_FAILURE_STATUSES = frozenset(
    {"failed", "rejected", "unavailable", "retrying", "degraded"}
)


def _safe_dimension(value: Any, fallback: str, maximum: int = 120) -> str:
    if not isinstance(value, str):
        return fallback
    clean = "".join(
        character if character.isalnum() or character in "._:/-" else "_"
        for character in value.strip()
        if ord(character) >= 32 and ord(character) != 127
    )
    return clean[:maximum] if clean else fallback


def _safe_frame_location(value: Any) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    raw = value.strip()[:1000]
    try:
        parsed = urlsplit(raw)
        if parsed.scheme:
            if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
                return None
            hostname = parsed.hostname or ""
            port = f":{parsed.port}" if parsed.port else ""
            return urlunsplit((parsed.scheme, f"{hostname}{port}", parsed.path, "", ""))[:500]
    except ValueError:
        return None
    if "://" in raw:
        return None
    return raw.split("?", 1)[0].split("#", 1)[0][:500]


def scrub_sentry_event(event: dict[str, Any], _hint: dict[str, Any]) -> dict[str, Any]:
    """Return only safe dimensions and source frames required for diagnostics."""
    scrubbed: dict[str, Any] = {}
    event_id = event.get("event_id")
    if isinstance(event_id, str) and len(event_id) == 32 and all(
        character in "0123456789abcdefABCDEF" for character in event_id
    ):
        scrubbed["event_id"] = event_id
    timestamp = event.get("timestamp")
    if isinstance(timestamp, (int, float)):
        scrubbed["timestamp"] = timestamp
    environment = event.get("environment")
    if isinstance(environment, str) and environment.strip():
        scrubbed["environment"] = _safe_dimension(environment, "unknown", 80)
    release = event.get("release")
    if isinstance(release, str) and release.strip():
        scrubbed["release"] = _safe_dimension(release, "unknown", 200)
    level = event.get("level")
    if isinstance(level, str) and level in _SENTRY_LEVELS:
        scrubbed["level"] = level

    exception_type = "Error"
    exception = event.get("exception")
    if isinstance(exception, dict):
        values = exception.get("values")
        safe_values = []
        if isinstance(values, list):
            for item in values[:10]:
                if isinstance(item, dict):
                    error_type = _safe_dimension(item.get("type"), "Error")
                    if exception_type == "Error":
                        exception_type = error_type
                    raw_stacktrace = item.get("stacktrace")
                    raw_frames = (
                        raw_stacktrace.get("frames")
                        if isinstance(raw_stacktrace, dict)
                        else []
                    )
                    safe_frames: list[dict[str, Any]] = []
                    if isinstance(raw_frames, list):
                        for raw_frame in raw_frames[-100:]:
                            if not isinstance(raw_frame, dict):
                                continue
                            safe_frame: dict[str, Any] = {}
                            for key in (
                                "filename",
                                "abs_path",
                                "function",
                                "module",
                                "lineno",
                                "colno",
                                "in_app",
                            ):
                                frame_value = raw_frame.get(key)
                                if key in {"filename", "abs_path"}:
                                    location = _safe_frame_location(frame_value)
                                    if location is not None:
                                        safe_frame[key] = location
                                elif isinstance(frame_value, str):
                                    safe_frame[key] = _safe_dimension(frame_value, "unknown", 500)
                                elif isinstance(frame_value, (int, float, bool)):
                                    safe_frame[key] = frame_value
                            safe_frames.append(safe_frame)
                    safe_exception: dict[str, Any] = {
                        "type": error_type,
                        "value": "[Filtered]",
                    }
                    if safe_frames:
                        safe_exception["stacktrace"] = {"frames": safe_frames}
                    safe_values.append(safe_exception)
        scrubbed["exception"] = {"values": safe_values}

    source_tags = event.get("tags") if isinstance(event.get("tags"), dict) else {}
    defaults = {
        "service": "auditlayer-worker",
        "surface": "worker_runtime",
        "operation": "unhandled",
        "error_class": exception_type,
        "status": "failed",
    }
    tags = {
        key: _safe_dimension(source_tags.get(key), defaults[key])
        for key in _DIAGNOSTIC_TAGS
    }
    scrubbed["tags"] = tags
    scrubbed["fingerprint"] = [
        "{{ default }}",
        tags["service"],
        tags["surface"],
        tags["operation"],
        tags["error_class"],
    ]
    return scrubbed


def capture_worker_failure(
    error: BaseException,
    *,
    surface: str,
    operation: str,
    status: str = "failed",
) -> bool:
    """Capture a worker exception without accepting arbitrary customer context."""
    safe_surface = surface if surface in WORKER_SENTRY_SURFACES else "worker_runtime"
    safe_operation = operation if operation in WORKER_SENTRY_OPERATIONS else "worker_loop"
    safe_status = status if status in SENTRY_FAILURE_STATUSES else "failed"
    error_class = type(error).__name__
    try:
        import sentry_sdk

        if not sentry_sdk.is_initialized():
            return False
        with sentry_sdk.isolation_scope() as scope:
            tags = {
                "service": "auditlayer-worker",
                "surface": safe_surface,
                "operation": safe_operation,
                "error_class": error_class,
                "status": safe_status,
            }
            for key, value in tags.items():
                scope.set_tag(key, value)
            scope.fingerprint = [
                "{{ default }}",
                tags["service"],
                tags["surface"],
                tags["operation"],
                tags["error_class"],
            ]
            sentry_sdk.capture_exception(error)
        return True
    except Exception:
        # Observability must never interrupt queue processing or recovery.
        return False


def init_sentry() -> bool:
    """Initialize privacy-safe worker error reporting with an exact release."""
    dsn = os.getenv("SENTRY_DSN", "").strip()
    release = os.getenv("SENTRY_RELEASE", "").strip()
    if not dsn or len(release) != 40 or any(
        character not in "0123456789abcdefABCDEF" for character in release
    ):
        return False
    try:
        import sentry_sdk

        sentry_sdk.init(
            dsn=dsn,
            environment=_safe_dimension(
                os.getenv("SENTRY_ENVIRONMENT", "production"), "production", 80
            ),
            release=release,
            send_default_pii=False,
            traces_sample_rate=0.0,
            max_breadcrumbs=0,
            max_request_body_size="never",
            include_local_variables=False,
            include_source_context=False,
            before_breadcrumb=lambda _breadcrumb, _hint: None,
            before_send_transaction=lambda _event, _hint: None,
            before_send=scrub_sentry_event,
        )
        for key, value in {
            "service": "auditlayer-worker",
            "surface": "worker_runtime",
            "operation": "worker_loop",
            "error_class": "Error",
            "status": "failed",
        }.items():
            sentry_sdk.set_tag(key, value)
        return True
    except Exception:
        # Invalid or unavailable observability configuration must not stop paid work.
        return False


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def log_event(event: str, *, level: str = "info", **fields: Any) -> None:
    payload = {
        "timestamp": _utcnow(),
        "level": level,
        "service": "auditlayer-worker",
        "event": event,
        **fields,
    }
    safe_payload = _scrub_value(payload)
    print(json.dumps(safe_payload, ensure_ascii=False, default=str), flush=True)
    if level.lower() in {"error", "critical", "fatal"}:
        try:
            import sentry_sdk

            if sentry_sdk.is_initialized():
                sentry_sdk.capture_message(
                    event,
                    level="fatal" if level.lower() in {"critical", "fatal"} else "error",
                )
        except Exception:
            # Observability must never interrupt queue processing or recovery.
            pass


@dataclass
class WorkerHealth:
    started_monotonic: float = field(default_factory=time.monotonic)
    last_loop_monotonic: float = field(default_factory=time.monotonic)
    last_worked: bool = False
    last_error_type: str = ""
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def heartbeat(self, *, worked: bool, error_type: str = "") -> None:
        with self._lock:
            self.last_loop_monotonic = time.monotonic()
            self.last_worked = worked
            self.last_error_type = error_type

    def snapshot(self, *, stale_after_seconds: float) -> tuple[int, dict[str, Any]]:
        with self._lock:
            loop_age = max(0.0, time.monotonic() - self.last_loop_monotonic)
            healthy = loop_age <= stale_after_seconds
            body = {
                "status": "ok" if healthy else "degraded",
                "service": "auditlayer-worker",
                "uptime_seconds": round(time.monotonic() - self.started_monotonic, 1),
                "last_loop_age_seconds": round(loop_age, 1),
                "last_loop_worked": self.last_worked,
                "last_error_type": self.last_error_type or None,
                "observed_at": _utcnow(),
            }
        return (200 if healthy else 503), body


def start_health_server(*, poll_interval_seconds: float) -> WorkerHealth:
    state = WorkerHealth()
    host = os.getenv("AUDITLAYER_HEALTH_HOST", "127.0.0.1")
    configured_port = os.getenv("AUDITLAYER_HEALTH_PORT")
    if configured_port:
        port = int(configured_port)
    else:
        # Template worker instances share one host. Derive a stable, distinct
        # loopback port from AUDITLAYER_WORKER_ID=worker-%i.
        worker_id = os.getenv("AUDITLAYER_WORKER_ID", "")
        suffix = worker_id.rsplit("-", 1)[-1]
        port = 8787 + (int(suffix) if suffix.isdigit() else 0)
    stale_after = max(60.0, poll_interval_seconds * 4)

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 - stdlib handler contract
            if self.path != "/healthz":
                self.send_response(404)
                self.end_headers()
                return
            status, body = state.snapshot(stale_after_seconds=stale_after)
            encoded = json.dumps(body).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
            del format, args
            return

    try:
        server = ThreadingHTTPServer((host, port), Handler)
    except OSError as exc:
        log_event("health_server_bind_failed", level="warning", error_type=type(exc).__name__)
        return state

    thread = threading.Thread(
        target=server.serve_forever,
        name="auditlayer-health",
        daemon=True,
    )
    thread.start()
    log_event("health_server_started", host=host, port=port)
    return state
