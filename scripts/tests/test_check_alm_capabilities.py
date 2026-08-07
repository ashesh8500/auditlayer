#!/usr/bin/env python3
"""Static contract tests for scripts/check_alm_capabilities.py.

Run:  python3 scripts/tests/test_check_alm_capabilities.py

Verifies the fail-closed capability preflight contract:
- every named capability has source, state, limitation, and recovery tip;
- complete fixtures classify repository-ready while external/live checks
  remain UNKNOWN;
- missing fixtures block exactly the affected capability and never mask
  unrelated states;
- production-only preview login is rejected;
- secret values are never emitted (fixture values, sentinels, or mismatched
  policy values);
- exit codes are 0 (ready), 2 (blocked), 3 (usage error).

Fixtures prove the software contract only - never live provider availability
or login success.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOOL = ROOT / "scripts" / "check_alm_capabilities.py"
FIXTURES = ROOT / "scripts" / "fixtures" / "alm-capabilities"

sys.path.insert(0, str(ROOT / "scripts"))
import check_alm_capabilities as cap  # noqa: E402

_TMP_ROOT = Path(tempfile.mkdtemp(prefix="alm-cap-tests-"))

EXPECTED_IDS = {
    "google_oauth",
    "magic_link",
    "preview_login",
    "instagram_oauth",
    "public_routes",
    "worker_commands",
    "deepseek_policy",
    "migrations_static",
}

_checks_run = 0


def check(condition: bool, message: str) -> None:
    global _checks_run
    _checks_run += 1
    if not condition:
        raise AssertionError(f"FAILED: {message}")


def run_tool(fixture: Path, extra: list[str] | None = None) -> subprocess.CompletedProcess:
    cmd = [sys.executable, str(TOOL), "--fixture", str(fixture), "--json"]
    if extra:
        cmd.extend(extra)
    return subprocess.run(cmd, capture_output=True, text=True, timeout=120)


def load_json(proc: subprocess.CompletedProcess) -> dict:
    check(proc.stdout, "expected JSON on stdout")
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise AssertionError(f"invalid JSON output: {exc}\n{proc.stdout[:500]}") from exc


def write_fixture(env: dict[str, str], name: str) -> Path:
    path = _TMP_ROOT / f"{name}.json"
    path.write_text(json.dumps({"name": name, "env": env}), encoding="utf-8")
    return path


def test_capability_matrix_complete() -> None:
    check(
        set(cap.CAPABILITY_IDS) == EXPECTED_IDS,
        f"capability matrix must cover {sorted(EXPECTED_IDS)}, got {sorted(cap.CAPABILITY_IDS)}",
    )
    for capability in cap.CAPABILITIES:
        check(
            bool(capability.limitation.strip()),
            f"{capability.id} must carry a limitation statement",
        )
        check(
            bool(capability.recovery.strip()),
            f"{capability.id} must carry a recovery tip",
        )
        check(
            bool(capability.external_label.strip()),
            f"{capability.id} must carry an external verification label",
        )
        check(
            bool(capability.external_command.strip()),
            f"{capability.id} must carry the exact separate release-gate command",
        )
        check(
            bool(capability.artifacts) or capability.repository_hook is not None,
            f"{capability.id} must name repository source artifacts or a hook",
        )


def test_complete_fixture_ready_with_unknown_external() -> None:
    proc = run_tool(FIXTURES / "complete.json")
    check(proc.returncode == 0, f"complete fixture must exit 0, got {proc.returncode}")
    report = load_json(proc)
    check(report["summary"]["repository_ready"] is True, "complete must be repository-ready")
    check(
        report["summary"]["capability_states"] == {"ready": 8, "blocked": 0},
        f"unexpected capability states: {report['summary']['capability_states']}",
    )
    check(report["summary"]["blocked_capabilities"] == [], "no blocked capabilities expected")
    for entry in report["capabilities"]:
        check(entry["state"] == "ready", f"{entry['id']} should be ready")
        check(
            entry["external"]["state"] == "unknown",
            f"{entry['id']} external must be explicitly UNKNOWN",
        )
        check(entry["limitation"], f"{entry['id']} must keep a limitation")
        check(entry["recovery"], f"{entry['id']} must keep a recovery tip")
    check(report["summary"]["external_checks_unknown"] == 8, "all 8 external checks UNKNOWN")
    check(report["summary"]["secret_values_emitted"] is False, "no secret values emitted")
    check("placeholder" not in json.dumps(report), "fixture placeholder values leaked")


def test_missing_fixture_blocks_exact_capabilities() -> None:
    proc = run_tool(FIXTURES / "missing.json")
    check(proc.returncode == 2, f"missing fixture must fail closed (exit 2), got {proc.returncode}")
    report = load_json(proc)
    check(report["summary"]["repository_ready"] is False, "missing must not be repository-ready")

    blocked = set(report["summary"]["blocked_capabilities"])
    expected_blocked = {"preview_login", "instagram_oauth", "worker_commands", "deepseek_policy"}
    check(
        blocked == expected_blocked,
        f"missing fixture must block exactly {sorted(expected_blocked)}, got {sorted(blocked)}",
    )

    # Unrelated capabilities stay ready: one failure must not mask others.
    ready_ids = {e["id"] for e in report["capabilities"] if e["state"] == "ready"}
    check(
        ready_ids == {"google_oauth", "magic_link", "public_routes", "migrations_static"},
        f"unrelated capabilities must stay ready, got {sorted(ready_ids)}",
    )

    for entry in report["blocked"]:
        check(entry["reasons"], f"{entry['id']} blocked entry must carry reasons")
        check(entry["recovery"], f"{entry['id']} blocked entry must carry a recovery tip")
        check(
            entry["id"] in expected_blocked,
            f"unexpected blocked capability {entry['id']}",
        )

    # Affected variables must be named without their values.
    missing = report["summary"]["env_presence"]["missing"]
    check(
        "INSTAGRAM_APP_ID" in missing and "INSTAGRAM_APP_SECRET" in missing,
        "Instagram vars must be listed as missing",
    )
    check("HERMES_MODEL" in missing, "HERMES_MODEL must be listed as missing")

    # Satisfied alternatives must not be reported as missing: with
    # HERMES_MODE=inprocess the worker API key is not required, and the
    # Supabase template satisfies magic link without RESEND_API_KEY.
    worker = next(e for e in report["capabilities"] if e["id"] == "worker_commands")
    check(
        "HERMES_API_KEY" not in worker["env"]["missing"],
        "HERMES_API_KEY must not be missing when HERMES_MODE=inprocess",
    )
    magic = next(e for e in report["capabilities"] if e["id"] == "magic_link")
    check(
        "RESEND_API_KEY" not in magic["env"]["missing"],
        "RESEND_API_KEY must not be missing when the Supabase template is present",
    )

    check(report["summary"]["secret_values_emitted"] is False, "no secret values emitted")
    check("placeholder" not in json.dumps(report), "fixture placeholder values leaked")


def test_production_rejects_preview_login() -> None:
    proc = run_tool(FIXTURES / "production.json")
    check(proc.returncode == 2, f"production fixture must fail closed, got {proc.returncode}")
    report = load_json(proc)
    check(
        "preview_login" in report["summary"]["blocked_capabilities"],
        "preview_login must be blocked in production",
    )
    preview = next(e for e in report["capabilities"] if e["id"] == "preview_login")
    check(preview["state"] == "blocked", "preview_login state must be blocked")
    joined = " | ".join(preview["reasons"]).lower()
    check("production" in joined, f"production rejection must be named, got {preview['reasons']}")

    ready_ids = {e["id"] for e in report["capabilities"] if e["state"] == "ready"}
    check(
        ready_ids == EXPECTED_IDS - {"preview_login"},
        f"only preview_login should be blocked in production, got ready={sorted(ready_ids)}",
    )
    check("placeholder" not in json.dumps(report), "fixture placeholder values leaked")


def test_secret_redaction() -> None:
    sentinel = "ALM_REDACT_SENTINEL_987654321"
    env = {
        "SUPABASE_SERVICE_ROLE_KEY": sentinel,
        "NEXT_PUBLIC_SUPABASE_URL": "https://example.supabase.co",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY": sentinel + "_anon",
        "PREVIEW_TEST_USER_PASSWORD": sentinel + "_pw",
        "PREVIEW_TEST_LOGIN_SECRET": sentinel + "_secret",
    }
    fixture = write_fixture(env, "redact")

    proc = run_tool(fixture)
    check(proc.returncode == 2, "sentinel fixture should fail closed (missing other vars)")
    check(
        sentinel not in proc.stdout and sentinel not in proc.stderr,
        "JSON mode leaked a secret value",
    )
    report = load_json(proc)
    # The key NAME is reported; the VALUE must never be.
    json_text = json.dumps(report)
    check("SUPABASE_SERVICE_ROLE_KEY" in json_text, "key name should be reported")
    check(sentinel not in json_text, "secret value leaked into JSON report")

    human = subprocess.run(
        [sys.executable, str(TOOL), "--fixture", str(fixture)],
        capture_output=True,
        text=True,
        timeout=120,
    )
    check(sentinel not in human.stdout, "human summary leaked a secret value")


def test_independent_failure_states() -> None:
    env = {
        "NEXT_PUBLIC_SUPABASE_URL": "https://example.supabase.co",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY": "anon",
        "NEXT_PUBLIC_SITE_URL": "https://auditlayermedia.com",
        "SUPABASE_SERVICE_ROLE_KEY": "sr",
        "SUPABASE_URL": "https://example.supabase.co",
        "PREVIEW_TEST_USER_PASSWORD": "pw",
        "PREVIEW_TEST_LOGIN_SECRET": "secret",
        "HERMES_API_KEY": "key",
        "HERMES_MODEL": "deepseek-v4-flash",
        "HERMES_PROVIDER": "deepseek",
        "HERMES_MODE": "inprocess",
        "AUDITLAYER_GENERATOR": "hermes",
        "VERCEL_ENV": "preview",
        # INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET deliberately omitted
    }
    fixture = write_fixture(env, "independent")
    proc = run_tool(fixture)
    check(proc.returncode == 2, "independent fixture should block instagram_oauth")
    report = load_json(proc)
    check(
        report["summary"]["blocked_capabilities"] == ["instagram_oauth"],
        f"only instagram_oauth should block, got {report['summary']['blocked_capabilities']}",
    )
    ig = next(e for e in report["capabilities"] if e["id"] == "instagram_oauth")
    check(
        "INSTAGRAM_APP_ID" in ig["env"]["missing"]
        and "INSTAGRAM_APP_SECRET" in ig["env"]["missing"],
        "instagram missing vars must be named",
    )


def test_policy_mismatch_does_not_leak_value() -> None:
    wrong_model = "not-the-flash-model"
    env = {
        "NEXT_PUBLIC_SUPABASE_URL": "https://example.supabase.co",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY": "anon",
        "NEXT_PUBLIC_SITE_URL": "https://auditlayermedia.com",
        "SUPABASE_SERVICE_ROLE_KEY": "sr",
        "SUPABASE_URL": "https://example.supabase.co",
        "PREVIEW_TEST_USER_PASSWORD": "pw",
        "PREVIEW_TEST_LOGIN_SECRET": "secret",
        "HERMES_API_KEY": "key",
        "HERMES_MODEL": wrong_model,
        "HERMES_PROVIDER": "deepseek",
        "HERMES_MODE": "inprocess",
        "AUDITLAYER_GENERATOR": "hermes",
        "VERCEL_ENV": "preview",
    }
    fixture = write_fixture(env, "policy-mismatch")
    proc = run_tool(fixture)
    check(proc.returncode == 2, "policy mismatch must fail closed")
    report = load_json(proc)
    check("deepseek_policy" in report["summary"]["blocked_capabilities"], "deepseek_policy blocked")
    check(wrong_model not in json.dumps(report), "policy mismatch leaked the observed value")
    ds = next(e for e in report["capabilities"] if e["id"] == "deepseek_policy")
    joined = " | ".join(ds["reasons"])
    check("HERMES_MODEL" in joined, "reason must name the key")
    check("deepseek-v4-flash" in joined, "reason must name the expected policy value")


def test_migrations_static_contract_runs() -> None:
    proc = run_tool(FIXTURES / "complete.json")
    report = load_json(proc)
    migrations = next(e for e in report["capabilities"] if e["id"] == "migrations_static")
    check(migrations["state"] == "ready", "migrations_static must be ready in complete fixture")
    check(
        migrations["repository"]["detail"],
        "migrations_static must expose the static check output",
    )
    # The same repo state must hold in the missing fixture (env cannot change it).
    proc2 = run_tool(FIXTURES / "missing.json")
    report2 = load_json(proc2)
    migrations2 = next(e for e in report2["capabilities"] if e["id"] == "migrations_static")
    check(migrations2["state"] == "ready", "migrations_static must stay ready in missing fixture")


def test_usage_error_fixture_not_found() -> None:
    proc = subprocess.run(
        [sys.executable, str(TOOL), "--fixture", "does-not-exist.json", "--json"],
        capture_output=True,
        text=True,
        timeout=60,
    )
    check(proc.returncode == 3, f"missing fixture file must exit 3, got {proc.returncode}")


def test_real_environment_mode_runs_without_values() -> None:
    proc = subprocess.run(
        [sys.executable, str(TOOL), "--json"],
        capture_output=True,
        text=True,
        timeout=120,
        env={"PATH": os.environ.get("PATH", ""), "HOME": os.environ.get("HOME", "")},
    )
    check(proc.returncode in (0, 2), f"real-env mode must exit 0 or 2, got {proc.returncode}")
    report = load_json(proc)
    check(report["environment_mode"] == "real-environment", "mode must be real-environment")
    check(report["summary"]["secret_values_emitted"] is False, "no secret values emitted")
    for entry in report["capabilities"]:
        for value in entry["env"]["present"]:
            check(not value.startswith(("http", "secret", "key")), "env lists contain names only")


def main() -> int:
    test_capability_matrix_complete()
    test_complete_fixture_ready_with_unknown_external()
    test_missing_fixture_blocks_exact_capabilities()
    test_production_rejects_preview_login()
    test_secret_redaction()
    test_independent_failure_states()
    test_policy_mismatch_does_not_leak_value()
    test_migrations_static_contract_runs()
    test_usage_error_fixture_not_found()
    test_real_environment_mode_runs_without_values()
    shutil.rmtree(_TMP_ROOT, ignore_errors=True)
    print(f"ALM CAPABILITY PREFLIGHT TESTS PASSED ({_checks_run} assertions)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
