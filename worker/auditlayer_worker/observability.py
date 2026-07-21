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
    "session",
    "session_id",
    "token",
    "password",
    "secret",
}


def _scrub_value(value: Any, key: str = "") -> Any:
    if key.lower() in _SENTRY_SECRET_KEYS:
        return "[Filtered]"
    if isinstance(value, dict):
        return {k: _scrub_value(v, str(k)) for k, v in value.items()}
    if isinstance(value, list):
        return [_scrub_value(item) for item in value[:50]]
    return value


def scrub_sentry_event(event: dict[str, Any], _hint: dict[str, Any]) -> dict[str, Any]:
    """Remove creator identity, report content, credentials, and session data."""
    scrubbed = dict(event)
    scrubbed.pop("user", None)
    scrubbed.pop("message", None)
    scrubbed.pop("logentry", None)
    scrubbed.pop("breadcrumbs", None)
    scrubbed.pop("tags", None)
    scrubbed.pop("fingerprint", None)
    exception = scrubbed.get("exception")
    if isinstance(exception, dict):
        values = exception.get("values")
        safe_values = []
        if isinstance(values, list):
            for item in values[:10]:
                if isinstance(item, dict):
                    error_type = item.get("type")
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
                                "function",
                                "module",
                                "lineno",
                                "colno",
                                "in_app",
                            ):
                                frame_value = raw_frame.get(key)
                                if isinstance(frame_value, str):
                                    safe_frame[key] = frame_value[:500]
                                elif isinstance(frame_value, (int, float, bool)):
                                    safe_frame[key] = frame_value
                            safe_frames.append(safe_frame)
                    safe_exception: dict[str, Any] = {
                        "type": str(error_type)[:120] if error_type else "Error",
                        "value": "[Filtered]",
                    }
                    if safe_frames:
                        safe_exception["stacktrace"] = {"frames": safe_frames}
                    safe_values.append(safe_exception)
        scrubbed["exception"] = {"values": safe_values}
    request = scrubbed.get("request")
    if isinstance(request, dict):
        request = dict(request)
        request["data"] = "[Filtered]"
        request.pop("url", None)
        request.pop("query_string", None)
        request.pop("fragment", None)
        request.pop("cookies", None)
        headers = request.get("headers")
        if isinstance(headers, dict):
            request["headers"] = {
                key: value
                for key, value in headers.items()
                if str(key).lower() not in _SENTRY_SECRET_KEYS
            }
        scrubbed["request"] = request
    scrubbed["extra"] = _scrub_value(scrubbed.get("extra", {}))
    contexts = scrubbed.get("contexts")
    if isinstance(contexts, dict):
        scrubbed["contexts"] = {
            key: value
            for key, value in contexts.items()
            if str(key).lower() not in {"creator", "report", "audit"}
        }
    return scrubbed


def init_sentry() -> bool:
    """Initialize privacy-safe worker error reporting when SENTRY_DSN is set."""
    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn:
        return False
    import sentry_sdk

    sentry_sdk.init(
        dsn=dsn,
        environment=os.getenv("SENTRY_ENVIRONMENT", "production"),
        release=os.getenv("SENTRY_RELEASE") or None,
        send_default_pii=False,
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.02")),
        before_send=scrub_sentry_event,
    )
    return True


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
    print(json.dumps(payload, ensure_ascii=False, default=str), flush=True)
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
