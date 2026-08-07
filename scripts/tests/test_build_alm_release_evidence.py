#!/usr/bin/env python3
"""Static contract tests for scripts/build_alm_release_evidence.py.

Run:  python3 scripts/tests/test_build_alm_release_evidence.py

Verifies the deterministic, non-mutating release-evidence packet contract:
- the operating-model state machine is covered completely (integrated_local,
  preview_candidate, preview_verified, release_ready, production_canary,
  promoted, rolled_back, held);
- clean/current, dirty, ahead/behind, stale-evidence, mismatched-commit,
  missing-check, preview-only, migration-unknown, canary-unknown,
  approval-absent, and rollback-incomplete cases classify deterministically;
- absent external evidence stays UNKNOWN and never becomes success;
- stale / incompatible-commit / failing / held / rejected evidence is BLOCKED
  with an exact correction command and never becomes success;
- production cannot become promoted without compatible preview, migration,
  canary, post-deploy, rollback, and explicit founder-approval evidence;
- evidence files are schema-validated and redacted (unknown fields dropped,
  values never echoed);
- the tool does not mutate anything unless --output is supplied;
- exit codes are 0 (valid packet), 3 (usage / fixture / evidence error).

Fixtures prove packet classification and redaction only - never a live
preview, migration, canary, or production promotion.
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
TOOL = ROOT / "scripts" / "build_alm_release_evidence.py"
FIXTURES = ROOT / "scripts" / "fixtures" / "alm-release-evidence"

sys.path.insert(0, str(ROOT / "scripts"))
import build_alm_release_evidence as re_ev  # noqa: E402

_TMP_ROOT = Path(tempfile.mkdtemp(prefix="alm-rel-evidence-tests-"))

HEAD_CLEAN = "b93ced209f8ef593e5a23e86586cbb1245810eaa"
HEAD_TIME_CLEAN = "2026-08-07T08:30:00Z"
OBSERVED_AFTER = "2026-08-07T10:00:00Z"
OTHER_COMMIT = "1111111111111111111111111111111111111111"

_checks_run = 0


def check(condition: bool, message: str) -> None:
    global _checks_run
    _checks_run += 1
    if not condition:
        raise AssertionError(f"FAILED: {message}")


def run_tool(args: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(TOOL), *args],
        capture_output=True,
        text=True,
        timeout=240,
        cwd=str(cwd) if cwd else None,
    )


def fixture(name: str) -> Path:
    return FIXTURES / f"{name}.json"


def load_json(proc: subprocess.CompletedProcess) -> dict:
    check(proc.stdout, "expected JSON on stdout")
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise AssertionError(f"invalid JSON output: {exc}\n{proc.stdout[:500]}") from exc


def write_evidence(
    tmp: Path,
    evidence_type: str,
    commit: str = HEAD_CLEAN,
    observed_at: str = OBSERVED_AFTER,
    checks: list[dict] | None = None,
    decision: str | None = None,
    founder: str = "Ashesh Kaji",
    executed: bool = False,
    executed_at: str | None = None,
    reason: str | None = None,
    extra: dict | None = None,
) -> Path:
    data: dict = {
        "schema_version": 1,
        "evidence_type": evidence_type,
        "commit": commit,
        "observed_at": observed_at,
        "operator": "release-gate-test",
        "checks": checks if checks is not None else [{"name": f"{evidence_type} check", "result": "pass"}],
    }
    if decision is not None:
        data["decision"] = decision
    if founder and evidence_type == "approval":
        data["founder"] = founder
    if executed:
        data["executed"] = True
        data["executed_at"] = executed_at or "2026-08-07T11:00:00Z"
        data["reason"] = reason or "test rollback"
    if extra:
        data.update(extra)
    path = tmp / f"{evidence_type}-evidence.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def all_evidence_flags(tmp: Path, **overrides: dict | None) -> list[str]:
    """Write every evidence type into tmp and return CLI flag pairs.

    An override of None means the evidence is deliberately absent (no flag).
    """
    flags: list[str] = []
    for evidence_type in re_ev.EVIDENCE_TYPES:
        over = overrides.get(evidence_type, {})
        if over is None:
            continue  # deliberately absent (no flag)
        path = write_evidence(tmp, evidence_type, **over)
        flags.extend([f"--{evidence_type}-evidence", str(path)])
    return flags


# ---------------------------------------------------------------------------
# Contract completeness
# ---------------------------------------------------------------------------
def test_release_state_machine_complete() -> None:
    check(
        set(re_ev.FORWARD_STATES) | set(re_ev.TERMINAL_STATES)
        == {
            "integrated_local",
            "preview_candidate",
            "preview_verified",
            "release_ready",
            "production_canary",
            "promoted",
            "rolled_back",
            "held",
        },
        "must project into every operating-model state",
    )
    check(
        re_ev.MISSION_BRANCH == "improve/alm-recursive-2026-08-07",
        "mission branch constant must match the operating model",
    )
    check(re_ev.SCHEMA_VERSION == 1, "packet schema version must be declared")
    check(
        set(re_ev.EVIDENCE_TYPES)
        == {"preview", "migration", "canary", "production", "approval", "rollback"},
        "evidence types must cover all external boundaries",
    )
    for evidence_type in re_ev.EVIDENCE_TYPES:
        check(
            evidence_type in re_ev.MISSING_CORRECTIONS,
            f"{evidence_type} must carry a correction command",
        )
    check(len(re_ev.ROLLBACK_CHECKLIST) >= 4, "rollback checklist must be emitted")


def test_packet_schema_stable() -> None:
    proc = run_tool(["--fixture", str(fixture("clean-current")), "--json"])
    check(proc.returncode == 0, f"clean fixture must exit 0, got {proc.returncode}")
    packet = load_json(proc)
    check(packet["schema_version"] == 1, "schema_version must be 1")
    check(packet["tool"] == "alm-release-evidence", "tool identity must be stable")
    check(packet["source_mode"] == "fixture", "fixture runs must be labeled fixture")
    for state in re_ev.FORWARD_STATES:
        check(state in packet["states"], f"packet must project {state}")
    for state in re_ev.TERMINAL_STATES:
        check(state in packet["terminal"], f"packet must project terminal {state}")
    for evidence_type in re_ev.EVIDENCE_TYPES:
        check(evidence_type in packet["evidence"], f"packet must carry {evidence_type}")
    check(packet["summary"]["secret_values_emitted"] is False, "no secret values")


# ---------------------------------------------------------------------------
# Local-only classification
# ---------------------------------------------------------------------------
def test_clean_current_local_only() -> None:
    proc = run_tool(["--fixture", str(fixture("clean-current")), "--json"])
    check(proc.returncode == 0, f"clean fixture must exit 0, got {proc.returncode}")
    packet = load_json(proc)
    git = packet["git"]
    check(git["head"] == HEAD_CLEAN, "git head must match fixture")
    check(git["worktree_clean"] is True, "worktree must be clean")
    check(git["ahead"] == 0 and git["behind"] == 0, "must be synced with origin")
    check(
        git["reference_ref"] == "origin/improve/alm-recursive-2026-08-07",
        "reference must name the mission origin ref",
    )

    states = packet["states"]
    check(
        states["integrated_local"]["state"] == "verified",
        "integrated_local must be verified on clean/current state",
    )
    # Every external state is UNKNOWN with a correction command, never success.
    for name in (
        "preview_candidate",
        "preview_verified",
        "release_ready",
        "production_canary",
        "promoted",
    ):
        check(
            states[name]["state"] == "unknown",
            f"{name} must be UNKNOWN without external evidence",
        )
        check(
            bool(states[name]["correction"]),
            f"{name} must carry a correction command",
        )
    for evidence_type in re_ev.EVIDENCE_TYPES:
        entry = packet["evidence"][evidence_type]
        check(entry["state"] == "unknown", f"{evidence_type} evidence must be UNKNOWN")
        check(
            bool(entry["correction"]),
            f"{evidence_type} correction must name the exact command",
        )
    check(
        packet["summary"]["external_evidence_unknown"] == 6,
        "all six external evidence boundaries must be UNKNOWN",
    )
    check(packet["summary"]["packet_valid"] is True, "packet must be internally valid")
    check(packet["summary"]["promoted"] == "unknown", "promoted must stay UNKNOWN")
    check(packet["terminal"]["rolled_back"]["state"] == "unknown", "no rollback executed")
    check(packet["terminal"]["held"]["state"] == "unknown", "no held decision observed")


def test_dirty_worktree_blocks() -> None:
    proc = run_tool(["--fixture", str(fixture("dirty-worktree")), "--json"])
    check(proc.returncode == 0, f"dirty fixture must still produce a valid packet, got {proc.returncode}")
    packet = load_json(proc)
    check(packet["git"]["worktree_clean"] is False, "dirty worktree must be reported")
    check(len(packet["git"]["porcelain"]) == 2, "porcelain entries must be named")
    integrated = packet["states"]["integrated_local"]
    check(integrated["state"] == "blocked", "integrated_local must be BLOCKED when dirty")
    check(
        "worktree not clean" in " | ".join(integrated["reasons"]),
        "blocked reason must name the dirty worktree",
    )
    check(
        packet["states"]["promoted"]["state"] == "blocked",
        "dirty worktree must block promotion",
    )


def test_ahead_and_behind_reported() -> None:
    ahead = load_json(run_tool(["--fixture", str(fixture("ahead-of-origin")), "--json"]))
    check(ahead["git"]["ahead"] == 1 and ahead["git"]["behind"] == 0, "ahead count must be exact")
    integrated = ahead["states"]["integrated_local"]
    check(integrated["state"] == "blocked", "ahead must block integrated_local")
    check(
        "1 commit(s) ahead" in " | ".join(integrated["reasons"]),
        "ahead reason must name the exact count",
    )

    behind = load_json(run_tool(["--fixture", str(fixture("behind-origin")), "--json"]))
    check(behind["git"]["behind"] == 2 and behind["git"]["ahead"] == 0, "behind count must be exact")
    integrated_behind = behind["states"]["integrated_local"]
    check(integrated_behind["state"] == "blocked", "behind must block integrated_local")
    check(
        "2 commit(s) behind" in " | ".join(integrated_behind["reasons"]),
        "behind reason must name the exact count",
    )
    check(
        behind["states"]["promoted"]["state"] == "blocked",
        "divergence must block promotion",
    )


def test_missing_check_blocks() -> None:
    proc = run_tool(["--fixture", str(fixture("missing-check")), "--json"])
    check(proc.returncode == 0, f"missing-check fixture must produce a valid packet, got {proc.returncode}")
    packet = load_json(proc)
    preflight = packet["local_checks"]["capability_preflight"]
    check(preflight["state"] == "blocked", "capability preflight must be reported blocked")
    check(
        "preview_login" in preflight["blocked_capabilities"],
        "blocked capabilities must be named",
    )
    integrated = packet["states"]["integrated_local"]
    check(integrated["state"] == "blocked", "a blocked check must block integrated_local")
    joined = " | ".join(integrated["reasons"])
    check("capability_preflight" in joined, "reason must name the failing check")
    check(
        packet["states"]["promoted"]["state"] == "blocked",
        "a missing check must never allow promotion",
    )


# ---------------------------------------------------------------------------
# Full evidence promotion chain
# ---------------------------------------------------------------------------
def test_all_evidence_promotes() -> None:
    tmp = _TMP_ROOT / "promote"
    tmp.mkdir(exist_ok=True)
    flags = all_evidence_flags(
        tmp,
        approval={"decision": "approved", "founder": "Ashesh Kaji"},
        preview={
            "checks": [
                {"name": "preview build", "result": "pass"},
                {"name": "desktop flow", "result": "pass"},
                {"name": "390px mobile flow", "result": "pass"},
            ]
        },
        migration={
            "checks": [
                {"name": "static migration contract", "result": "pass"},
                {"name": "linked compatibility review", "result": "pass"},
            ]
        },
        canary={"checks": [{"name": "worker canary", "result": "pass"}]},
        production={
            "checks": [
                {"name": "live routes", "result": "pass"},
                {"name": "health probes", "result": "pass"},
            ]
        },
        rollback={"checks": [{"name": "rollback rehearsed", "result": "pass"}]},
    )
    proc = run_tool(["--fixture", str(fixture("clean-current")), *flags, "--json"])
    check(proc.returncode == 0, f"all-evidence run must exit 0, got {proc.returncode}")
    packet = load_json(proc)
    for name in re_ev.FORWARD_STATES:
        check(
            packet["states"][name]["state"] == "verified",
            f"{name} must be verified with complete compatible evidence",
        )
    check(
        packet["states"]["promoted"]["state"] == "verified",
        "promoted requires compatible preview+migration+canary+post-deploy+rollback+approval",
    )
    for evidence_type in re_ev.EVIDENCE_TYPES:
        check(
            packet["evidence"][evidence_type]["state"] == "verified",
            f"{evidence_type} evidence must classify verified",
        )
    check(packet["summary"]["promoted"] == "verified", "summary must report promoted")
    check(
        packet["summary"]["highest_verified_state"] == "promoted",
        "highest verified state must be promoted",
    )
    check(packet["terminal"]["rolled_back"]["state"] == "unknown", "readiness is not a rollback")
    check(packet["terminal"]["held"]["state"] == "unknown", "approved and promoted is not held")


def test_preview_only() -> None:
    tmp = _TMP_ROOT / "preview-only"
    tmp.mkdir(exist_ok=True)
    preview = write_evidence(tmp, "preview")
    proc = run_tool(
        ["--fixture", str(fixture("clean-current")), "--preview-evidence", str(preview), "--json"]
    )
    check(proc.returncode == 0, f"preview-only run must exit 0, got {proc.returncode}")
    packet = load_json(proc)
    check(
        packet["states"]["preview_candidate"]["state"] == "verified",
        "preview candidate must be verified from explicit preview evidence",
    )
    check(
        packet["states"]["preview_verified"]["state"] == "verified",
        "preview verified must follow from the same evidence",
    )
    for name in ("release_ready", "production_canary", "promoted"):
        check(
            packet["states"][name]["state"] == "unknown",
            f"{name} must stay UNKNOWN with preview-only evidence",
        )
    release_ready = packet["states"]["release_ready"]
    joined = " | ".join(release_ready["reasons"])
    check("migration" in joined and "rollback" in joined, "missing evidence must be named")
    check(
        "migration-evidence" in release_ready["correction"],
        "correction must name the exact missing command",
    )
    promoted = packet["states"]["promoted"]
    check(
        "migration-evidence" in promoted["correction"]
        or "rollback-evidence" in promoted["correction"],
        "promoted correction must name the nearest missing boundary",
    )


def test_stale_evidence_rejected() -> None:
    tmp = _TMP_ROOT / "stale"
    tmp.mkdir(exist_ok=True)
    stale_preview = write_evidence(tmp, "preview", observed_at="2026-08-07T08:00:00Z")
    proc = run_tool(
        ["--fixture", str(fixture("clean-current")), "--preview-evidence", str(stale_preview), "--json"]
    )
    check(proc.returncode == 0, f"stale evidence must still produce a valid packet, got {proc.returncode}")
    packet = load_json(proc)
    entry = packet["evidence"]["preview"]
    check(entry["state"] == "blocked", "stale evidence must be BLOCKED, never success")
    check(
        "stale" in " | ".join(entry["reasons"]),
        "stale rejection must be named",
    )
    check(
        "re-observe preview evidence" in entry["correction"],
        "stale correction must name the exact recovery",
    )
    check(
        packet["states"]["preview_candidate"]["state"] == "blocked",
        "stale preview evidence must block the preview gate",
    )
    check(
        packet["states"]["promoted"]["state"] == "blocked",
        "stale evidence must never allow promotion",
    )


def test_mismatched_commit_evidence_rejected() -> None:
    tmp = _TMP_ROOT / "mismatch"
    tmp.mkdir(exist_ok=True)
    # Supply the full evidence chain with only the canary pinned to a foreign
    # commit: the canary gate must be BLOCKED and promotion must never succeed.
    flags = all_evidence_flags(
        tmp,
        canary={
            "commit": OTHER_COMMIT,
            "checks": [{"name": "worker canary", "result": "pass"}],
        },
        approval={"decision": "approved", "founder": "Ashesh Kaji"},
    )
    proc = run_tool(["--fixture", str(fixture("clean-current")), *flags, "--json"])
    check(proc.returncode == 0, f"mismatched evidence must still produce a valid packet, got {proc.returncode}")
    packet = load_json(proc)
    entry = packet["evidence"]["canary"]
    check(entry["state"] == "blocked", "cross-commit evidence must be BLOCKED")
    check(
        "incompatible-commit" in " | ".join(entry["reasons"]),
        "incompatible-commit rejection must be named",
    )
    check(
        f"regenerate canary evidence at HEAD {HEAD_CLEAN}" in entry["correction"],
        "correction must pin regeneration to the exact HEAD",
    )
    check(
        packet["states"]["production_canary"]["state"] == "blocked",
        "cross-commit evidence must block the canary gate",
    )
    check(
        packet["states"]["promoted"]["state"] == "blocked",
        "cross-commit evidence must never allow promotion",
    )


def test_approval_absent_and_held() -> None:
    tmp = _TMP_ROOT / "approval"
    tmp.mkdir(exist_ok=True)
    # Absent approval: promote stays UNKNOWN with the exact approval command.
    flags = all_evidence_flags(tmp, approval=None)
    proc = run_tool(["--fixture", str(fixture("clean-current")), *flags, "--json"])
    check(proc.returncode == 0, f"approval-absent run must exit 0, got {proc.returncode}")
    packet = load_json(proc)
    check(packet["evidence"]["approval"]["state"] == "unknown", "approval must be UNKNOWN")
    check(
        "approval-evidence" in packet["evidence"]["approval"]["correction"],
        "approval correction must name --approval-evidence",
    )
    check(
        packet["states"]["production_canary"]["state"] == "unknown",
        "canary must wait for explicit approval",
    )
    check(
        packet["states"]["promoted"]["state"] == "unknown",
        "promotion must not be inferred without approval",
    )

    # Explicit held decision: blocks, never success.
    held_tmp = _TMP_ROOT / "approval-held"
    held_tmp.mkdir(exist_ok=True)
    held_flags = all_evidence_flags(held_tmp, approval={"decision": "held", "founder": "Ashesh Kaji"})
    proc_held = run_tool(["--fixture", str(fixture("clean-current")), *held_flags, "--json"])
    packet_held = load_json(proc_held)
    check(
        packet_held["evidence"]["approval"]["state"] == "blocked",
        "held approval must be BLOCKED",
    )
    check(
        "decision is 'held'" in " | ".join(packet_held["evidence"]["approval"]["reasons"]),
        "held decision must be named",
    )
    check(
        packet_held["states"]["production_canary"]["state"] == "blocked",
        "held decision must block the canary",
    )
    check(
        packet_held["states"]["promoted"]["state"] == "blocked",
        "held decision must block promotion",
    )
    check(
        packet_held["terminal"]["held"]["state"] == "verified",
        "an explicit held decision must project the held terminal state",
    )


def test_rollback_incomplete_blocks() -> None:
    tmp = _TMP_ROOT / "rollback-incomplete"
    tmp.mkdir(exist_ok=True)
    flags = all_evidence_flags(
        tmp,
        rollback={"checks": [{"name": "rollback rehearsed", "result": "fail"}]},
        approval={"decision": "approved", "founder": "Ashesh Kaji"},
    )
    proc = run_tool(["--fixture", str(fixture("clean-current")), *flags, "--json"])
    check(proc.returncode == 0, f"rollback-incomplete run must exit 0, got {proc.returncode}")
    packet = load_json(proc)
    check(
        packet["evidence"]["rollback"]["state"] == "blocked",
        "failing rollback evidence must be BLOCKED",
    )
    check(
        "rollback rehearsed" in " | ".join(packet["evidence"]["rollback"]["reasons"]),
        "failing rollback check must be named",
    )
    check(
        packet["states"]["release_ready"]["state"] == "blocked",
        "rollback must be ready before release_ready",
    )
    check(
        packet["states"]["promoted"]["state"] == "blocked",
        "rollback-incomplete must never allow promotion",
    )


def test_rollback_executed_terminal() -> None:
    tmp = _TMP_ROOT / "rollback-executed"
    tmp.mkdir(exist_ok=True)
    executed = write_evidence(
        tmp,
        "rollback",
        checks=[{"name": "rollback rehearsed", "result": "pass"}],
        executed=True,
        executed_at="2026-08-07T11:00:00Z",
        reason="post-deploy verification failed",
    )
    proc = run_tool(
        ["--fixture", str(fixture("clean-current")), "--rollback-evidence", str(executed), "--json"]
    )
    check(proc.returncode == 0, f"rollback-executed run must exit 0, got {proc.returncode}")
    packet = load_json(proc)
    rolled_back = packet["terminal"]["rolled_back"]
    check(rolled_back["state"] == "verified", "executed rollback must project rolled_back")
    check(
        rolled_back.get("reason") == "post-deploy verification failed",
        "rollback reason must be preserved",
    )
    check(
        packet["evidence"]["rollback"]["state"] == "verified",
        "rollback readiness checks still classify verified",
    )
    check(
        packet["terminal"]["held"]["state"] == "unknown",
        "a rollback after promotion is not a held decision",
    )


def test_failing_production_check_blocks() -> None:
    tmp = _TMP_ROOT / "production-fail"
    tmp.mkdir(exist_ok=True)
    flags = all_evidence_flags(
        tmp,
        production={
            "checks": [
                {"name": "live routes", "result": "pass"},
                {"name": "health probes", "result": "fail"},
            ]
        },
        approval={"decision": "approved", "founder": "Ashesh Kaji"},
    )
    proc = run_tool(["--fixture", str(fixture("clean-current")), *flags, "--json"])
    check(proc.returncode == 0, f"failing-production run must exit 0, got {proc.returncode}")
    packet = load_json(proc)
    check(
        packet["evidence"]["production"]["state"] == "blocked",
        "failing production evidence must be BLOCKED",
    )
    check(
        packet["states"]["promoted"]["state"] == "blocked",
        "a failing post-deploy check must block promotion",
    )


# ---------------------------------------------------------------------------
# Redaction, non-mutation, usage errors
# ---------------------------------------------------------------------------
def test_redaction_drops_unknown_fields() -> None:
    tmp = _TMP_ROOT / "redact"
    tmp.mkdir(exist_ok=True)
    sentinels = [
        "ALM_REDACT_SENTINEL_987654321",
        "ALM_REDACT_TOKEN_abcdef",
        "ALM_REDACT_SECRET_zzz",
    ]
    preview = write_evidence(
        tmp,
        "preview",
        extra={
            "api_key": sentinels[0],
            "token": sentinels[1],
            "authorization": sentinels[2],
        },
    )
    proc = run_tool(
        ["--fixture", str(fixture("clean-current")), "--preview-evidence", str(preview), "--json"]
    )
    check(proc.returncode == 0, f"redaction run must exit 0, got {proc.returncode}")
    output = proc.stdout
    for sentinel in sentinels:
        check(sentinel not in output, f"secret value leaked: {sentinel}")
    packet = load_json(proc)
    entry = packet["evidence"]["preview"]
    check(
        entry.get("dropped_fields") == ["api_key", "authorization", "token"],
        "unknown evidence fields must be dropped and their names reported",
    )
    check(
        packet["summary"]["secret_values_emitted"] is False,
        "summary must never claim secret emission",
    )
    # A secret placed in a fixture env-like field must never be emitted either.
    secret_fixture = tmp / "secret-fixture.json"
    secret_fixture.write_text(
        json.dumps(
            {
                "name": "secret-fixture",
                "env": {"SUPABASE_SERVICE_ROLE_KEY": sentinels[0]},
                "git": json.loads(fixture("clean-current").read_text())["git"],
                "checks": json.loads(fixture("clean-current").read_text())["checks"],
            }
        ),
        encoding="utf-8",
    )
    proc2 = run_tool(["--fixture", str(secret_fixture), "--json"])
    check(proc2.returncode == 0, f"fixture-extra-field run must exit 0, got {proc2.returncode}")
    check(sentinels[0] not in proc2.stdout, "fixture extra fields must never be emitted")


def test_non_mutation() -> None:
    tmp = _TMP_ROOT / "non-mutation"
    tmp.mkdir(exist_ok=True)
    before = sorted(os.listdir(tmp))
    proc = run_tool(["--fixture", str(fixture("clean-current")), "--json"], cwd=tmp)
    check(proc.returncode == 0, f"no-output run must exit 0, got {proc.returncode}")
    after = sorted(os.listdir(tmp))
    check(after == before, "no --output must not create or mutate any file")

    out_path = tmp / "nested" / "packet.json"
    proc2 = run_tool(
        ["--fixture", str(fixture("clean-current")), "--output", str(out_path), "--json"], cwd=tmp
    )
    check(proc2.returncode == 0, f"output run must exit 0, got {proc2.returncode}")
    check(out_path.is_file(), "explicit --output must write exactly the packet file")
    packet = json.loads(out_path.read_text(encoding="utf-8"))
    check(packet["schema_version"] == 1, "written packet must be valid JSON")
    listing = sorted(os.listdir(tmp))
    check(
        listing == before + ["nested"],
        "only the explicitly requested output path may be created",
    )


def test_usage_errors() -> None:
    tmp = _TMP_ROOT / "usage"
    tmp.mkdir(exist_ok=True)
    # Missing evidence file -> exit 3.
    proc = run_tool(["--fixture", str(fixture("clean-current")), "--preview-evidence", str(tmp / "nope.json"), "--json"])
    check(proc.returncode == 3, f"missing evidence file must exit 3, got {proc.returncode}")
    check("not found" in proc.stderr, "usage error must name the missing file")
    # Invalid JSON evidence -> exit 3.
    bad = tmp / "bad.json"
    bad.write_text("{not json", encoding="utf-8")
    proc2 = run_tool(["--fixture", str(fixture("clean-current")), "--canary-evidence", str(bad), "--json"])
    check(proc2.returncode == 3, f"invalid evidence JSON must exit 3, got {proc2.returncode}")
    # Wrong evidence_type -> exit 3.
    wrong = write_evidence(tmp, "preview")
    proc3 = run_tool(["--fixture", str(fixture("clean-current")), "--migration-evidence", str(wrong), "--json"])
    check(proc3.returncode == 3, f"wrong evidence_type must exit 3, got {proc3.returncode}")
    check("evidence_type" in proc3.stderr, "schema mismatch must be named")
    # Missing fixture -> exit 3.
    proc4 = run_tool(["--fixture", str(tmp / "missing-fixture.json"), "--json"])
    check(proc4.returncode == 3, f"missing fixture must exit 3, got {proc4.returncode}")
    # Invalid fixture -> exit 3.
    bad_fixture = tmp / "bad-fixture.json"
    bad_fixture.write_text("{oops", encoding="utf-8")
    proc5 = run_tool(["--fixture", str(bad_fixture), "--json"])
    check(proc5.returncode == 3, f"invalid fixture must exit 3, got {proc5.returncode}")
    # Schema-invalid evidence (no checks -> unverifiable) -> exit 3.
    schema_bad = write_evidence(tmp, "rollback", checks=[])
    proc6 = run_tool(["--fixture", str(fixture("clean-current")), "--rollback-evidence", str(schema_bad), "--json"])
    check(proc6.returncode == 3, f"unverifiable evidence must exit 3, got {proc6.returncode}")


def test_deterministic_fixture_classification() -> None:
    """The same inputs must produce identical classifications on repeat runs."""
    tmp = _TMP_ROOT / "deterministic"
    tmp.mkdir(exist_ok=True)
    flags = all_evidence_flags(
        tmp, approval={"decision": "approved", "founder": "Ashesh Kaji"}
    )
    args = ["--fixture", str(fixture("clean-current")), *flags, "--json"]
    first = load_json(run_tool(args))
    second = load_json(run_tool(args))
    for key in ("states", "terminal", "evidence", "summary"):
        check(
            first[key] == second[key],
            f"classification section {key} must be deterministic",
        )


# ---------------------------------------------------------------------------
# Real git reading (synthetic repositories and the live checkout)
# ---------------------------------------------------------------------------
def _git(repo: Path, *args: str) -> str:
    proc = subprocess.run(
        ["git", *args], cwd=str(repo), capture_output=True, text=True, timeout=60
    )
    if proc.returncode != 0:
        raise AssertionError(f"git {' '.join(args)} failed: {proc.stderr}")
    return proc.stdout.strip()


def test_synthetic_repo_git_read() -> None:
    repo = _TMP_ROOT / "synthetic-repo"
    repo.mkdir(exist_ok=True)
    _git(repo, "init", "-q", "-b", "improve/alm-recursive-2026-08-07")
    _git(repo, "config", "user.email", "test@example.com")
    _git(repo, "config", "user.name", "Test")
    (repo / "a.txt").write_text("a", encoding="utf-8")
    _git(repo, "add", ".")
    _git(repo, "commit", "-q", "-m", "one")
    head = _git(repo, "rev-parse", "HEAD")
    _git(repo, "update-ref", "refs/remotes/origin/improve/alm-recursive-2026-08-07", head)

    proc = run_tool(["--repo", str(repo), "--json"])
    check(proc.returncode == 0, f"synthetic repo run must exit 0, got {proc.returncode}")
    packet = load_json(proc)
    check(packet["git"]["head"] == head, "packet must read the exact HEAD")
    check(
        packet["git"]["branch"] == "improve/alm-recursive-2026-08-07",
        "packet must read the exact branch",
    )
    check(packet["git"]["mission_origin_head"] == head, "packet must read the origin ref")
    check(
        packet["git"]["reference_ref"] == "origin/improve/alm-recursive-2026-08-07",
        "packet must name the mission origin ref",
    )
    check(packet["git"]["ahead"] == 0 and packet["git"]["behind"] == 0, "synthetic repo is synced")
    check(packet["git"]["worktree_clean"] is True, "synthetic repo is clean")

    (repo / "b.txt").write_text("b", encoding="utf-8")
    _git(repo, "add", ".")
    _git(repo, "commit", "-q", "-m", "two")
    proc2 = run_tool(["--repo", str(repo), "--json"])
    packet2 = load_json(proc2)
    check(packet2["git"]["ahead"] == 1, "ahead must be read from real git")
    check(
        packet2["states"]["integrated_local"]["state"] == "blocked",
        "an unpushed commit must block integrated_local",
    )

    (repo / "a.txt").write_text("a2", encoding="utf-8")
    proc3 = run_tool(["--repo", str(repo), "--json"])
    packet3 = load_json(proc3)
    check(packet3["git"]["worktree_clean"] is False, "dirty state must be read from real git")
    check(len(packet3["git"]["porcelain"]) == 1, "porcelain must name the change")


def test_live_real_mode() -> None:
    proc = run_tool(["--json"])
    check(proc.returncode == 0, f"real mode must produce a valid packet, got {proc.returncode}")
    packet = load_json(proc)
    check(packet["source_mode"] == "real-environment", "real mode must be labeled")
    live_head = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=str(ROOT), capture_output=True, text=True, timeout=60
    ).stdout.strip()
    check(packet["git"]["head"] == live_head, "live packet must name the exact live HEAD")
    # Unobserved external evidence must be UNKNOWN/BLOCKED, never fabricated.
    for evidence_type in re_ev.EVIDENCE_TYPES:
        entry = packet["evidence"][evidence_type]
        check(
            entry["state"] in ("unknown", "blocked"),
            f"{evidence_type} must never be fabricated in a real local-only run",
        )
    check(
        packet["states"]["promoted"]["state"] in ("unknown", "blocked"),
        "promoted must never be verified without external evidence",
    )
    check(packet["summary"]["secret_values_emitted"] is False, "no secret values in live mode")
    check(packet["summary"]["packet_valid"] is True, "live packet must be internally valid")


def main() -> int:
    test_release_state_machine_complete()
    test_packet_schema_stable()
    test_clean_current_local_only()
    test_dirty_worktree_blocks()
    test_ahead_and_behind_reported()
    test_missing_check_blocks()
    test_all_evidence_promotes()
    test_preview_only()
    test_stale_evidence_rejected()
    test_mismatched_commit_evidence_rejected()
    test_approval_absent_and_held()
    test_rollback_incomplete_blocks()
    test_rollback_executed_terminal()
    test_failing_production_check_blocks()
    test_redaction_drops_unknown_fields()
    test_non_mutation()
    test_usage_errors()
    test_deterministic_fixture_classification()
    test_synthetic_repo_git_read()
    test_live_real_mode()
    shutil.rmtree(_TMP_ROOT, ignore_errors=True)
    print(f"ALM RELEASE EVIDENCE CONTRACT PASSED ({_checks_run} assertions)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
