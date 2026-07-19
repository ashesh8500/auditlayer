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
    port = int(os.getenv("AUDITLAYER_HEALTH_PORT", "8787"))
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
