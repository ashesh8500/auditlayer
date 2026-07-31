from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
PROFILES = ("operator", "dev", "ops", "report")
FORBIDDEN_SECRET_NAMES = {
    "TELEGRAM_BOT_TOKEN",
    "DEEPSEEK_API_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "API_SERVER_KEY",
    "SENTRY_DSN",
}


def load_yaml(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def test_manifest_declares_exact_canonical_profiles() -> None:
    manifest = load_yaml(ROOT / "manifest.yaml")
    assert manifest["bundle_version"]
    assert tuple(manifest["profiles"]) == PROFILES


@pytest.mark.parametrize("profile", PROFILES)
def test_every_profile_has_soul_and_config(profile: str) -> None:
    base = ROOT / "profiles" / profile
    assert (base / "SOUL.md").is_file()
    assert (base / "config.yaml").is_file()


@pytest.mark.parametrize("profile", PROFILES)
def test_all_alm_profiles_use_deepseek_v4_flash_without_fallback(profile: str) -> None:
    config = load_yaml(ROOT / "profiles" / profile / "config.yaml")
    assert config["model"]["provider"] == "deepseek"
    assert config["model"]["default"] == "deepseek-v4-flash"
    assert config.get("fallback_providers", []) == []


def test_report_profile_is_noninteractive_and_strictly_bounded() -> None:
    config = load_yaml(ROOT / "profiles" / "report" / "config.yaml")
    assert config["telegram"]["enabled"] is False
    disabled = set(config["agent"]["disabled_toolsets"])
    assert {
        "terminal",
        "file",
        "code_execution",
        "delegation",
        "memory",
        "messaging",
        "cronjob",
        "computer_use",
        "skills",
        "session_search",
    } <= disabled
    assert config["platform_toolsets"]["api_server"] == ["web"]


def test_operator_profile_has_no_direct_shell_or_deployment_surface() -> None:
    config = load_yaml(ROOT / "profiles" / "operator" / "config.yaml")
    disabled = set(config["agent"]["disabled_toolsets"])
    assert {"terminal", "file", "code_execution", "computer_use"} <= disabled
    assert config["telegram"]["enabled"] is False
    assert config["memory"]["memory_enabled"] is True
    assert config["memory"]["user_profile_enabled"] is False
    assert config["platform_toolsets"]["api_server"] == []


def test_configs_and_manifest_contain_no_secrets() -> None:
    files = [ROOT / "manifest.yaml", *ROOT.glob("profiles/*/config.yaml")]
    for path in files:
        text = path.read_text(encoding="utf-8")
        for name in FORBIDDEN_SECRET_NAMES:
            assert name not in text, f"{name} must not be committed in {path}"


def test_manifest_is_json_serializable_for_drift_tooling() -> None:
    manifest = load_yaml(ROOT / "manifest.yaml")
    json.dumps(manifest)
