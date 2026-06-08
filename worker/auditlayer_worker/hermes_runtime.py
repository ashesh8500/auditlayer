"""Hermes connectivity modes for the AuditLayer worker.

``http`` (default)
    Talk to an already-running Hermes Gateway api_server (e.g. systemd on Hetzner
    or a developer's local ``hermes gateway run``).

``subprocess``
    Spawn ``hermes gateway run`` on the first generation job when nothing is
    listening at ``HERMES_API_BASE``, then terminate the child after the queue
    has been idle for ``HERMES_SUBPROCESS_IDLE_SECONDS``. The worker still uses
    the OpenAI-compatible HTTP client — only gateway lifecycle changes.

``inprocess``
    Call ``run_agent.AIAgent`` directly (no HTTP). Requires a local Hermes Agent
    install (``HERMES_AGENT_ROOT`` or ``~/.hermes/hermes-agent``). Experimental:
    couples the worker to the full Hermes runtime and its dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import time
from typing import Literal
from urllib.parse import urlparse

from .config import WorkerSettings
from .hermes import HermesClient

HermesMode = Literal["http", "subprocess", "inprocess"]
_VALID_MODES: frozenset[str] = frozenset({"http", "subprocess", "inprocess"})


def parse_hermes_mode(raw: str | None) -> HermesMode:
    mode = (raw or "http").strip().lower()
    if mode not in _VALID_MODES:
        raise ValueError(f"HERMES_MODE must be one of {sorted(_VALID_MODES)}; got {raw!r}")
    return mode  # type: ignore[return-value]


def parse_host_port(api_base: str) -> tuple[str, int]:
    parsed = urlparse(api_base)
    host = parsed.hostname or "127.0.0.1"
    if parsed.port:
        port = parsed.port
    elif parsed.scheme == "https":
        port = 443
    else:
        port = 80
    return host, port


def is_tcp_reachable(host: str, port: int, *, timeout: float = 2.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def resolve_gateway_bin(settings: WorkerSettings) -> str:
    if settings.hermes_gateway_bin:
        path = Path(settings.hermes_gateway_bin)
        if path.exists():
            return str(path)
        found = shutil.which(settings.hermes_gateway_bin)
        if found:
            return found
        raise FileNotFoundError(
            f"HERMES_GATEWAY_BIN={settings.hermes_gateway_bin!r} was not found on PATH"
        )

    found = shutil.which("hermes")
    if found:
        return found

    home = Path.home()
    for candidate in (
        home / ".local" / "bin" / "hermes",
        home / ".hermes" / "hermes-agent" / "venv" / "bin" / "hermes",
    ):
        if candidate.exists():
            return str(candidate)

    raise FileNotFoundError(
        "Could not find `hermes` CLI. Install Hermes Agent or set HERMES_GATEWAY_BIN."
    )


def resolve_agent_root(settings: WorkerSettings) -> Path:
    if settings.hermes_agent_root:
        root = Path(settings.hermes_agent_root)
    else:
        root = Path.home() / ".hermes" / "hermes-agent"
    if not (root / "run_agent.py").exists():
        raise FileNotFoundError(
            f"Hermes Agent source not found at {root}. "
            "Set HERMES_AGENT_ROOT to the hermes-agent checkout."
        )
    return root


@dataclass
class _SubprocessGateway:
    process: subprocess.Popen[bytes]
    bin_path: str


class HermesRuntime:
    """Owns optional ephemeral gateway lifecycle and client factory."""

    def __init__(self, settings: WorkerSettings) -> None:
        self.settings = settings
        self.mode = parse_hermes_mode(settings.hermes_mode)
        self._host, self._port = parse_host_port(settings.hermes_api_base)
        self._gateway: _SubprocessGateway | None = None
        self._owns_gateway = False
        self._idle_seconds = 0.0

    def ensure_ready(self) -> None:
        if self.mode == "http":
            return
        if self.mode == "inprocess":
            # Validate install early so generation fails fast with a clear error.
            resolve_agent_root(self.settings)
            return
        if self.mode == "subprocess":
            self._ensure_subprocess_gateway()

    def tick_idle(self, worked: bool) -> None:
        if self.mode != "subprocess" or not self._owns_gateway:
            return
        if worked:
            self._idle_seconds = 0.0
            return
        self._idle_seconds += self.settings.poll_interval_seconds
        if self._idle_seconds >= self.settings.hermes_subprocess_idle_seconds:
            self._stop_owned_gateway()

    def shutdown(self) -> None:
        self._stop_owned_gateway()

    def build_client(self) -> HermesClient:
        self.ensure_ready()
        if self.mode == "inprocess":
            from .hermes_inprocess import InProcessHermesClient

            return InProcessHermesClient(self.settings)
        return HermesClient(
            self.settings.hermes_api_base,
            self.settings.hermes_api_key,
            self.settings.hermes_timeout_seconds,
        )

    def _ensure_subprocess_gateway(self) -> None:
        if is_tcp_reachable(self._host, self._port):
            return
        if self._gateway is not None and self._gateway.process.poll() is None:
            return

        bin_path = resolve_gateway_bin(self.settings)
        env = os.environ.copy()
        env.setdefault("HERMES_ACCEPT_HOOKS", "1")

        cmd = [bin_path, "gateway", "run", "--accept-hooks", "-q"]
        print(f"[hermes] spawning ephemeral gateway: {' '.join(cmd)}")
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            env=env,
            start_new_session=True,
        )
        self._gateway = _SubprocessGateway(process=process, bin_path=bin_path)
        self._owns_gateway = True
        self._idle_seconds = 0.0

        deadline = time.monotonic() + self.settings.hermes_gateway_startup_timeout
        while time.monotonic() < deadline:
            if process.poll() is not None:
                err = ""
                if process.stderr:
                    try:
                        err = process.stderr.read().decode("utf-8", errors="replace")[:500]
                    except OSError:
                        pass
                raise RuntimeError(
                    f"Hermes gateway exited before becoming reachable (code={process.returncode}). {err}"
                )
            if is_tcp_reachable(self._host, self._port):
                print(f"[hermes] gateway listening at {self.settings.hermes_api_base}")
                return
            time.sleep(0.5)

        self._stop_owned_gateway()
        raise TimeoutError(
            f"Hermes gateway did not become reachable at {self._host}:{self._port} "
            f"within {self.settings.hermes_gateway_startup_timeout}s"
        )

    def _stop_owned_gateway(self) -> None:
        if not self._owns_gateway or self._gateway is None:
            return
        proc = self._gateway.process
        if proc.poll() is None:
            print("[hermes] stopping ephemeral gateway")
            try:
                os.killpg(proc.pid, signal.SIGTERM)
            except (OSError, ProcessLookupError):
                proc.terminate()
            try:
                proc.wait(timeout=15)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except (OSError, ProcessLookupError):
                    proc.kill()
                proc.wait(timeout=5)
        self._gateway = None
        self._owns_gateway = False
        self._idle_seconds = 0.0
