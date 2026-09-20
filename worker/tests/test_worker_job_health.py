"""Exercise the real claim/drain/loop boundaries with fake external work."""
from unittest.mock import Mock

import httpx
import pytest

from auditlayer_worker import worker
from test_worker_recovery import StopLoop, loop_harness


def job_harness(monkeypatch):
    settings, gateway, runtime, health = loop_harness(monkeypatch)
    gateway.claim_next_queued.return_value = {
        "id": "audit-1", "handle": "test", "platform": "instagram", "goal": "growth",
    }
    gateway.claim_next_refinement.return_value = None
    pipeline = Mock()
    pipeline.run.return_value = Mock(status="ready")
    monkeypatch.setattr(worker, "build_generator", lambda *a, **kw: object())
    monkeypatch.setattr(worker, "GenerationPipeline", lambda *a: pipeline)
    health.heartbeat(worked=False)
    return settings, gateway, runtime, health, pipeline


@pytest.mark.parametrize("kind", ["audit", "refinement"])
def test_claimed_job_healthy_past_poll_window_but_not_forever(monkeypatch, kind):
    settings, gateway, _, health, pipeline = job_harness(monkeypatch)
    clock = [100.0]
    monkeypatch.setattr(worker.time, "monotonic", lambda: clock[0])
    health.heartbeat(worked=False)

    def process(*args, **kwargs):
        clock[0] += 61
        status, body = health.snapshot(stale_after_seconds=60)
        assert status == 200
        assert body["active_job_kind"] == kind
        clock[0] += 900
        assert health.snapshot(stale_after_seconds=60)[0] == 503
        return Mock(status="ready") if kind == "audit" else True

    if kind == "audit":
        pipeline.run.side_effect = process
    else:
        gateway.claim_next_queued.return_value = None
        gateway.claim_next_refinement.return_value = {"id": "refinement-1"}
        monkeypatch.setattr(worker, "_process_refinement", process)
    worker.run_worker_loop(settings, once=True)
    status, body = health.snapshot(stale_after_seconds=60)
    assert status == 200
    assert body["active_job_kind"] is None


@pytest.mark.parametrize("kind", ["audit", "refinement"])
@pytest.mark.parametrize("job_status", ["failed", "blocked", "running"])
def test_returned_job_failure_does_not_become_healthy_on_same_loop(monkeypatch, kind, job_status):
    settings, gateway, _, health, pipeline = job_harness(monkeypatch)
    pipeline.run.return_value = Mock(status=job_status)
    if kind == "refinement":
        gateway.claim_next_queued.return_value = None
        gateway.claim_next_refinement.return_value = {"id": "refinement-1"}
        monkeypatch.setattr(worker, "_process_refinement", lambda *a: False)
    worker.run_worker_loop(settings, once=True)
    status, body = health.snapshot(stale_after_seconds=60)
    assert status == 503
    assert body["last_error_type"]
    assert body["active_job_kind"] is None


@pytest.mark.parametrize("boundary", ["claim", "finalization", "reaper"])
def test_ambiguous_writes_never_replay_a_claimed_job(monkeypatch, boundary):
    settings, gateway, _, health, pipeline = job_harness(monkeypatch)
    row = gateway.claim_next_queued.return_value
    state = {"status": "queued"}
    claims = []

    def claim():
        claims.append(state["status"])
        if state["status"] == "queued":
            state["status"] = "running"  # DB commit before lost response.
            if boundary == "claim":
                raise httpx.RemoteProtocolError("claim response lost")
            return row
        return None

    def process(*args, **kwargs):
        state["status"] = "ready"  # Finalize commit before lost response.
        if boundary == "finalization":
            raise httpx.ReadTimeout("finalize response lost")
        return Mock(status="ready")

    gateway.claim_next_queued.side_effect = claim
    pipeline.run.side_effect = process
    if boundary == "reaper":
        gateway.sweep_stale_running.side_effect = [httpx.ReadError("lost response"), 0]
    snapshots = []

    def sleep(delay):
        snapshots.append(health.snapshot(stale_after_seconds=60))
        if len(snapshots) == 2:
            raise StopLoop()

    monkeypatch.setattr(worker.time, "sleep", sleep)
    with pytest.raises(StopLoop):
        worker.run_worker_loop(settings)
    assert claims == ["queued", "running" if boundary == "claim" else "ready"]
    assert pipeline.run.call_count == (0 if boundary == "claim" else 1)
    assert [status for status, _ in snapshots] == [503, 200]
    assert all(body["active_job_kind"] is None for _, body in snapshots)


