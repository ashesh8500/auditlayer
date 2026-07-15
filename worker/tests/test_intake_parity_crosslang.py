"""Cross-language intake parity test — TS vs Python.

Runs the same 20 intake test cases through both the TypeScript
``evaluateIntake`` (web/src/lib/domain.ts) and the Python
``evaluate_intake`` (worker/auditlayer_worker/core.py), then asserts
field-for-field equality.

MOA diversity covers:
  - every platform (instagram, tiktok, youtube, x, linkedin, unknown)
  - URL forms (full https, @handle, bare handle, dotted, domain-like)
  - plan limits (free, starter, pro, enterprise)
  - gifted-audit bypass
  - context / no-context
  - blocked / queued / needs_review
  - milestone labels at various follower tiers
  - empty / whitespace-only handles
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

# ---------------------------------------------------------------------------
# Test case definitions — run through BOTH TS and Python
# ---------------------------------------------------------------------------

# Each case: (handle, goal, context, plan, platform, completed_audits, followers, gifted_audits)
# Fields map to TS IntakeInput + extra params.
TestCase = tuple[str, str, str, str, str, int, int | None, int]

CASES: list[TestCase] = [
    # ---- Instagram happy paths -------------------------------------------
    ("@hemalpatelphd", "growth", "UCSD professor, PhD", "free", "unknown", 0, None, 0),
    ("randomhandle", "growth", "", "free", "unknown", 0, None, 0),
    ("dr.truptikaji", "growth", "Integrative medicine doctor", "starter", "unknown", 0, 5_000, 0),
    ("@snackbrand", "growth", "CPG food company, LA-based", "free", "unknown", 0, None, 0),
    ("https://instagram.com/@HemalPatelPhD/", "growth", "UCSD professor", "free", "unknown", 0, None, 0),
    # ---- TikTok ----------------------------------------------------------
    ("https://tiktok.com/@creator", "growth", "Dance content", "free", "unknown", 0, 15_000, 0),
    # ---- YouTube ---------------------------------------------------------
    ("https://youtube.com/@channel", "growth", "Tech reviews", "free", "unknown", 0, None, 0),
    ("https://youtu.be/short", "growth", "", "free", "unknown", 0, None, 0),
    # ---- X ---------------------------------------------------------------
    ("https://x.com/user", "growth", "Tech commentary", "pro", "unknown", 3, 75_000, 0),
    ("https://twitter.com/user2", "growth", "", "starter", "unknown", 1, 299, 0),
    # ---- LinkedIn --------------------------------------------------------
    ("https://linkedin.com/in/username", "growth", "B2B marketing", "free", "unknown", 0, None, 0),
    # ---- Plan limit enforcement ------------------------------------------
    ("@user", "growth", "", "free", "unknown", 1, None, 0),          # free limit = 1 → blocked
    ("@user", "growth", "", "starter", "unknown", 5, None, 0),       # starter limit = 5 → blocked
    ("@user", "growth", "", "starter", "unknown", 4, None, 0),       # under limit → queued
    ("@user", "growth", "", "pro", "unknown", 14, None, 0),          # under limit → queued
    ("@user", "growth", "", "pro", "unknown", 15, None, 0),          # at limit → blocked
    # ---- Gifted audit bypass --------------------------------------------
    ("@user", "growth", "", "free", "unknown", 1, None, 1),           # gifted=1 → bypass
    ("@user", "growth", "", "free", "unknown", 1, None, 0),           # gifted=0 → blocked
    # ---- Unknown platform → needs_review --------------------------------
    ("brand.co", "growth", "", "free", "unknown", 0, None, 0),
    ("site.com", "growth", "", "free", "unknown", 0, None, 0),
    # ---- Empty handle → blocked -----------------------------------------
    ("   ", "growth", "", "free", "unknown", 0, None, 0),
    # ---- Explicit platform override -------------------------------------
    ("brand.co", "growth", "Fashion brand", "free", "instagram", 0, None, 0),
    # ---- Context suppression --------------------------------------------
    ("@creator", "monetization", "Wellness coach, NYC", "free", "unknown", 0, 150, 0),
    # ---- High follower milestone ----------------------------------------
    ("@bigaccount", "growth", "", "enterprise", "unknown", 0, 150_000, 0),
]


def _ts_command() -> list[str]:
    """Return the tsx command to run the TS runner."""
    tsx = shutil.which("tsx")
    if tsx is None:
        repo_root = Path(__file__).resolve().parents[2]
        candidates = (
            repo_root / "web" / "node_modules" / ".bin" / "tsx",
            Path.home() / ".hermes" / "hermes-agent" / "node_modules" / ".bin" / "tsx",
        )
        tsx = next((str(path) for path in candidates if path.is_file()), None)
    if tsx is None:
        raise RuntimeError("tsx is required for cross-language intake parity tests")
    runner = Path(__file__).parent / "intake_runner.ts"
    return [tsx, str(runner)]


def _ts_input(cases: list[TestCase]) -> str:
    """Convert test cases to JSON the TS runner expects."""
    json_cases: list[dict[str, Any]] = []
    for handle, goal, context, plan, platform, completed_audits, followers, gifted_audits in cases:
        tc: dict[str, Any] = {
            "handle": handle,
            "goal": goal,
            "context": context,
            "plan": plan,
            "platform": platform,
            "completed_audits": completed_audits,
            "followers": followers,
            "gifted_audits": gifted_audits,
        }
        json_cases.append(tc)
    return json.dumps(json_cases)


def run_ts_evaluate(cases: list[TestCase]) -> list[dict[str, Any]]:
    """Run the TS runner and return parsed JSON results."""
    proc = subprocess.run(
        _ts_command(),
        input=_ts_input(cases),
        capture_output=True,
        text=True,
        timeout=30,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"TS runner failed (exit {proc.returncode}):\n{proc.stderr}")
    return json.loads(proc.stdout)


def run_py_evaluate(cases: list[TestCase]) -> list[dict[str, Any]]:
    """Run Python evaluate_intake directly."""
    from auditlayer_worker.core import Plan, Platform, evaluate_intake

    plan_map = {"free": Plan.FREE, "starter": Plan.STARTER, "pro": Plan.PRO, "enterprise": Plan.ENTERPRISE}
    plat_map = {p.value: p for p in Platform}

    results: list[dict[str, Any]] = []
    for handle, goal, context, plan, platform, completed_audits, followers, gifted_audits in cases:
        d = evaluate_intake(
            handle=handle,
            goal=goal,
            context=context,
            plan=plan_map[plan],
            platform=plat_map.get(platform, Platform.UNKNOWN),
            completed_audits=completed_audits,
            followers=followers,
            gifted_audits=gifted_audits,
        )
        results.append({
            "accepted": d.accepted,
            "status": d.status.value,
            "reasons": list(d.reasons),
            "limitations": list(d.limitations),
            "platform": d.platform.value,
            "milestoneLabel": d.milestone_label,
            "normalizedHandle": d.normalized_handle,
        })
    return results


# ---------------------------------------------------------------------------
# The single parity test — compares TS vs Python for all 20 cases
# ---------------------------------------------------------------------------


def test_intake_ts_py_parity() -> None:
    """Every case must produce identical decisions across TS and Python."""
    ts_results = run_ts_evaluate(CASES)
    py_results = run_py_evaluate(CASES)

    assert len(ts_results) == len(py_results) == len(CASES), (
        f"Result count mismatch: TS={len(ts_results)}, PY={len(py_results)}, cases={len(CASES)}"
    )

    field_keys = ["accepted", "status", "reasons", "limitations", "platform", "milestoneLabel", "normalizedHandle"]

    mismatches: list[str] = []
    for i, (ts_r, py_r, case) in enumerate(zip(ts_results, py_results, CASES)):
        for key in field_keys:
            ts_val = ts_r.get(key)
            py_val = py_r.get(key)
            if ts_val != py_val:
                mismatches.append(
                    f"Case {i} ({case[0]}): {key}\n"
                    f"  TS: {json.dumps(ts_val)}\n"
                    f"  PY: {json.dumps(py_val)}"
                )

    if mismatches:
        pytest.fail("\n" + "\n---\n".join(mismatches))


# ---------------------------------------------------------------------------
# Smoke test — quick single-case sanity check
# ---------------------------------------------------------------------------


def test_intake_parity_smoke() -> None:
    """Quick smoke: one case must match."""
    ts_results = run_ts_evaluate([CASES[0]])
    py_results = run_py_evaluate([CASES[0]])

    assert ts_results == py_results, (
        f"Smoke mismatch:\n  TS: {json.dumps(ts_results[0])}\n  PY: {json.dumps(py_results[0])}"
    )
