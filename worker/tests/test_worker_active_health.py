"""Clock-driven liveness tests; never sleep or call inference."""
import pytest

from auditlayer_worker import observability
from auditlayer_worker.observability import WorkerHealth


@pytest.fixture
def clock(monkeypatch):
    now = [100.0]
    monkeypatch.setattr(observability.time, "monotonic", lambda: now[0])
    return now


def test_active_job_has_fixed_budget_not_poll_heartbeat(clock):
    health = WorkerHealth()
    health.heartbeat(worked=False)
    health.start_job(kind="audit", budget_seconds=900)
    clock[0] += 61
    status, body = health.snapshot(stale_after_seconds=60)
    assert status == 200
    assert body["active_job_kind"] == "audit"
    assert body["active_job_age_seconds"] == 61
    clock[0] += 839
    assert health.snapshot(stale_after_seconds=60)[0] == 503
    health.heartbeat(worked=True)  # Even a periodic heartbeat cannot hide a stall.
    assert health.snapshot(stale_after_seconds=60)[0] == 503
    health.end_job()
    assert health.snapshot(stale_after_seconds=60)[0] == 200
    clock[0] += 61
    assert health.snapshot(stale_after_seconds=60)[0] == 503


def test_actual_error_is_unhealthy_until_successful_recovery(clock):
    health = WorkerHealth()
    health.heartbeat(worked=False, error_type="ReadTimeout")
    assert health.snapshot(stale_after_seconds=60)[0] == 503
    health.start_job(kind="refinement", budget_seconds=900)
    assert health.snapshot(stale_after_seconds=60)[0] == 503
    health.end_job(error_type="RefinementJobFailed")
    assert health.snapshot(stale_after_seconds=60)[0] == 503
    health.heartbeat(worked=False)
    assert health.snapshot(stale_after_seconds=60)[0] == 200


@pytest.mark.parametrize("budget", [0, -1, float("inf"), float("nan")])
def test_active_health_budget_must_be_finite_positive(clock, budget):
    health = WorkerHealth()
    with pytest.raises(ValueError):
        health.start_job(kind="audit", budget_seconds=budget)


def test_active_budget_cannot_be_renewed_by_starting_twice(clock):
    health = WorkerHealth()
    health.start_job(kind="audit", budget_seconds=900)
    clock[0] += 899
    with pytest.raises(RuntimeError):
        health.start_job(kind="audit", budget_seconds=900)
    clock[0] += 1
    assert health.snapshot(stale_after_seconds=60)[0] == 503
