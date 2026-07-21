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
    get_report_bundle_version,
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
    """Existing legacy config remains untouched when no canonical bundle is supplied."""
    monkeypatch.setattr("auditlayer_worker.account_homes.ACCOUNTS_ROOT", tmp_path)
    home = ensure_account_home("acct-config")
    config = home / "config.yaml"
    config.write_text("# custom config")
    ensure_account_home("acct-config")
    assert config.read_text() == "# custom config"


def _profile_bundle(tmp_path: Path, version: str = "1.0.0") -> Path:
    bundle = tmp_path / "bundle"
    (bundle / "profiles" / "report").mkdir(parents=True)
    (bundle / "shared").mkdir()
    (bundle / "skills" / "productivity" / "alm-report-generator").mkdir(parents=True)
    (bundle / "manifest.yaml").write_text(
        f'bundle_version: "{version}"\nprofiles: [report]\nruntime_names: {{report: alm-report}}\n'
    )
    (bundle / "profiles" / "report" / "config.yaml").write_text(
        "model:\n  default: deepseek-v4-flash\n  provider: deepseek\n"
    )
    (bundle / "profiles" / "report" / "SOUL.md").write_text("# Restricted report runtime\n")
    (bundle / "shared" / "MODEL_POLICY.md").write_text("DeepSeek V4 Flash only.\n")
    (bundle / "skills" / "productivity" / "alm-report-generator" / "SKILL.md").write_text(
        "---\nname: alm-report-generator\n---\n# Report generation\n"
    )
    return bundle


def test_ensure_account_home_seeds_canonical_report_bundle(tmp_path: Path) -> None:
    bundle = _profile_bundle(tmp_path)
    assert get_report_bundle_version(bundle) == "1.0.0"
    home = ensure_account_home(
        "acct-bundle",
        accounts_root=tmp_path / "accounts",
        bundle_root=bundle,
    )
    assert "deepseek-v4-flash" in (home / "config.yaml").read_text()
    assert (home / "SOUL.md").read_text() == "# Restricted report runtime\n"
    assert (home / "context" / "MODEL_POLICY.md").is_file()
    assert (home / "skills" / "productivity" / "alm-report-generator" / "SKILL.md").is_file()
    assert (home / ".alm-bundle-version").read_text().strip() == "1.0.0"


def test_bundle_upgrade_updates_policy_but_preserves_account_memory(tmp_path: Path) -> None:
    bundle = _profile_bundle(tmp_path, "1.0.0")
    home = ensure_account_home(
        "acct-upgrade",
        accounts_root=tmp_path / "accounts",
        bundle_root=bundle,
    )
    memory = home / "memories" / "MEMORY.md"
    memory.write_text("creator-specific memory\n")
    (bundle / "manifest.yaml").write_text(
        'bundle_version: "1.1.0"\nprofiles: [report]\nruntime_names: {report: alm-report}\n'
    )
    (bundle / "profiles" / "report" / "SOUL.md").write_text("# Updated policy\n")

    ensure_account_home(
        "acct-upgrade",
        accounts_root=tmp_path / "accounts",
        bundle_root=bundle,
    )

    assert (home / "SOUL.md").read_text() == "# Updated policy\n"
    assert memory.read_text() == "creator-specific memory\n"
    assert (home / ".alm-bundle-version").read_text().strip() == "1.1.0"


def test_bundle_seed_rejects_missing_report_profile(tmp_path: Path) -> None:
    bundle = tmp_path / "broken"
    bundle.mkdir()
    (bundle / "manifest.yaml").write_text('bundle_version: "1.0.0"\n')
    try:
        ensure_account_home(
            "acct-broken",
            accounts_root=tmp_path / "accounts",
            bundle_root=bundle,
        )
        assert False, "expected invalid bundle to fail closed"
    except FileNotFoundError as exc:
        assert "report profile" in str(exc)


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


def test_worker_settings_default_to_repository_profile_bundle() -> None:
    settings = WorkerSettings.from_env()
    expected = Path(__file__).resolve().parents[2] / "hermes-profile"
    assert Path(settings.alm_profile_bundle_root).resolve() == expected.resolve()


def test_pipeline_passes_canonical_bundle_to_account_home(tmp_path: Path, monkeypatch) -> None:
    settings = _settings(tmp_path, tmp_path / "accounts")
    calls: list[tuple[str, str, str]] = []

    def _ensure(account_id, accounts_root, bundle_root):
        calls.append((account_id, str(accounts_root), str(bundle_root)))
        home = Path(accounts_root) / account_id
        home.mkdir(parents=True, exist_ok=True)
        return home

    monkeypatch.setattr("auditlayer_worker.pipeline.ensure_account_home", _ensure)
    audit = AuditRecord(
        id="bundle-wire-1",
        handle="test_user",
        platform="instagram",
        goal="growth",
        context="test creator",
        user_id="user-bundle-1",
        plan=Plan.STARTER.value,
    )
    summary = GenerationPipeline(settings, MockReportGenerator()).run(
        audit, PrintEventSink(), gateway=None
    )
    assert summary.status == "ready"
    assert calls == [
        (
            "user-bundle-1",
            settings.alm_accounts_root,
            settings.alm_profile_bundle_root,
        )
    ]


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
