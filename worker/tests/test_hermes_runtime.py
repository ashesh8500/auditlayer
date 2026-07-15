"""Hermes runtime mode selection and gateway helpers (offline)."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
import socket
from unittest.mock import MagicMock, patch

import pytest

from auditlayer_worker.config import WorkerSettings
from auditlayer_worker.hermes_runtime import (
    HermesRuntime,
    is_tcp_reachable,
    parse_hermes_mode,
    parse_host_port,
    resolve_gateway_bin,
)


def _settings(**over) -> WorkerSettings:
    base = WorkerSettings.from_env()
    return replace(base, **over)


def test_parse_hermes_mode_defaults_to_http():
    assert parse_hermes_mode(None) == "http"
    assert parse_hermes_mode("HTTP") == "http"
    assert parse_hermes_mode("subprocess") == "subprocess"
    assert parse_hermes_mode("inprocess") == "inprocess"


def test_parse_hermes_mode_rejects_unknown():
    with pytest.raises(ValueError, match="HERMES_MODE"):
        parse_hermes_mode("kubernetes")


def test_parse_host_port_from_api_base():
    assert parse_host_port("http://127.0.0.1:8642/v1") == ("127.0.0.1", 8642)
    assert parse_host_port("https://hermes.example.com/v1") == ("hermes.example.com", 443)


def test_settings_load_hermes_mode_from_env():
    settings = _settings(hermes_mode="subprocess")
    assert settings.hermes_mode == "subprocess"
    runtime = HermesRuntime(settings)
    assert runtime.mode == "subprocess"


def test_resolve_gateway_bin_prefers_explicit_path(tmp_path):
    fake = tmp_path / "hermes-cli"
    fake.write_text("#!/bin/sh\n", encoding="utf-8")
    fake.chmod(0o755)
    settings = _settings(hermes_gateway_bin=str(fake))
    assert resolve_gateway_bin(settings) == str(fake)


def test_subprocess_mode_reuses_existing_listener():
    settings = _settings(hermes_mode="subprocess")
    runtime = HermesRuntime(settings)

    with patch(
        "auditlayer_worker.hermes_runtime.is_tcp_reachable", return_value=True
    ) as reachable:
        runtime.ensure_ready()

    reachable.assert_called_once()
    assert runtime._owns_gateway is False
    assert runtime._gateway is None


def test_subprocess_mode_spawns_gateway_when_port_closed():
    settings = _settings(hermes_mode="subprocess", hermes_gateway_bin="/bin/hermes")
    runtime = HermesRuntime(settings)
    proc = MagicMock()
    proc.poll.return_value = None
    proc.pid = 4242

    with (
        patch("auditlayer_worker.hermes_runtime.is_tcp_reachable", side_effect=[False, True]),
        patch(
            "auditlayer_worker.hermes_runtime.resolve_gateway_bin",
            return_value="/bin/hermes",
        ),
        patch("auditlayer_worker.hermes_runtime.subprocess.Popen", return_value=proc) as popen,
    ):
        runtime.ensure_ready()

    popen.assert_called_once()
    assert runtime._owns_gateway is True
    cmd = popen.call_args.args[0]
    assert cmd[:3] == ["/bin/hermes", "gateway", "run"]


def test_tick_idle_stops_owned_gateway_after_timeout():
    settings = _settings(
        hermes_mode="subprocess",
        poll_interval_seconds=10,
        hermes_subprocess_idle_seconds=35,
    )
    runtime = HermesRuntime(settings)
    runtime._owns_gateway = True
    runtime._gateway = MagicMock()
    runtime._gateway.process.poll.return_value = None
    runtime._gateway.process.pid = 9999

    with patch.object(runtime, "_stop_owned_gateway") as stop:
        runtime.tick_idle(worked=False)
        runtime.tick_idle(worked=False)
        runtime.tick_idle(worked=False)
        stop.assert_not_called()
        runtime.tick_idle(worked=False)
        stop.assert_called_once()


def test_inprocess_build_client_imports_adapter(tmp_path, monkeypatch):
    agent_root = tmp_path / "hermes-agent"
    agent_root.mkdir()
    (agent_root / "run_agent.py").write_text("# stub\n", encoding="utf-8")
    settings = _settings(hermes_mode="inprocess", hermes_agent_root=str(agent_root))

    class FakeInProcess:
        def __init__(self, s: WorkerSettings) -> None:
            self.settings = s

    monkeypatch.setitem(
        __import__("sys").modules,
        "auditlayer_worker.hermes_inprocess",
        MagicMock(InProcessHermesClient=FakeInProcess),
    )
    runtime = HermesRuntime(settings)
    client = runtime.build_client()
    assert isinstance(client, FakeInProcess)


def test_is_tcp_reachable_open_port():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    sock.listen(1)
    try:
        port = sock.getsockname()[1]
        assert is_tcp_reachable("127.0.0.1", port, timeout=1.0)
    finally:
        sock.close()
