from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "install_profile.py"


def load_module():
    spec = importlib.util.spec_from_file_location("install_profile", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_materialize_creates_runtime_profile_and_shared_context(tmp_path: Path) -> None:
    mod = load_module()
    target = mod.materialize(ROOT, tmp_path / ".hermes", "operator")
    assert target == tmp_path / ".hermes" / "profiles" / "alm"
    assert (target / "config.yaml").read_text() == (
        ROOT / "profiles" / "operator" / "config.yaml"
    ).read_text()
    assert (target / "SOUL.md").is_file()
    assert (target / "context" / "COMPANY.md").is_file()
    assert (target / "skills" / "productivity" / "alm-report-generator" / "SKILL.md").is_file()
    assert (target / ".alm-bundle-version").read_text().strip() == "1.0.0"


def test_materialize_preserves_profile_secrets_and_runtime_state(tmp_path: Path) -> None:
    mod = load_module()
    home = tmp_path / ".hermes"
    target = home / "profiles" / "alm"
    target.mkdir(parents=True)
    (target / ".env").write_text("TELEGRAM_BOT_TOKEN=secret\n")
    (target / "state.db").write_text("runtime")

    mod.materialize(ROOT, home, "operator")

    assert (target / ".env").read_text() == "TELEGRAM_BOT_TOKEN=secret\n"
    assert (target / "state.db").read_text() == "runtime"


def test_materialize_rejects_unknown_profile(tmp_path: Path) -> None:
    mod = load_module()
    with pytest.raises(ValueError, match="unknown canonical profile"):
        mod.materialize(ROOT, tmp_path / ".hermes", "unknown")


def test_drift_detects_managed_file_change(tmp_path: Path) -> None:
    mod = load_module()
    home = tmp_path / ".hermes"
    target = mod.materialize(ROOT, home, "report")
    assert mod.check_drift(ROOT, home, "report") == []
    (target / "config.yaml").write_text("model: {}\n")
    assert mod.check_drift(ROOT, home, "report") == ["config.yaml"]
