"""Deterministic queue-loop fault injection; no network or inference."""
from types import SimpleNamespace
from typing import cast
from unittest.mock import Mock

import httpx
import pytest
from postgrest.exceptions import APIError

from auditlayer_worker import worker
from auditlayer_worker.config import WorkerSettings
from auditlayer_worker.observability import WorkerHealth


class StopLoop(BaseException):
    pass


def loop_harness(monkeypatch):
    gateway = Mock()
    gateway.sweep_retryable.return_value = 0
    gateway.sweep_stale_running.return_value = 0
    gateway.sweep_stale_report_generation_runs.return_value = 0
    runtime = Mock(mode="inprocess")
    health = WorkerHealth()
    monkeypatch.setattr(worker, "SupabaseGateway", lambda _: gateway)
    monkeypatch.setattr(worker, "HermesRuntime", lambda _: runtime)
    monkeypatch.setattr(worker, "start_health_server", lambda **_: health)
    monkeypatch.setattr(worker, "_prewarm_account_homes", Mock())
    monkeypatch.setattr(worker.random, "uniform", lambda low, high: (low + high) / 2)
    settings = cast(WorkerSettings, SimpleNamespace(poll_interval_seconds=5, generator="mock"))
    return settings, gateway, runtime, health


def test_transient_loop_failure_backs_off_then_recovers(monkeypatch):
    settings, gateway, runtime, health = loop_harness(monkeypatch)
    drain = Mock(side_effect=[httpx.RemoteProtocolError("disconnected"), False, StopLoop()])
    monkeypatch.setattr(worker, "_drain_once", drain)
    sleeps = []

    def sleep(delay):
        sleeps.append((delay, health.snapshot(stale_after_seconds=60)[0]))

    monkeypatch.setattr(worker.time, "sleep", sleep)
    with pytest.raises(StopLoop):
        worker.run_worker_loop(settings)
    assert len(sleeps) == 2
    assert 0.5 <= sleeps[0][0] <= 1.0
    assert sleeps[0][1] == 503
    assert sleeps[1] == (5, 200)
    assert gateway.sweep_stale_running.call_count == 1
    runtime.shutdown.assert_called_once()


@pytest.mark.parametrize("error", [
    httpx.ConnectError("offline"), httpx.ReadError("reset"),
    httpx.WriteError("reset"), httpx.ReadTimeout("timeout"),
    httpx.ConnectTimeout("timeout"), httpx.PoolTimeout("busy"),
    httpx.RemoteProtocolError("disconnect"),
    *[APIError({"code": code, "message": "unavailable"})
      for code in (408, "429", 500, "502", 503, "504", "PGRST003")],
    *[httpx.HTTPStatusError("upstream", request=httpx.Request("GET", "https://test"),
                            response=httpx.Response(code))
      for code in (408, 429, 500, 502, 503, 504)],
])
def test_classified_transient_errors_recover(monkeypatch, error):
    settings, _, _, _ = loop_harness(monkeypatch)
    monkeypatch.setattr(worker, "_drain_once", Mock(side_effect=[error, StopLoop()]))
    sleep = Mock()
    monkeypatch.setattr(worker.time, "sleep", sleep)
    with pytest.raises(StopLoop):
        worker.run_worker_loop(settings)
    sleep.assert_called_once()


@pytest.mark.parametrize("error", [
    ValueError("config"), TypeError("bug"), RuntimeError("wrong model"),
    PermissionError("file permissions"), httpx.LocalProtocolError("bad request"),
    httpx.UnsupportedProtocol("bad URL"),
    *[APIError({"code": code, "message": "permanent"})
      for code in (401, "403", "PGRST202", "42P01", "42501", "unknown")],
    *[httpx.HTTPStatusError("rejected", request=httpx.Request("GET", "https://test"),
                            response=httpx.Response(code))
      for code in (400, 401, 403, 404, 422)],
])
def test_fatal_errors_exit_without_retry(monkeypatch, error):
    settings, _, runtime, health = loop_harness(monkeypatch)
    monkeypatch.setattr(worker, "_drain_once", Mock(side_effect=error))
    sleep = Mock()
    monkeypatch.setattr(worker.time, "sleep", sleep)
    with pytest.raises(type(error)):
        worker.run_worker_loop(settings)
    sleep.assert_not_called()
    runtime.shutdown.assert_called_once()
    assert health.snapshot(stale_after_seconds=60)[0] == 503


def test_retry_backoff_is_capped_and_resets_after_recovery(monkeypatch):
    settings, _, _, _ = loop_harness(monkeypatch)
    disconnect = httpx.RemoteProtocolError("offline")
    monkeypatch.setattr(worker, "_drain_once", Mock(side_effect=[
        *([disconnect] * 9), False, disconnect, StopLoop(),
    ]))
    monkeypatch.setattr(worker.random, "uniform", lambda low, high: high)
    sleeps = []
    monkeypatch.setattr(worker.time, "sleep", sleeps.append)
    with pytest.raises(StopLoop):
        worker.run_worker_loop(settings)
    assert sleeps == [1, 2, 4, 8, 16, 30, 30, 30, 30, 5, 1]


def test_once_reports_transient_failure_without_retry(monkeypatch):
    settings, _, runtime, _ = loop_harness(monkeypatch)
    monkeypatch.setattr(worker, "_drain_once", Mock(side_effect=httpx.ReadTimeout("timeout")))
    sleep = Mock()
    monkeypatch.setattr(worker.time, "sleep", sleep)
    with pytest.raises(httpx.ReadTimeout):
        worker.run_worker_loop(settings, once=True)
    sleep.assert_not_called()
    runtime.shutdown.assert_called_once()
