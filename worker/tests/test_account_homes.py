"""Tests for account_homes.py — per-account HERMES_HOME provisioning.

Covers :func:`~auditlayer_worker.account_homes.ensure_account_home` and the
pipeline wiring that sets ``HERMES_HOME`` before generation.
"""

from __future__ import annotations

import os
from dataclasses import replace
from pathlib import Path

from auditlayer_worker.account_homes import (
    ACCOUNTS_ROOT,
    ensure_account_home,
    get_account_hermes_home,
)
from auditlayer_worker.config import WorkerSettings
from auditlayer_worker.core import AuditRecord, Plan
from auditlayer_worker.generation import MockReportGenerator
from auditlayer_worker.pipeline import GenerationPipeline, PrintEventSink


def _settings(tmp_path: Path, accounts_root: Path) -> WorkerSettings:
    return replace(
        WorkerSettings.from_env(),
        generator="mock",
        output_dir=tmp_path,
        pdf_mode="stub",
        alm_accounts_root=str(accounts_root),
    )


# ---------------------------------------------------------------------------
# ensure_account_home
# ---------------------------------------------------------------------------


def test_ensure_account_home_creates_directory(tmp_path: Path, monkeypatch) -> None:
    """The function creates the full directory tree and returns an absolute path."""
    monkeypatch.setattr("auditlayer_worker.account_homes.ACCOUNTS_ROOT", tmp_path)
    home = ensure_account_home("test-user-abc")
    assert home.exists(), "home directory should exist"
    assert home.is_dir(), "home should be a directory"
    assert home.name == "test-user-abc"
    assert home.parent == tmp_path
    assert home.is_absolute(), "should return absolute path"


def test_ensure_account_home_idempotent(tmp_path: Path, monkeypatch) -> None:
    """Calling twice with the same account_id returns the same path (no error)."""
    monkeypatch.setattr("auditlayer_worker.account_homes.ACCOUNTS_ROOT", tmp_path)
    first = ensure_account_home("demo-123")
    second = ensure_account_home("demo-123")
    assert first == second
    assert first.exists()


def test_ensure_account_home_creates_subdirs(tmp_path: Path, monkeypatch) -> None:
    """The home directory includes config.yaml, sessions/, memories/, logs/."""
    monkeypatch.setattr("auditlayer_worker.account_homes.ACCOUNTS_ROOT", tmp_path)
    home = ensure_account_home("acct-subs")
    assert (home / "config.yaml").exists()
    assert (home / "sessions").is_dir()
    assert (home / "memories").is_dir()
    assert (home / "logs").is_dir()


def test_ensure_account_home_config_not_overwritten(tmp_path: Path, monkeypatch) -> None:
    """Existing config.yaml is left untouched on second call."""
    monkeypatch.setattr("auditlayer_worker.account_homes.ACCOUNTS_ROOT", tmp_path)
    home = ensure_account_home("acct-config")
    config = home / "config.yaml"
    config.write_text("# custom config")
    ensure_account_home("acct-config")
    assert config.read_text() == "# custom config"


def test_ensure_account_home_rejects_path_traversal(tmp_path: Path) -> None:
    """A malicious account_id cannot create directories outside accounts_root."""
    try:
        ensure_account_home("../escape", accounts_root=tmp_path / "accounts")
        assert False, "expected path traversal account_id to be rejected"
    except ValueError as exc:
        assert "escapes accounts root" in str(exc)
    assert not (tmp_path / "escape").exists()


def test_get_account_hermes_home_returns_string(tmp_path: Path, monkeypatch) -> None:
    """get_account_hermes_home returns the path as a string."""
    monkeypatch.setattr("auditlayer_worker.account_homes.ACCOUNTS_ROOT", tmp_path)
    path = get_account_hermes_home("str-test")
    assert isinstance(path, str)
    assert path == str((tmp_path / "str-test").resolve())
    assert os.path.isdir(path)


