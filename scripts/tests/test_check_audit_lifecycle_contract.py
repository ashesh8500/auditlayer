#!/usr/bin/env python3
"""Focused contract tests for scripts/check_audit_lifecycle_contract.py.

Run:  python3 scripts/tests/test_check_audit_lifecycle_contract.py

Verifies the static audit-lifecycle vocabulary drift contract:
- the real repository contract passes and the deterministic JSON artifact is
  byte-identical across reruns with provider_calls=0 and no env paths or
  wall-clock timestamps;
- the canonical seven-state set has one authoritative owner and explicit
  customer/founder projections;
- separate vocabularies (report-attempt, intelligence-run, batch, progress,
  event-phase, refinement, operator, proposal, recommendation, onboarding,
  runtime-telemetry) stay distinct and never conflate with audits.status;
- mutation fixtures fail closed for missing source, unmapped literal,
  duplicate owner, vocabulary conflation, and unsafe customer projection;
- ambiguous ownership renders UNKNOWN with the exact path and a correction tip,
  never silently promoted to success.

Fixtures prove the software contract only - never live queue execution,
concurrency, recovery, or customer experience.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOOL = ROOT / "scripts" / "check_audit_lifecycle_contract.py"
MANIFEST = ROOT / "scripts" / "fixtures" / "alm-lifecycle" / "manifest.v1.json"
MUTATIONS = ROOT / "scripts" / "fixtures" / "alm-lifecycle" / "mutations"

REQUIRED_MUTATIONS = {
    "missing-source": "missing",
    "unmapped-literal": "unmapped literal",
    "duplicate-owner": "duplicate/mirror owner drift",
    "vocabulary-conflation": "vocabulary conflation",
    "unsafe-customer": "unsafe customer projection",
}

_checks_run = 0


def check(condition: bool, message: str) -> None:
    global _checks_run
    _checks_run += 1
    if not condition:
        raise AssertionError(f"FAILED: {message}")


def run_tool(*args: str, timeout: int = 120) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(TOOL), *args],
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def load_json(proc: subprocess.CompletedProcess, path: Path) -> dict:
    check(proc.returncode == 0, f"expected exit 0, got {proc.returncode}: {proc.stderr}")
    data = json.loads(path.read_text(encoding="utf-8"))
    return data


def test_real_repo_passes() -> dict:
    with tempfile.TemporaryDirectory(prefix="alm-lifecycle-real-") as tmp:
        out = Path(tmp) / "contract.json"
        proc = run_tool("--output", str(out))
        check(
            proc.returncode == 0,
            f"real repo contract must pass; got {proc.returncode}: {proc.stderr}",
        )
        check("AUDIT LIFECYCLE CONTRACT PASSED" in proc.stdout, proc.stdout)
        artifact = load_json(proc, out)
        return artifact


def test_artifact_invariants(artifact: dict) -> None:
    check(artifact["provider_calls"] == 0, "provider_calls must be 0")
    check(
        artifact["canonical_audit_states"]
        == ["draft", "queued", "running", "ready", "needs_review", "blocked", "failed"],
        "canonical seven-state set must be exact",
    )
    check(artifact["failures"] == [], "artifact must carry no failures")
    summary = artifact["summary"]
    check(summary["status"] == "passed", "summary status must be passed")
    check(summary["states"] == 7, "summary must report 7 canonical states")
    check(summary["producers"] >= 7, "every declared producer must be discovered")
    check(summary["consumers"] >= 14, "every declared consumer must be discovered")
    check(summary["separate_vocabularies"] >= 11, "separate vocabularies must be declared")
    check(summary["assertions"] > 0, "assertions must be counted")
    # every canonical state must have an explicit projection
    coverage = artifact["projection_coverage"]
    for state in artifact["canonical_audit_states"]:
        check(
            coverage.get(state),
            f"canonical state {state} must have a declared customer/founder projection",
        )
    # correction tips must exist for every UNKNOWN case, and UNKNOWN never passes
    for case in artifact["unknown_cases"]:
        check(case.get("correction_tip"), f"UNKNOWN {case['path']} must carry a correction tip")
    check(not artifact["unknown_cases"], "real repo must have no UNKNOWN cases")


def test_separate_vocabularies_distinct(artifact: dict) -> None:
    canonical = set(artifact["canonical_audit_states"])
    for vocab in artifact["separate_vocabularies"]:
        check(vocab["status"] == "ok", f"vocabulary {vocab['id']} must be ok")
        check(vocab["literals"], f"vocabulary {vocab['id']} must declare literals")
        check(vocab["distinctive"], f"vocabulary {vocab['id']} must declare distinctive literals")
        # a distinctive literal is the proof of separation: it can never be an
        # audits.status literal
        overlap = set(vocab["distinctive"]) & canonical
        check(
            not overlap,
            f"vocabulary {vocab['id']} distinctive literals {sorted(overlap)} must not "
            "collide with canonical audit states",
        )
    # the four guard literals named in the claim are always separate
    for guard in ["crashed", "completed", "succeeded", "delayed"]:
        check(guard not in canonical, f"guard {guard!r} must never be a canonical audit state")


def test_determinism() -> None:
    with tempfile.TemporaryDirectory(prefix="alm-lifecycle-det-") as tmp:
        out_a = Path(tmp) / "a.json"
        out_b = Path(tmp) / "b.json"
        proc_a = run_tool("--output", str(out_a))
        proc_b = run_tool("--output", str(out_b))
        check(proc_a.returncode == 0, "first deterministic run must pass")
        check(proc_b.returncode == 0, "second deterministic run must pass")
        bytes_a = out_a.read_bytes()
        bytes_b = out_b.read_bytes()
        check(bytes_a == bytes_b, "artifact must be byte-identical across reruns")
        text = bytes_a.decode("utf-8")
        check("provider_calls" in text, "artifact must declare provider_calls")
        check('"provider_calls": 0' in text, "artifact must declare provider_calls=0")
        # no environment path or wall-clock timestamp in the artifact
        for marker in ("/tmp/", "/home/", "2026-", "2025-", "T12:", "Z\""):
            check(
                marker not in text,
                f"artifact must not contain environment/timestamp marker {marker!r}",
            )


def test_mutation_fixtures_fail_closed() -> None:
    for name, expected_fragment in REQUIRED_MUTATIONS.items():
        fixture_dir = MUTATIONS / name
        manifest = fixture_dir / "manifest.json"
        check(manifest.exists(), f"mutation fixture {name} must have a manifest")
        proc = run_tool("--root", str(fixture_dir), "--manifest", str(manifest))
        check(
            proc.returncode != 0,
            f"mutation {name} must fail closed; got exit {proc.returncode}",
        )
        combined = proc.stdout + proc.stderr
        check(
            expected_fragment in combined,
            f"mutation {name} must report {expected_fragment!r}; got: {combined[:800]}",
        )


def test_valid_fixture_passes() -> None:
    fixture_dir = MUTATIONS / "valid"
    proc = run_tool(
        "--root", str(fixture_dir), "--manifest", str(fixture_dir / "manifest.json")
    )
    check(
        proc.returncode == 0,
        f"valid fixture must pass; got {proc.returncode}: {proc.stderr}",
    )
    check("AUDIT LIFECYCLE CONTRACT PASSED" in proc.stdout, proc.stdout)


def test_unknown_renders_exact_path() -> None:
    """A source the checker cannot parse must render UNKNOWN with path + tip."""
    fixture_dir = MUTATIONS / "missing-source"
    proc = run_tool(
        "--root", str(fixture_dir), "--manifest", str(fixture_dir / "manifest.json")
    )
    combined = proc.stdout + proc.stderr
    check("UNKNOWN" in combined, "missing source must render UNKNOWN")
    check("sources/missing-admin.ts" in combined, "UNKNOWN must carry the exact path")
    check(
        "restore the declared ts_update_status construct in sources/missing-admin.ts"
        in combined,
        "UNKNOWN must carry the exact correction tip",
    )


def main() -> int:
    artifact = test_real_repo_passes()
    test_artifact_invariants(artifact)
    test_separate_vocabularies_distinct(artifact)
    test_determinism()
    test_mutation_fixtures_fail_closed()
    test_valid_fixture_passes()
    test_unknown_renders_exact_path()

    summary = artifact["summary"]
    print(
        "AUDIT LIFECYCLE CONTRACT PASSED: "
        f"assertions={summary['assertions']} sources={summary['sources']} "
        f"states={len(artifact['canonical_audit_states'])} "
        f"producers={summary['producers']} consumers={summary['consumers']} "
        f"separate_vocabularies={summary['separate_vocabularies']} "
        f"provider_calls=0"
    )
    print(f"test assertions: {_checks_run}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
