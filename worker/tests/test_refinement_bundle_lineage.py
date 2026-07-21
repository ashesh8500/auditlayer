from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

from auditlayer_worker import worker


class _AuditQuery:
    def __init__(self, row: dict):
        self.row = row

    def select(self, _columns: str):
        return self

    def eq(self, _column: str, _value: str):
        return self

    def limit(self, _count: int):
        return self

    def execute(self):
        return SimpleNamespace(data=[self.row])


class _Client:
    def __init__(self, row: dict):
        self.row = row

    def table(self, name: str):
        assert name == "audits"
        return _AuditQuery(self.row)


class _Gateway:
    def __init__(self, row: dict):
        self.client = _Client(row)
        self.calls: list[tuple[str, object]] = []

    def upload_report(self, audit_id: str, _html: str):
        self.calls.append(("upload", audit_id))
        return f"{audit_id}/versions/new.html", ""

    def update_audit(self, audit_id: str, **fields):
        self.calls.append(("update_audit", (audit_id, fields)))

    def finalize_refinement_report(self, **params):
        self.calls.append(("finalize", params))
        return 2

    def emit_event(self, *args, **kwargs):
        self.calls.append(("event", (args, kwargs)))

    def update_refinement(self, *args, **kwargs):
        self.calls.append(("update_refinement", (args, kwargs)))


class _Pipeline:
    def refine(self, *_args, **_kwargs):
        return "<html>refined</html>", 10, 5


def test_refinement_stamps_current_bundle_before_version_finalization(
    tmp_path: Path, monkeypatch
) -> None:
    bundle = tmp_path / "hermes-profile"
    bundle.mkdir()
    (bundle / "manifest.yaml").write_text('bundle_version: "1.0.0"\n', encoding="utf-8")
    settings = SimpleNamespace(
        alm_profile_bundle_root=bundle,
        reports_bucket="reports",
    )
    gateway = _Gateway(
        {
            "id": "audit-1",
            "handle": "creator",
            "platform": "instagram",
            "goal": "growth",
            "user_id": "user-1",
            "report_path": "audit-1/current.html",
        }
    )
    monkeypatch.setattr(worker, "_download_report", lambda *_args: "<html>old</html>")

    worker._process_refinement(
        cast(Any, settings),
        cast(Any, gateway),
        cast(Any, _Pipeline()),
        {
            "id": "refinement-1",
            "audit_id": "audit-1",
            "section": "Executive Summary",
            "instruction": "Tighten the recommendation",
        },
    )

    names = [name for name, _payload in gateway.calls]
    assert "update_audit" not in names
    finalize = cast(dict[str, Any], next(payload for name, payload in gateway.calls if name == "finalize"))
    assert finalize["agent_bundle_version"] == "1.0.0"