def test_default_root_uses_env_var(monkeypatch) -> None:
    """The ACCOUNTS_ROOT respects ALM_ACCOUNTS_ROOT env var."""
    monkeypatch.setenv("ALM_ACCOUNTS_ROOT", "/tmp/test-alm-accounts")
    import importlib
    import auditlayer_worker.account_homes as ah
    importlib.reload(ah)
    assert str(ah.ACCOUNTS_ROOT) == "/tmp/test-alm-accounts"


# ---------------------------------------------------------------------------
# Pipeline wiring: ensure_account_home called somewhere in the path
# ---------------------------------------------------------------------------


def test_basic_account_home_creation(tmp_path: Path, monkeypatch) -> None:
    """Running a pipeline creates the account home directory."""
    monkeypatch.setattr("auditlayer_worker.account_homes.ACCOUNTS_ROOT", tmp_path / "alm-accounts")
    settings = _settings(tmp_path, tmp_path / "alm-accounts")
    audit = AuditRecord(
        id="home-test-1",
        handle="test_user",
        platform="instagram",
        goal="growth",
        context="test creator",
        user_id="user-abc-123",
        plan=Plan.STARTER.value,
    )
    pipeline = GenerationPipeline(settings, MockReportGenerator())
    sink = PrintEventSink()
    summary = pipeline.run(audit, sink, gateway=None)

    assert summary.status == "ready"

    # Verify the account home directory was created somewhere
    expected = tmp_path / "alm-accounts" / "user-abc-123"
    assert expected.exists(), f"account home should have been created at {expected}"


def test_pipeline_marks_failed_when_account_home_setup_fails(tmp_path: Path, monkeypatch) -> None:
    """Account home provisioning errors fail the audit but do not escape run()."""
    settings = _settings(tmp_path, tmp_path / "accounts")
    audit = AuditRecord(
        id="home-fail-1",
        handle="test_user",
        platform="instagram",
        goal="growth",
        context="test creator",
        user_id="user-abc-123",
        plan=Plan.STARTER.value,
    )

    def _raise(*_args, **_kwargs):
        raise PermissionError("accounts root unwritable")

    class _Gateway:
        def __init__(self) -> None:
            self.updates = []

        def update_audit(self, audit_id: str, **fields) -> None:
            self.updates.append((audit_id, fields))

    monkeypatch.setattr("auditlayer_worker.pipeline.ensure_account_home", _raise)
    gateway = _Gateway()
    sink = PrintEventSink()
    summary = GenerationPipeline(settings, MockReportGenerator()).run(
        audit,
        sink,
        gateway=gateway,
    )

    assert summary.status == "failed"
    assert "Account home setup failed" in summary.note
    assert gateway.updates[0][0] == audit.id
    assert gateway.updates[0][1]["status"] == "failed"
    assert [phase for _, phase, _ in sink.events][-1] == "failed"


def test_refine_uses_account_home_isolation(tmp_path: Path) -> None:
    """refine() sets HERMES_HOME to the account-scoped directory before calling the generator."""
    settings = _settings(tmp_path, tmp_path / "alm-accounts")
    audit = AuditRecord(
        id="refine-home-1",
        handle="test_user",
        platform="instagram",
        goal="growth",
        context="test creator",
        user_id="user-xyz-789",
        plan=Plan.STARTER.value,
    )
    pipeline = GenerationPipeline(settings, MockReportGenerator())
    sink = PrintEventSink()
    current_html = "<html><body><section><h2>Strengths</h2><p>old</p></section></body></html>"

    new_html, t_in, t_out = pipeline.refine(
        audit, current_html, "Strengths", "Make it stronger", sink,
    )

    assert t_in > 0
    assert t_out > 0
    # The account home should have been created
    expected = tmp_path / "alm-accounts" / "user-xyz-789"
    assert expected.exists(), f"account home should have been created at {expected}"
    assert (expected / "config.yaml").exists()
    assert (expected / "memories").is_dir()
    assert (expected / "sessions").is_dir()
    # HERMES_HOME should have been cleaned up after refine returns
    assert os.environ.get("HERMES_HOME") is None or os.environ["HERMES_HOME"] != str(expected)