@pytest.mark.parametrize("boundary", ["finalization", "success_event"])
def test_refinement_ambiguous_completion_never_overwrites_done(monkeypatch, boundary):
    settings, gateway, _, _, pipeline = job_harness(monkeypatch)
    gateway.client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        gateway.claim_next_queued.return_value
    ]
    pipeline.refine.return_value = ("<html>refined</html>", 10, 5)
    gateway.upload_report.return_value = ("audit-1/versions/new.html", "")
    monkeypatch.setattr(worker, "_download_report", lambda *a: "<html>old</html>")
    monkeypatch.setattr(worker, "get_report_bundle_version", lambda *a: "test")
    # The harness settings are deliberately inert, not loaded from .env.
    from types import SimpleNamespace
    from typing import Any, cast
    settings = cast(Any, SimpleNamespace(alm_profile_bundle_root="unused"))
    if boundary == "finalization":
        gateway.finalize_refinement_report.side_effect = httpx.ReadTimeout("response lost")
    else:
        gateway.finalize_refinement_report.return_value = 2
        gateway.emit_event.side_effect = [httpx.ReadTimeout("event response lost"), None]
    with pytest.raises(httpx.ReadTimeout):
        worker._process_refinement_attempt(settings, gateway, pipeline, {
            "id": "refinement-1", "audit_id": "audit-1", "section": "Summary",
        })
    gateway.update_refinement.assert_not_called()
    assert pipeline.refine.call_count == 1
    assert gateway.finalize_refinement_report.call_count == 1


def test_refinement_known_noncommit_is_terminal_not_ambiguous(monkeypatch):
    from auditlayer_worker.supabase_client import ReportFinalizationRejected
    settings, gateway, _, _, pipeline = job_harness(monkeypatch)
    gateway.client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [gateway.claim_next_queued.return_value]
    pipeline.refine.return_value = ('<html>new</html>', 10, 5)
    gateway.upload_report.return_value = ('new.html', '')
    monkeypatch.setattr(worker, '_download_report', lambda *a: '<html>old</html>')
    monkeypatch.setattr(worker, 'get_report_bundle_version', lambda *a: 'test')
    settings.alm_profile_bundle_root = 'unused'
    gateway.finalize_refinement_report.side_effect = ReportFinalizationRejected('base changed')
    assert worker._process_refinement_attempt(settings, gateway, pipeline, {'id':'r','audit_id':'a','section':'Summary'}) is False
    assert gateway.update_refinement.call_args.kwargs['status'] == 'failed'


@pytest.mark.parametrize("operation", [
    "get_app_settings", "claim_next_queued", "claim_next_refinement",
    "sweep_retryable", "sweep_stale_running", "sweep_stale_report_generation_runs",
])
def test_each_exposed_control_plane_boundary_recovers(monkeypatch, operation):
    settings, gateway, _, health, pipeline = job_harness(monkeypatch)
    gateway.claim_next_queued.return_value = None
    target = getattr(gateway, operation)
    target.side_effect = [httpx.ConnectError("offline"), target.return_value]
    statuses = []

    def sleep(delay):
        statuses.append(health.snapshot(stale_after_seconds=60)[0])
        if len(statuses) == 2:
            raise StopLoop()

    monkeypatch.setattr(worker.time, "sleep", sleep)
    with pytest.raises(StopLoop):
        worker.run_worker_loop(settings)
    assert statuses == [503, 200]
    pipeline.run.assert_not_called()
    assert target.call_count == 2
