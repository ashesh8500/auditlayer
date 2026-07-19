import json

from auditlayer_worker.observability import WorkerHealth, log_event


def test_worker_health_reports_current_loop_as_ok() -> None:
    health = WorkerHealth()
    health.heartbeat(worked=True)

    status, payload = health.snapshot(stale_after_seconds=60)

    assert status == 200
    assert payload["status"] == "ok"
    assert payload["last_loop_worked"] is True
    assert payload["last_error_type"] is None


def test_structured_log_is_machine_readable(capsys) -> None:
    log_event("audit_finished", audit_id="audit-1", cost_usd=0.42)

    payload = json.loads(capsys.readouterr().out)
    assert payload["service"] == "auditlayer-worker"
    assert payload["event"] == "audit_finished"
    assert payload["audit_id"] == "audit-1"
