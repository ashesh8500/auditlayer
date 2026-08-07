#!/usr/bin/env python3
"""ALM founder release-evidence packet — deterministic, non-mutating, no-secret.

One local command projects current local Git/check state and explicit external
evidence into the operating-model release states (docs/improvements/
OPERATING-MODEL.md):

    integrated_local
      -> preview_candidate
      -> preview_verified
      -> release_ready
      -> production_canary
      -> promoted | rolled_back | held

Contract
--------
* Default behavior reads ONLY local Git state (read-only git commands) and the
  static repository contracts: scripts/check-migrations.py and
  scripts/check_alm_capabilities.py --json. Those two tools are reused by
  subprocess; their auth/capability logic is never copied here. This tool is a
  read-only evidence projector, not a release executor and not a second state
  machine: it cannot deploy, migrate, approve, or mutate anything.
* External evidence (preview, migration/schema, worker canary, production,
  explicit founder approval, rollback readiness) is NEVER invented. It is read
  only from explicit, schema-validated, commit-compatible, redacted JSON
  evidence files named on the command line. Absent evidence stays UNKNOWN;
  stale, incompatible-commit, or failing evidence stays BLOCKED — never
  success — and the exact correction command is emitted.
* Production can never be classified promoted without compatible preview,
  migration, canary, post-deploy, rollback, and explicit founder-approval
  evidence, all pinned to the current HEAD.
* The packet contains no secret values. Evidence files are allowlisted by
  schema: unknown fields are dropped and their NAMES are reported
  (``dropped_fields``); values are never echoed. Env values are never read.
* Nothing is written unless --output is supplied.
* Fixtures (--fixture) prove packet classification and redaction only. They
  never prove a live preview, a live migration, a canary, or a production
  promotion.

Usage
-----
    python3 scripts/build_alm_release_evidence.py [options]

  --repo PATH              Git repository root to read local state from.
                           Defaults to this checkout. Static local checks
                           always run against this checkout's scripts.
  --fixture PATH           JSON fixture describing git + local-check state for
                           deterministic tests:
                             {"name": "...", "git": {...}, "checks": {...}}
  --output PATH            Write the packet JSON to PATH (otherwise stdout).
  --preview-evidence PATH  Explicit preview evidence (schema v1).
  --migration-evidence PATH
  --canary-evidence PATH
  --production-evidence PATH
  --approval-evidence PATH
  --rollback-evidence PATH
  --json                   Emit only the stable JSON packet on stdout.
  --verbose                Human output with per-state evidence detail.

Exit codes
----------
  0  packet generated and internally valid (schema-valid, classifications
     consistent with inputs). Exit 0 is NOT a release-ready claim; read the
     state classifications for that.
  3  usage / fixture / evidence-file error (missing file, invalid JSON, or
     schema mismatch).
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_VERSION = 1
EXIT_OK = 0
EXIT_USAGE = 3

MISSION_BRANCH = "improve/alm-recursive-2026-08-07"

# Operating-model forward states in promotion order (OPERATING-MODEL.md).
FORWARD_STATES: tuple[str, ...] = (
    "integrated_local",
    "preview_candidate",
    "preview_verified",
    "release_ready",
    "production_canary",
    "promoted",
)
TERMINAL_STATES: tuple[str, ...] = ("rolled_back", "held")
EVIDENCE_TYPES: tuple[str, ...] = (
    "preview",
    "migration",
    "canary",
    "production",
    "approval",
    "rollback",
)

# The exact correction command for every absent/unobservable external state.
MISSING_CORRECTIONS: dict[str, str] = {
    "preview": (
        f"record preview evidence at HEAD: push to a Vercel preview deployment, "
        f"run the QA smoke, and pass --preview-evidence <file>"
    ),
    "migration": (
        "record migration/schema evidence: run python3 scripts/check-migrations.py "
        "and verify linked-project compatibility at HEAD, then pass "
        "--migration-evidence <file>"
    ),
    "canary": (
        "record worker-canary evidence: run the bounded Hetzner worker canary at "
        "HEAD (cd worker && uv run python -m auditlayer_worker diagnose-hermes / "
        "release-preflight), then pass --canary-evidence <file>"
    ),
    "production": (
        "record post-deploy evidence: query live routes/health/state at HEAD and "
        "pass --production-evidence <file>"
    ),
    "approval": (
        "obtain explicit founder approval for promotion at HEAD and pass "
        "--approval-evidence <file> (this tool cannot approve production)"
    ),
    "rollback": (
        "rehearse the rollback checklist and record readiness with "
        "--rollback-evidence <file> (readiness is not an executed rollback)"
    ),
}

# Static rollback checklist derived from the operating model (not evidence).
ROLLBACK_CHECKLIST: list[dict[str, str]] = [
    {
        "step": "1",
        "action": "Revert the mission branch",
        "command": "git revert <promoted-sha> (or reset the branch before merge); do not rewrite shared history after push",
    },
    {
        "step": "2",
        "action": "Revert the web deployment",
        "command": "cd web && vercel rollback (instant production revert; master stays clean)",
    },
    {
        "step": "3",
        "action": "Restore the worker revision",
        "command": "sudo systemctl restart auditlayer-worker after reverting worker code on the VM (or redeploy the prior revision)",
    },
    {
        "step": "4",
        "action": "Contain schema drift",
        "command": "ALM migrations are additive; do not drop tables without a dedicated down plan. Forward-fix in a new branch.",
    },
]

LIMITATIONS: list[str] = [
    "Fixtures prove packet classification and redaction only - never a live preview, migration, canary, or production promotion.",
    "Approval authenticity is not locally provable; the packet reports the explicit approval record only and can never grant approval.",
    "Evidence authors must not place credentials in observed fields (url, detail, operator); unknown fields are dropped by schema.",
]


class ReleaseEvidenceError(Exception):
    """A usage-level error in a fixture or evidence file (exit 3)."""


class GitReadError(Exception):
    """Local git state could not be read (not a repository or git failed)."""


# ---------------------------------------------------------------------------
# Git state
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class GitState:
    head: str
    head_time: datetime
    branch: str
    upstream: str | None
    upstream_head: str | None
    ahead: int | None
    behind: int | None
    reference: str | None
    reference_ref: str | None
    worktree_clean: bool
    porcelain: tuple[str, ...]
    mission_origin_head: str | None


def _git(repo: Path, *args: str, timeout: int = 15) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(
            ["git", *args],
            cwd=str(repo),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        raise GitReadError(f"git {' '.join(args)} timed out") from exc


def read_git_state(repo: Path) -> GitState:
    """Read ONLY local, read-only git state from ``repo`` (never mutating)."""
    head_proc = _git(repo, "rev-parse", "HEAD")
    if head_proc.returncode != 0:
        raise GitReadError(
            f"not a git repository at {repo}: {(head_proc.stderr or '').strip()}"
        )
    head = head_proc.stdout.strip()

    time_proc = _git(repo, "show", "-s", "--format=%cI", "HEAD")
    head_time_raw = time_proc.stdout.strip()
    try:
        head_time = datetime.fromisoformat(head_time_raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise GitReadError(f"could not parse HEAD commit date {head_time_raw!r}") from exc

    branch_proc = _git(repo, "branch", "--show-current")
    branch = branch_proc.stdout.strip() or "(detached)"

    upstream_proc = _git(repo, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
    upstream = upstream_proc.stdout.strip() if upstream_proc.returncode == 0 else None
    upstream_head_proc = _git(repo, "rev-parse", "@{u}")
    upstream_head = (
        upstream_head_proc.stdout.strip()
        if upstream_head_proc.returncode == 0
        else None
    )

    mission_proc = _git(repo, "rev-parse", f"origin/{MISSION_BRANCH}")
    mission_origin_head = (
        mission_proc.stdout.strip() if mission_proc.returncode == 0 else None
    )

    # Compare against the mission origin when available (meaningful for release
    # evidence even in a worktree branch with no configured upstream), else the
    # configured upstream.
    reference = mission_origin_head or upstream
    reference_ref: str | None = None
    ahead: int | None = None
    behind: int | None = None
    if reference is not None:
        reference_ref = (
            f"origin/{MISSION_BRANCH}" if mission_origin_head is not None else upstream
        )
        counts_proc = _git(repo, "rev-list", "--left-right", "--count", f"{reference}...HEAD")
        if counts_proc.returncode == 0:
            left, _, right = counts_proc.stdout.strip().partition("\t")
            behind = int(left)
            ahead = int(right)

    status_proc = _git(repo, "status", "--porcelain")
    porcelain = tuple(line.strip() for line in status_proc.stdout.splitlines() if line.strip())

    return GitState(
        head=head,
        head_time=head_time,
        branch=branch,
        upstream=upstream,
        upstream_head=upstream_head,
        ahead=ahead,
        behind=behind,
        reference=reference,
        reference_ref=reference_ref,
        worktree_clean=not porcelain,
        porcelain=porcelain,
        mission_origin_head=mission_origin_head,
    )


def git_from_fixture(fixture: dict[str, Any]) -> GitState:
    g = fixture.get("git")
    if not isinstance(g, dict):
        raise ReleaseEvidenceError("fixture must contain a 'git' object")

    def _sha(value: Any, name: str) -> str:
        if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{40}", value):
            raise ReleaseEvidenceError(f"fixture git.{name} must be a 40-hex sha")
        return value

    head = _sha(g.get("head"), "head")
    try:
        head_time = datetime.fromisoformat(str(g.get("head_time", "")).replace("Z", "+00:00"))
        if head_time.tzinfo is None:
            raise ValueError("naive timestamp")
    except (TypeError, ValueError) as exc:
        raise ReleaseEvidenceError(
            f"fixture git.head_time must be ISO8601 with timezone, got {g.get('head_time')!r}"
        ) from exc

    branch = str(g.get("branch") or "(detached)")
    upstream = g.get("upstream")
    upstream = str(upstream) if upstream else None
    upstream_head = g.get("upstream_head")
    upstream_head = str(upstream_head) if upstream_head else None
    mission_origin_head = g.get("mission_origin_head")
    mission_origin_head = str(mission_origin_head) if mission_origin_head else None

    ahead = g.get("ahead", 0)
    behind = g.get("behind", 0)
    if not isinstance(ahead, int) or not isinstance(behind, int) or ahead < 0 or behind < 0:
        raise ReleaseEvidenceError("fixture git.ahead/git.behind must be non-negative integers")
    porcelain_raw = g.get("porcelain", [])
    if not isinstance(porcelain_raw, list):
        raise ReleaseEvidenceError("fixture git.porcelain must be a list")
    porcelain = tuple(str(x) for x in porcelain_raw)

    reference = mission_origin_head or upstream
    return GitState(
        head=head,
        head_time=head_time,
        branch=branch,
        upstream=upstream,
        upstream_head=upstream_head,
        ahead=ahead,
        behind=behind,
        reference=reference,
        reference_ref=(
            f"origin/{MISSION_BRANCH}" if mission_origin_head is not None else upstream
        ),
        worktree_clean=not porcelain,
        porcelain=porcelain,
        mission_origin_head=mission_origin_head,
    )


# ---------------------------------------------------------------------------
# Local static checks (reused canonical tools; logic never copied)
# ---------------------------------------------------------------------------
def run_local_checks() -> dict[str, dict[str, Any]]:
    """Run the two static repository contracts via subprocess (reuse, no copy)."""
    checks: dict[str, dict[str, Any]] = {}

    migrations = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "check-migrations.py")],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=120,
    )
    if migrations.returncode == 0:
        tail = (migrations.stdout or "").strip().splitlines()
        checks["migrations_static"] = {
            "state": "ready",
            "detail": tail[-1] if tail else "migration contract OK",
        }
    else:
        detail = (migrations.stderr or migrations.stdout or "").strip().splitlines()
        checks["migrations_static"] = {
            "state": "blocked",
            "detail": detail[-1] if detail else "migration contract failed",
        }

    preflight = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "check_alm_capabilities.py"), "--json"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=180,
    )
    try:
        report = json.loads(preflight.stdout or "{}")
    except json.JSONDecodeError:
        report = {}
    summary = report.get("summary", {})
    states = summary.get("capability_states", {})
    ready = int(states.get("ready", 0))
    blocked = int(states.get("blocked", 0))
    external = int(summary.get("external_checks_unknown", 0))
    blocked_caps = summary.get("blocked_capabilities", [])
    ok = bool(summary.get("repository_ready")) and preflight.returncode == 0
    checks["capability_preflight"] = {
        "state": "ready" if ok else "blocked",
        "detail": f"{ready}/{ready + blocked} ready, {blocked} blocked, external {external} unknown",
        "blocked_capabilities": list(blocked_caps) if isinstance(blocked_caps, list) else [],
    }
    return checks


def checks_from_fixture(fixture: dict[str, Any]) -> dict[str, dict[str, Any]]:
    checks_raw = fixture.get("checks", {})
    if not isinstance(checks_raw, dict):
        raise ReleaseEvidenceError("fixture checks must be an object")

    def _check(key: str) -> dict[str, Any]:
        entry = checks_raw.get(key)
        if not isinstance(entry, dict) or entry.get("state") not in ("ready", "blocked"):
            raise ReleaseEvidenceError(f"fixture checks.{key} must be {{state: ready|blocked, ...}}")
        out: dict[str, Any] = {
            "state": entry["state"],
            "detail": str(entry.get("detail") or ""),
        }
        if key == "capability_preflight" and isinstance(entry.get("blocked_capabilities"), list):
            out["blocked_capabilities"] = [str(x) for x in entry["blocked_capabilities"]]
        return out

    return {
        "migrations_static": _check("migrations_static"),
        "capability_preflight": _check("capability_preflight"),
    }


# ---------------------------------------------------------------------------
# Evidence files: explicit, schema-validated, commit-compatible, redacted
# ---------------------------------------------------------------------------
def validate_evidence(data: Any, evidence_type: str) -> tuple[dict[str, Any], list[str]]:
    """Validate one evidence object. Returns (allowlisted, dropped_fields)."""
    if not isinstance(data, dict):
        raise ReleaseEvidenceError(f"{evidence_type} evidence must be a JSON object")
    if data.get("schema_version") != SCHEMA_VERSION:
        raise ReleaseEvidenceError(
            f"{evidence_type} evidence schema_version must be {SCHEMA_VERSION}"
        )
    if data.get("evidence_type") != evidence_type:
        raise ReleaseEvidenceError(
            f"{evidence_type} evidence must declare evidence_type={evidence_type!r}"
        )
    commit = data.get("commit")
    if not isinstance(commit, str) or not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ReleaseEvidenceError(
            f"{evidence_type} evidence commit must be a 40-hex sha"
        )
    observed_raw = data.get("observed_at")
    try:
        observed_at = datetime.fromisoformat(str(observed_raw).replace("Z", "+00:00"))
        if observed_at.tzinfo is None:
            raise ValueError("naive timestamp")
    except (TypeError, ValueError) as exc:
        raise ReleaseEvidenceError(
            f"{evidence_type} evidence observed_at must be ISO8601 with timezone, "
            f"got {observed_raw!r}"
        ) from exc
    operator = data.get("operator")
    if not isinstance(operator, str) or not operator.strip():
        raise ReleaseEvidenceError(
            f"{evidence_type} evidence operator must be a non-empty string"
        )
    checks = data.get("checks", [])
    if not isinstance(checks, list) or not checks:
        raise ReleaseEvidenceError(
            f"{evidence_type} evidence must record at least one check (unverifiable otherwise)"
        )
    for index, check in enumerate(checks):
        if not isinstance(check, dict):
            raise ReleaseEvidenceError(f"{evidence_type} evidence check[{index}] must be an object")
        name = check.get("name")
        if not isinstance(name, str) or not name.strip():
            raise ReleaseEvidenceError(f"{evidence_type} evidence check[{index}] must have a name")
        if check.get("result") not in ("pass", "fail", "skip"):
            raise ReleaseEvidenceError(
                f"{evidence_type} evidence check[{index}] result must be pass|fail|skip"
            )
    if evidence_type == "approval":
        if data.get("decision") not in ("approved", "held", "rejected"):
            raise ReleaseEvidenceError(
                "approval evidence decision must be approved|held|rejected"
            )
        founder = data.get("founder")
        if not isinstance(founder, str) or not founder.strip():
            raise ReleaseEvidenceError("approval evidence founder must be a non-empty string")
    if evidence_type == "rollback" and "executed" in data:
        if not isinstance(data["executed"], bool):
            raise ReleaseEvidenceError("rollback evidence executed must be a boolean")

    allowed = {
        "schema_version",
        "evidence_type",
        "commit",
        "observed_at",
        "operator",
        "checks",
        "url",
    }
    if evidence_type == "approval":
        allowed |= {"decision", "founder"}
    if evidence_type == "rollback":
        allowed |= {"executed", "executed_at", "reason"}
    dropped = sorted(str(k) for k in data.keys() if k not in allowed)

    clean: dict[str, Any] = {k: data[k] for k in allowed if k in data}
    clean["_observed_at_dt"] = observed_at
    return clean, dropped


def classify_evidence(
    clean: dict[str, Any],
    head: str,
    head_time: datetime,
    evidence_type: str,
) -> dict[str, Any]:
    """Classify one validated evidence block: verified | blocked (never success
    from absent, stale, incompatible-commit, or failing evidence)."""
    reasons: list[str] = []
    if clean["commit"] != head:
        reasons.append(
            f"evidence commit {clean['commit'][:12]} != HEAD {head[:12]} (incompatible-commit)"
        )
        correction = f"regenerate {evidence_type} evidence at HEAD {head}"
    elif clean["_observed_at_dt"] < head_time:
        reasons.append(
            f"evidence observed_at {clean['observed_at']} predates HEAD commit "
            f"{head_time.isoformat()} (stale)"
        )
        correction = f"re-observe {evidence_type} evidence after HEAD {head[:12]}"
    else:
        failing = [
            check["name"] for check in clean["checks"] if check.get("result") == "fail"
        ]
        if failing:
            reasons.append(f"observed failing check(s): {', '.join(failing)}")
            correction = f"resolve failing {evidence_type} check(s) and re-record evidence"
        elif evidence_type == "approval" and clean["decision"] != "approved":
            reasons.append(f"explicit founder decision is {clean['decision']!r} (not approved)")
            correction = "obtain an explicit approved founder decision before promotion"
        else:
            return {
                "state": "verified",
                "reasons": [],
                "correction": "",
                "commit": clean["commit"],
                "observed_at": clean["observed_at"],
                "operator": clean["operator"],
                "checks": clean["checks"],
                **(
                    {"url": clean["url"]}
                    if isinstance(clean.get("url"), str) and clean["url"]
                    else {}
                ),
                **(
                    {"decision": clean["decision"], "founder": clean["founder"]}
                    if evidence_type == "approval"
                    else {}
                ),
                **(
                    {
                        "executed": clean.get("executed", False),
                        **(
                            {"executed_at": clean["executed_at"]}
                            if clean.get("executed_at")
                            else {}
                        ),
                        **({"reason": clean["reason"]} if clean.get("reason") else {}),
                    }
                    if evidence_type == "rollback"
                    else {}
                ),
            }
    return {"state": "blocked", "reasons": reasons, "correction": correction}


def load_evidence_map(
    args: argparse.Namespace, head: str, head_time: datetime
) -> dict[str, dict[str, Any]]:
    evidence_map: dict[str, dict[str, Any]] = {}
    for evidence_type in EVIDENCE_TYPES:
        path_raw = getattr(args, f"evidence_{evidence_type}")
        if path_raw is None:
            evidence_map[evidence_type] = {
                "state": "unknown",
                "reasons": [f"no explicit evidence supplied for {evidence_type}"],
                "correction": MISSING_CORRECTIONS[evidence_type],
            }
            continue
        path = Path(path_raw)
        if not path.is_file():
            raise ReleaseEvidenceError(
                f"{evidence_type} evidence file not found: {path_raw}"
            )
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ReleaseEvidenceError(
                f"{evidence_type} evidence file is not valid JSON: {exc}"
            ) from exc
        clean, dropped = validate_evidence(data, evidence_type)
        entry = classify_evidence(clean, head, head_time, evidence_type)
        if dropped:
            entry["dropped_fields"] = dropped
        evidence_map[evidence_type] = entry
    return evidence_map


# ---------------------------------------------------------------------------
# State projection onto the operating-model machine (read-only)
# ---------------------------------------------------------------------------
def classify_integrated_local(
    git: GitState, checks: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    reasons: list[str] = []
    ok = True
    if not git.worktree_clean:
        reasons.append(
            f"worktree not clean ({len(git.porcelain)} change(s)); run git status --porcelain"
        )
        ok = False
    if git.reference is None:
        reasons.append(
            f"no origin reference ({MISSION_BRANCH} or configured upstream) to compare against"
        )
        ok = False
    elif git.ahead is None or git.behind is None:
        reasons.append("could not compute ahead/behind against origin reference")
        ok = False
    else:
        if git.ahead > 0:
            reasons.append(f"HEAD is {git.ahead} commit(s) ahead of {git.reference}")
            ok = False
        if git.behind > 0:
            reasons.append(f"HEAD is {git.behind} commit(s) behind {git.reference}")
            ok = False
    for name, check in checks.items():
        if check["state"] != "ready":
            reasons.append(f"{name} check is {check['state']}: {check.get('detail', '')}")
            ok = False
    if ok:
        return {"state": "verified", "reasons": [], "correction": ""}
    return {
        "state": "blocked",
        "reasons": reasons,
        "correction": (
            "clean the worktree, sync HEAD with the origin reference, and pass all "
            "local checks before release"
        ),
    }


def _unknown(missing: list[str]) -> dict[str, Any]:
    reasons = [f"missing explicit evidence: {key}" for key in missing]
    correction = "; ".join(MISSING_CORRECTIONS[key] for key in missing)
    return {"state": "unknown", "reasons": reasons, "correction": correction}


def _gate_all(
    lower: dict[str, Any], keys: tuple[str, ...], evidence_map: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    """Chain gate: the upper state is verified only when the lower state is
    verified and every named evidence block is verified. An UNKNOWN lower gate
    propagates as UNKNOWN (evidence missing is not a concrete failure); a
    BLOCKED lower gate propagates as BLOCKED."""
    if lower["state"] != "verified":
        return {
            "state": lower["state"],
            "reasons": lower["reasons"],
            "correction": lower["correction"],
        }
    missing = [key for key in keys if evidence_map[key]["state"] == "unknown"]
    bad = [key for key in keys if evidence_map[key]["state"] == "blocked"]
    if missing:
        return _unknown(missing)
    if bad:
        reasons: list[str] = []
        for key in bad:
            reasons.extend(evidence_map[key]["reasons"])
        correction = "; ".join(evidence_map[key]["correction"] for key in bad)
        return {"state": "blocked", "reasons": reasons, "correction": correction}
    return {"state": "verified", "reasons": [], "correction": ""}


def classify_release_states(
    git: GitState,
    checks: dict[str, dict[str, Any]],
    evidence_map: dict[str, dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    integrated = classify_integrated_local(git, checks)
    states: dict[str, dict[str, Any]] = {"integrated_local": integrated}
    states["preview_candidate"] = _gate_all(integrated, ("preview",), evidence_map)
    states["preview_verified"] = _gate_all(
        states["preview_candidate"], ("preview",), evidence_map
    )
    states["release_ready"] = _gate_all(
        states["preview_verified"], ("migration", "rollback"), evidence_map
    )
    states["production_canary"] = _gate_all(
        states["release_ready"], ("canary", "approval"), evidence_map
    )
    states["promoted"] = _gate_all(
        states["production_canary"], ("production", "rollback", "approval"), evidence_map
    )
    return states


def classify_terminal(
    states: dict[str, dict[str, Any]], evidence_map: dict[str, dict[str, Any]]
) -> dict[str, dict[str, Any]]:
    terminal: dict[str, dict[str, Any]] = {}
    rollback = evidence_map["rollback"]
    if rollback.get("executed") is True:
        terminal["rolled_back"] = {
            "state": "verified",
            "reasons": ["explicit executed-rollback record"],
            "correction": "",
            **({"executed_at": rollback["executed_at"]} if rollback.get("executed_at") else {}),
            **({"reason": rollback["reason"]} if rollback.get("reason") else {}),
        }
    else:
        terminal["rolled_back"] = {
            "state": "unknown",
            "reasons": [
                "no executed rollback observed; readiness evidence is not an executed rollback"
            ],
            "correction": "record an executed rollback only in --rollback-evidence (executed: true)",
        }
    approval = evidence_map["approval"]
    if approval.get("decision") == "held":
        terminal["held"] = {
            "state": "verified",
            "reasons": ["explicit founder decision: held"],
            "correction": "",
        }
    elif states["promoted"]["state"] == "blocked":
        terminal["held"] = {
            "state": "verified",
            "reasons": ["promotion is blocked by a failing gate; release is held"],
            "correction": "resolve the blocked gate or roll back",
        }
    else:
        terminal["held"] = {
            "state": "unknown",
            "reasons": ["no held decision and no blocked promotion gate observed"],
            "correction": "",
        }
    return terminal


# ---------------------------------------------------------------------------
# Packet assembly
# ---------------------------------------------------------------------------
def build_packet(
    git: GitState,
    checks: dict[str, dict[str, Any]],
    evidence_map: dict[str, dict[str, Any]],
    source_mode: str,
    fixture_label: str,
    repo_root: str,
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    states = classify_release_states(git, checks, evidence_map)
    terminal = classify_terminal(states, evidence_map)
    forward = [states[name]["state"] for name in FORWARD_STATES]
    highest_verified = next(
        (name for name in reversed(FORWARD_STATES) if states[name]["state"] == "verified"),
        None,
    )
    return {
        "schema_version": SCHEMA_VERSION,
        "tool": "alm-release-evidence",
        "source_mode": source_mode,
        "fixture": fixture_label,
        "repo_root": repo_root,
        "generated_at": (generated_at or datetime.now(timezone.utc)).isoformat(
            timespec="seconds"
        ),
        "mission_branch": MISSION_BRANCH,
        "git": {
            "head": git.head,
            "head_time": git.head_time.isoformat(),
            "branch": git.branch,
            "upstream": git.upstream,
            "upstream_head": git.upstream_head,
            "reference": git.reference,
            "reference_ref": git.reference_ref,
            "ahead": git.ahead,
            "behind": git.behind,
            "mission_origin_head": git.mission_origin_head,
            "worktree_clean": git.worktree_clean,
            "porcelain": list(git.porcelain),
        },
        "local_checks": checks,
        "states": states,
        "terminal": terminal,
        "evidence": evidence_map,
        "rollback_checklist": ROLLBACK_CHECKLIST,
        "summary": {
            "packet_valid": True,
            "forward_states": {
                "verified": forward.count("verified"),
                "blocked": forward.count("blocked"),
                "unknown": forward.count("unknown"),
            },
            "highest_verified_state": highest_verified,
            "promoted": states["promoted"]["state"],
            "terminal_held": terminal["held"]["state"],
            "terminal_rolled_back": terminal["rolled_back"]["state"],
            "external_evidence_unknown": sum(
                1 for entry in evidence_map.values() if entry["state"] == "unknown"
            ),
            "secret_values_emitted": False,
        },
        "limitations": LIMITATIONS,
    }


# ---------------------------------------------------------------------------
# Human output
# ---------------------------------------------------------------------------
def _fmt(state: str) -> str:
    return state.upper()


def print_human(packet: dict[str, Any], verbose: bool = False) -> None:
    git = packet["git"]
    print("ALM RELEASE EVIDENCE")
    print(f"schema         : {packet['schema_version']}")
    print(f"source         : {packet['source_mode']}")
    if packet["source_mode"] == "fixture":
        print(f"fixture        : {packet['fixture']}")
    print(f"repo           : {packet['repo_root']}")
    print(f"generated_at   : {packet['generated_at']}")
    print(f"git            : HEAD {git['head'][:12]} ({git['branch']})")
    if git["reference"]:
        print(
            f"  reference    : {git['reference_ref'] or git['reference']} "
            f"({git['ahead']} ahead, {git['behind']} behind)"
        )
    else:
        print("  reference    : none")
    print(f"  worktree     : {'clean' if git['worktree_clean'] else 'DIRTY (' + str(len(git['porcelain'])) + ' change(s))'}")
    for name, check in packet["local_checks"].items():
        print(f"check          : {name:<22} {check['state'].upper()}")
    print()
    print("states:")
    for name, entry in packet["states"].items():
        marker = entry["state"].ljust(8)
        line = f"  [{marker}] {name}"
        if entry["state"] != "verified" and entry["reasons"]:
            line += "   " + " | ".join(entry["reasons"][:2])
        print(line)
        if entry["state"] != "verified" and entry["correction"]:
            print(f"      correction: {entry['correction']}")
    print("terminal:")
    for name, entry in packet["terminal"].items():
        marker = entry["state"].ljust(8)
        print(f"  [{marker}] {name}")
    summary = packet["summary"]
    print()
    print(
        f"external evidence: {summary['external_evidence_unknown']} UNKNOWN - "
        "never fabricated (see correction commands above)"
    )
    print("secret values    : none emitted")
    print(
        f"packet           : {'VALID' if summary['packet_valid'] else 'INVALID'} "
        f"(exit 0 means valid packet, not release-ready)"
    )
    if verbose:
        print()
        print("evidence detail:")
        for name, entry in packet["evidence"].items():
            print(f"  {name:<10} {entry['state'].upper()}")
            if entry.get("dropped_fields"):
                print(f"      dropped_fields: {entry['dropped_fields']}")
        print()
        print("rollback checklist:")
        for step in packet["rollback_checklist"]:
            print(f"  {step['step']}. {step['action']}: {step['command']}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def _resolve_path(raw: str) -> Path:
    path = Path(raw)
    if path.is_absolute():
        return path
    cwd_candidate = Path.cwd() / raw
    if cwd_candidate.exists():
        return cwd_candidate
    return ROOT / raw


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="build_alm_release_evidence.py",
        description=(
            "Deterministic, non-mutating ALM founder release-evidence packet. "
            "Reads local git + static checks, projects explicit evidence onto the "
            "operating-model states, and never fabricates external success."
        ),
    )
    parser.add_argument("--repo", default=None, help="git repository root (default: this checkout)")
    parser.add_argument("--fixture", default=None, help="deterministic git+checks fixture (tests)")
    parser.add_argument("--output", default=None, help="write packet JSON to PATH")
    parser.add_argument("--json", action="store_true", help="emit only the stable JSON packet")
    parser.add_argument("--verbose", action="store_true", help="human output with detail")
    for evidence_type in EVIDENCE_TYPES:
        parser.add_argument(
            f"--{evidence_type}-evidence",
            dest=f"evidence_{evidence_type}",
            default=None,
            metavar="PATH",
            help=f"explicit {evidence_type} evidence file (schema v{SCHEMA_VERSION})",
        )
    args = parser.parse_args(argv)

    repo = Path(args.repo).resolve() if args.repo else ROOT

    if args.fixture:
        fixture_path = _resolve_path(args.fixture)
        if not fixture_path.is_file():
            print(f"ERROR: fixture not found: {args.fixture}", file=sys.stderr)
            return EXIT_USAGE
        try:
            fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
            if not isinstance(fixture, dict):
                raise ValueError("fixture must be a JSON object")
            git = git_from_fixture(fixture)
            checks = checks_from_fixture(fixture)
        except (ReleaseEvidenceError, json.JSONDecodeError, ValueError) as exc:
            print(f"ERROR: invalid fixture: {exc}", file=sys.stderr)
            return EXIT_USAGE
        source_mode = "fixture"
        fixture_label = str(fixture.get("name") or fixture_path)
    else:
        try:
            git = read_git_state(repo)
        except GitReadError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return EXIT_USAGE
        checks = run_local_checks()
        source_mode = "real-environment"
        fixture_label = "-"

    try:
        evidence_map = load_evidence_map(args, git.head, git.head_time)
    except (ReleaseEvidenceError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return EXIT_USAGE

    packet = build_packet(
        git, checks, evidence_map, source_mode, fixture_label, str(repo)
    )

    if args.output:
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(packet, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"wrote release evidence packet: {out}")
        print_human(packet, verbose=args.verbose)
    elif args.json:
        print(json.dumps(packet, indent=2, sort_keys=True))
    else:
        print_human(packet, verbose=args.verbose)

    return EXIT_OK


if __name__ == "__main__":
    raise SystemExit(main())
