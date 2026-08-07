#!/usr/bin/env python3
"""ALM authentication and capability preflight — deterministic, no-secret matrix.

One local command distinguishes READY, BLOCKED, and UNKNOWN for the supported
customer auth paths and release prerequisites:

  Google OAuth, magic link delivery/template, preview-only test login,
  Instagram OAuth, callback/support/privacy/data-deletion routes, required
  environment-variable presence (never values), worker commands, DeepSeek
  V4 Flash policy features, migration/static checks, and recovery guidance.

Contract
--------
* Repository and environment checks are static and deterministic. They use
  repository files and an environment snapshot only.
* Credential checks are PRESENCE-ONLY. Values from the real environment or a
  fixture are never printed, embedded in reasons, or serialized.
* External/live verification (provider dashboards, Meta review, Resend domain
  verification, gateway reachability, live login) is ALWAYS reported as
  UNKNOWN here and never claimed from fixtures. The exact separate
  release-gate command is emitted per capability instead.
* Missing credentials or a policy violation fail closed: the capability is
  BLOCKED and the process exits nonzero BEFORE any mutation. This tool never
  mutates anything.
* Production-only preview test login is rejected by policy.

Usage
-----
    python3 scripts/check_alm_capabilities.py [--fixture PATH] [--json] [--verbose]

  --fixture PATH  JSON file describing an environment: {"name": "...", "env": {...}}.
                  Relative paths resolve against the current directory, then the
                  repository root. When omitted, the real process environment is
                  used (still presence-only).
  --json          Emit only the stable JSON report on stdout.
  --verbose       Human output additionally lists artifacts, env, and policy detail.

Exit codes
----------
  0  every named capability is repository-ready (external checks remain UNKNOWN)
  2  one or more capabilities are BLOCKED (fail closed)
  3  usage / fixture error

Pseudo keys
-----------
Environment groups may reference:
  @artifact:<relpath>          present iff the repository file exists
  @policy:<NAME>=<value>       present iff env var NAME equals value (case-insensitive)

Fixtures prove classification and redaction only — never live provider
availability or login success.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_VERSION = 1
EXIT_OK = 0
EXIT_BLOCKED = 2
EXIT_USAGE = 3


# ---------------------------------------------------------------------------
# Policy checks
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class PolicyCheck:
    """A value check on an environment variable. Notes never contain the value."""

    key: str
    exact: str | None = None
    allowed: tuple[str, ...] | None = None
    max_value: int | None = None
    block_on_value: str | None = None
    optional: bool = False

    def evaluate(self, value: str | None) -> tuple[bool, str]:
        if self.block_on_value is not None:
            if value is None:
                return True, "unset (no block trigger)"
            if value.strip().lower() == self.block_on_value.strip().lower():
                return False, f"must not be {self.block_on_value!r} (fail closed)"
            return True, "allowed (not the blocked value)"
        if value is None:
            if self.optional:
                return True, "unset (optional; skipped)"
            return False, "missing"
        if self.exact is not None:
            if value.strip() == self.exact:
                return True, f"matches expected {self.exact!r}"
            return False, f"must equal {self.exact!r}"
        if self.allowed is not None:
            if value.strip().lower() in {v.lower() for v in self.allowed}:
                return True, "in allowed set"
            return False, f"must be one of {sorted(self.allowed)!r}"
        if self.max_value is not None:
            try:
                if int(value) <= self.max_value:
                    return True, f"at most {self.max_value}"
            except ValueError:
                pass
            return False, f"must be an integer at most {self.max_value}"
        return True, "present"


# ---------------------------------------------------------------------------
# Capability matrix (canonical; source = repo artifacts + docs)
# ---------------------------------------------------------------------------
def _run_migrations_check() -> tuple[bool, str]:
    """Reuse the canonical static migration contract (scripts/check-migrations.py)."""
    try:
        proc = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "check-migrations.py")],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=60,
        )
    except Exception as exc:  # noqa: BLE001 - aggregated release evidence
        return False, f"migration check could not run: {exc}"
    if proc.returncode == 0:
        tail = (proc.stdout or "").strip().splitlines()
        return True, tail[-1] if tail else "migration contract OK"
    detail = (proc.stderr or proc.stdout or "").strip().splitlines()
    return False, detail[-1] if detail else "migration contract failed"


@dataclass(frozen=True)
class Capability:
    id: str
    name: str
    artifacts: tuple[str, ...] = ()
    artifact_contains: tuple[tuple[str, tuple[str, ...]], ...] = ()
    env_all: tuple[str, ...] = ()
    env_any_of: tuple[tuple[str, ...], ...] = ()
    policy: tuple[PolicyCheck, ...] = ()
    repository_hook: Callable[[], tuple[bool, str]] | None = None
    external_label: str = ""
    external_command: str = ""
    limitation: str = ""
    recovery: str = ""


CAPABILITIES: tuple[Capability, ...] = (
    Capability(
        id="google_oauth",
        name="Google OAuth sign-in",
        artifacts=(
            "web/src/app/auth/callback/route.ts",
            "web/src/app/login/actions.ts",
            "web/src/lib/env.ts",
        ),
        env_all=(
            "NEXT_PUBLIC_SUPABASE_URL",
            "NEXT_PUBLIC_SUPABASE_ANON_KEY",
            "NEXT_PUBLIC_SITE_URL",
        ),
        external_label=(
            "Google provider enabled in Supabase Auth with redirect URL "
            "<siteUrl>/auth/callback"
        ),
        external_command=(
            "manual - Supabase dashboard (Authentication -> Providers, Google) "
            "and <siteUrl>/auth/callback; live sign-in smoke at the release gate"
        ),
        limitation=(
            "Static presence never proves a live Google sign-in; provider "
            "configuration lives in the Supabase project."
        ),
        recovery=(
            "Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and "
            "NEXT_PUBLIC_SITE_URL (production origin only; do not set SITE_URL on "
            "preview). Enable the Google provider in Supabase Auth and register "
            "<siteUrl>/auth/callback as the redirect URL."
        ),
    ),
    Capability(
        id="magic_link",
        name="Magic link delivery and template",
        artifacts=(
            "web/src/app/login/actions.ts",
            "web/src/lib/auth/magic-link-email.ts",
            "web/src/app/auth/callback/route.ts",
        ),
        env_any_of=(
            ("RESEND_API_KEY",),
            ("@artifact:supabase/templates/magic_link.html",),
        ),
        external_label=(
            "Resend domain verified (branded path) or Supabase SMTP plus "
            "token_hash template; link opens in a mail app and lands on /dashboard"
        ),
        external_command=(
            "manual - Resend dashboard (domain verification) or Supabase "
            "Authentication -> SMTP; send a real magic link at the release gate"
        ),
        limitation=(
            "Delivery requires either the branded Resend path or the Supabase "
            "SMTP token_hash template; presence does not prove delivery."
        ),
        recovery=(
            "Set RESEND_API_KEY (+ AUTH_EMAIL_FROM) and verify the sending domain "
            "in Resend, or configure Supabase SMTP and push "
            "supabase/templates/magic_link.html (token_hash link - the default "
            "ConfirmationURL PKCE link fails when opened from mail apps)."
        ),
    ),
    Capability(
        id="preview_login",
        name="Preview-only test login",
        artifacts=(
            "web/src/app/api/auth/preview-login/route.ts",
            "web/src/lib/auth/preview-login.ts",
            "web/src/app/login/actions.ts",
        ),
        env_all=(
            "NEXT_PUBLIC_SUPABASE_URL",
            "NEXT_PUBLIC_SUPABASE_ANON_KEY",
            "SUPABASE_SERVICE_ROLE_KEY",
            "PREVIEW_TEST_USER_PASSWORD",
            "PREVIEW_TEST_LOGIN_SECRET",
        ),
        policy=(
            PolicyCheck(key="VERCEL_ENV", block_on_value="production"),
            PolicyCheck(key="AUDITLAYER_ALLOW_PREVIEW_LOGIN", block_on_value="0"),
        ),
        external_label=(
            "Preview/local only - verify a manual preview sign-in; production "
            "is rejected by policy"
        ),
        external_command=(
            "manual - sign in as the preview tester on a Vercel Preview "
            "deployment (never production)"
        ),
        limitation=(
            "Preview login hard-disables on VERCEL_ENV=production in "
            "web/src/lib/env.ts; a fixture can only prove the policy "
            "classification, never a live session."
        ),
        recovery=(
            "Set PREVIEW_TEST_USER_PASSWORD and PREVIEW_TEST_LOGIN_SECRET (plus "
            "Supabase URL/anon/service-role) on preview deployments only. Never "
            "set preview credentials on a deployment with VERCEL_ENV=production; "
            "the route and helper hard-reject production."
        ),
    ),
    Capability(
        id="instagram_oauth",
        name="Instagram Business Login",
        artifacts=(
            "web/src/app/api/auth/instagram/start/route.ts",
            "web/src/app/api/auth/instagram/callback/route.ts",
            "web/src/lib/instagram-oauth-config.ts",
            "docs/instagram-app-review.md",
        ),
        env_all=("INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"),
        external_label=(
            "Meta app review: instagram_business_basic advanced access, OAuth "
            "redirect URI allow-listed, privacy/deletion URLs live"
        ),
        external_command=(
            "manual - Meta App dashboard "
            "(developers.facebook.com/apps/<INSTAGRAM_APP_ID>) per "
            "docs/instagram-app-review.md; live connect smoke at the release gate"
        ),
        limitation=(
            "Environment presence plus repository support do not prove Meta "
            "review status or token exchange; both are external."
        ),
        recovery=(
            "Set INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET on the web host. "
            "Complete the docs/instagram-app-review.md checklist (redirect URI, "
            "privacy/data-deletion URLs, tester account, advanced access, Live "
            "mode) before enabling production connects."
        ),
    ),
    Capability(
        id="public_routes",
        name="Callback / support / privacy / data-deletion routes",
        artifacts=(
            "web/src/app/auth/callback/route.ts",
            "web/src/app/support/page.tsx",
            "web/src/app/privacy/page.tsx",
            "web/src/app/data-deletion/page.tsx",
        ),
        external_label="Deployed routes return 200 on preview/production",
        external_command=(
            "curl -fsS -o /dev/null -w '%{http_code}\\n' <siteUrl>/support "
            "(repeat for /privacy, /data-deletion, /auth/callback) at the "
            "release gate"
        ),
        limitation=(
            "File presence is a repository check only; deployed availability is "
            "a live check."
        ),
        recovery=(
            "Restore any missing route file, then verify the deployed route "
            "returns 200 at the release gate."
        ),
    ),
    Capability(
        id="worker_commands",
        name="Worker command surface",
        artifacts=(
            "worker/auditlayer_worker/__main__.py",
            "worker/auditlayer_worker/release_preflight.py",
            "worker/.env.example",
        ),
        artifact_contains=(
            (
                "worker/auditlayer_worker/__main__.py",
                (
                    "run",
                    "demo",
                    "diagnose-hermes",
                    "validate-hermes",
                    "release-preflight",
                    "benchmark",
                ),
            ),
        ),
        env_all=("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"),
        env_any_of=(
            ("@policy:HERMES_MODE=inprocess",),
            ("HERMES_API_KEY",),
        ),
        external_label="Live gateway reachability and auth on the worker host",
        external_command=(
            "cd worker && uv run python -m auditlayer_worker diagnose-hermes  "
            "# must show ok=true, tcp_reachable=true, auth_ok=true, "
            "api_server_state=connected"
        ),
        limitation=(
            "The subcommand surface is verified statically; gateway reachability "
            "requires diagnose-hermes on the worker host."
        ),
        recovery=(
            "Fill worker/.env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, "
            "plus HERMES_API_KEY matching the gateway API_SERVER_KEY (or set "
            "HERMES_MODE=inprocess). Run diagnose-hermes; HTTP 401 means the "
            "keys do not match."
        ),
    ),
    Capability(
        id="deepseek_policy",
        name="DeepSeek V4 Flash policy features",
        artifacts=(
            "worker/auditlayer_worker/release_preflight.py",
            "worker/.env.example",
            "docs/implementation/alm-intelligence-v1/DECISIONS.md",
        ),
        artifact_contains=(
            (
                "worker/auditlayer_worker/release_preflight.py",
                ("deepseek-v4-flash", "inprocess"),
            ),
        ),
        env_all=("HERMES_MODEL", "HERMES_PROVIDER"),
        policy=(
            PolicyCheck(key="HERMES_MODEL", exact="deepseek-v4-flash"),
            PolicyCheck(key="HERMES_PROVIDER", exact="deepseek"),
            PolicyCheck(key="HERMES_MAX_ITERATIONS", max_value=3, optional=True),
            PolicyCheck(key="AUDITLAYER_GENERATOR", allowed=("hermes", "mock"), optional=True),
            PolicyCheck(key="HERMES_MODE", allowed=("inprocess", "http", "subprocess"), optional=True),
        ),
        external_label="Live DeepSeek model availability and bounded-runtime behavior",
        external_command=(
            "cd worker && uv run python -m auditlayer_worker validate-hermes  "
            "# must return ok=True, skipped=False"
        ),
        limitation=(
            "The policy contract is checked statically from environment presence "
            "and repository contracts; fixtures never prove live model "
            "availability or calibration."
        ),
        recovery=(
            "Set HERMES_MODEL=deepseek-v4-flash and HERMES_PROVIDER=deepseek; "
            "keep HERMES_MAX_ITERATIONS at most 3. Production uses "
            "HERMES_MODE=inprocess and AUDITLAYER_GENERATOR=hermes with no "
            "fallback provider. Run validate-hermes on the worker host before release."
        ),
    ),
    Capability(
        id="migrations_static",
        name="Migration / static release checks",
        artifacts=(),
        repository_hook=_run_migrations_check,
        external_label="Live migration application on the linked Supabase project",
        external_command=(
            "python3 scripts/check-migrations.py && npx supabase@latest db push  "
            "# linked project only; never run by this preflight"
        ),
        limitation=(
            "The local static migration contract is runnable here; applying "
            "migrations to the live project is a separate release-gate step."
        ),
        recovery=(
            "Run python3 scripts/check-migrations.py and fix filename ordering, "
            "duplicate versions, or missing release-contract migrations before "
            "any db push."
        ),
    ),
)

CAPABILITY_IDS: tuple[str, ...] = tuple(c.id for c in CAPABILITIES)


# ---------------------------------------------------------------------------
# Environment resolution
# ---------------------------------------------------------------------------
def _resolve_path(raw: str) -> Path:
    path = Path(raw)
    if path.is_absolute():
        return path
    cwd_candidate = Path.cwd() / raw
    if cwd_candidate.exists():
        return cwd_candidate
    return ROOT / raw


def _pseudo_present(key: str, env: dict[str, str]) -> bool | None:
    """Resolve @artifact: and @policy: pseudo keys; None when key is not pseudo."""
    if key.startswith("@artifact:"):
        return (ROOT / key[len("@artifact:") :]).is_file()
    if key.startswith("@policy:"):
        spec = key[len("@policy:") :]
        if "=" not in spec:
            return False
        name, expected = spec.split("=", 1)
        return env.get(name, "").strip().lower() == expected.strip().lower()
    return None


def load_environment(fixture_path: Path | None) -> tuple[dict[str, str], str, str]:
    if fixture_path is None:
        return dict(os.environ), "real-environment", "real-environment"
    data = json.loads(fixture_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("env"), dict):
        raise ValueError("fixture must be an object with an 'env' object")
    env = {str(k): str(v) for k, v in data["env"].items()}
    label = str(data.get("name") or fixture_path)
    return env, "fixture", label


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------
def evaluate_repository(cap: Capability) -> tuple[bool, list[str], list[str], str]:
    if cap.repository_hook is not None:
        ok, detail = cap.repository_hook()
        if ok:
            return True, ["scripts/check-migrations.py (static contract)"], [], detail
        return False, [], ["scripts/check-migrations.py"], detail

    present: list[str] = []
    missing: list[str] = []
    for rel in cap.artifacts:
        if (ROOT / rel).is_file():
            present.append(rel)
        else:
            missing.append(rel)
    for rel, needles in cap.artifact_contains:
        path = ROOT / rel
        if not path.is_file():
            if rel not in missing:
                missing.append(rel)
            continue
        text = path.read_text(encoding="utf-8", errors="replace").lower()
        for needle in needles:
            if needle.lower() in text:
                if rel not in present:
                    present.append(rel)
            else:
                missing.append(f"{rel} (missing text: {needle})")
    ok = not missing
    return ok, sorted(set(present)), sorted(set(missing)), ""


def evaluate_env(cap: Capability, env: dict[str, str]) -> tuple[bool, list[str], list[str]]:
    present: list[str] = []
    missing: list[str] = []
    ok = True

    for key in cap.env_all:
        if key in env and env[key] != "":
            present.append(key)
        else:
            missing.append(key)
            ok = False

    groups: list[dict[str, Any]] = []
    for group in cap.env_any_of:
        group_present: list[str] = []
        group_missing: list[str] = []
        for key in group:
            pseudo = _pseudo_present(key, env)
            if pseudo is True:
                group_present.append(key)
            elif pseudo is False:
                group_missing.append(key)
            elif key in env and env[key] != "":
                group_present.append(key)
            else:
                group_missing.append(key)
        satisfied = not group_missing
        groups.append(
            {
                "group": list(group),
                "satisfied": satisfied,
                "present": group_present,
                "missing": group_missing,
            }
        )
        if satisfied:
            present.extend(group_present)
        groups.append(
            {
                "group": list(group),
                "satisfied": satisfied,
                "present": group_present,
                "missing": group_missing,
            }
        )

    any_satisfied = any(g["satisfied"] for g in groups)
    if cap.env_any_of:
        if not any_satisfied:
            for g in groups:
                missing.extend(g["missing"])
            ok = False

    return ok, sorted(set(present)), sorted(set(missing))


def evaluate_policy(cap: Capability, env: dict[str, str]) -> tuple[bool, list[dict[str, Any]]]:
    checks: list[dict[str, Any]] = []
    ok = True
    for pc in cap.policy:
        check_ok, note = pc.evaluate(env.get(pc.key))
        if not check_ok:
            ok = False
        checks.append({"key": pc.key, "ok": check_ok, "note": note})
    return ok, checks


def evaluate_capability(cap: Capability, env: dict[str, str]) -> dict[str, Any]:
    repo_ok, repo_present, repo_missing, repo_detail = evaluate_repository(cap)
    env_ok, env_present, env_missing = evaluate_env(cap, env)
    policy_ok, policy_checks = evaluate_policy(cap, env)

    reasons: list[str] = []
    if not repo_ok:
        reasons.append("missing repository artifact: " + ", ".join(repo_missing))
    if not env_ok:
        reasons.append("missing environment variable(s): " + ", ".join(env_missing))
    if not policy_ok:
        bad = [c for c in policy_checks if not c["ok"]]
        reasons.append(
            "policy violation: "
            + "; ".join(f'{c["key"]} - {c["note"]}' for c in bad)
        )

    return {
        "id": cap.id,
        "name": cap.name,
        "state": "blocked" if reasons else "ready",
        "repository": {
            "state": "ready" if repo_ok else "blocked",
            "artifacts_present": repo_present,
            "artifacts_missing": repo_missing,
            "detail": repo_detail,
        },
        "env": {
            "state": "ready" if env_ok else "blocked",
            "present": env_present,
            "missing": env_missing,
        },
        "policy": {"state": "ready" if policy_ok else "blocked", "checks": policy_checks},
        "external": {
            "state": "unknown",
            "label": cap.external_label,
            "command": cap.external_command,
        },
        "limitation": cap.limitation,
        "recovery": cap.recovery,
        "reasons": reasons,
    }


def _real_env_keys(keys: list[str]) -> list[str]:
    return sorted(k for k in keys if not k.startswith("@"))


def build_report(env: dict[str, str], mode: str, fixture_label: str) -> dict[str, Any]:
    capabilities = [evaluate_capability(c, env) for c in CAPABILITIES]
    blocked = [c for c in capabilities if c["state"] == "blocked"]
    ready = [c for c in capabilities if c["state"] == "ready"]

    env_present = sorted({k for c in capabilities for k in c["env"]["present"]})
    env_missing = sorted({k for c in capabilities for k in c["env"]["missing"]})

    return {
        "schema_version": SCHEMA_VERSION,
        "tool": "alm-capability-preflight",
        "fixture": fixture_label,
        "environment_mode": mode,
        "repo_root": str(ROOT),
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "summary": {
            "repository_ready": len(blocked) == 0,
            "capability_states": {"ready": len(ready), "blocked": len(blocked)},
            "blocked_capabilities": [c["id"] for c in blocked],
            "env_presence": {
                "count_present": len(_real_env_keys(env_present)),
                "present": _real_env_keys(env_present),
                "missing": _real_env_keys(env_missing),
            },
            "external_checks_unknown": sum(
                1 for c in capabilities if c["external"]["state"] == "unknown"
            ),
            "secret_values_emitted": False,
        },
        "capabilities": capabilities,
        "blocked": [
            {
                "id": c["id"],
                "name": c["name"],
                "reasons": c["reasons"],
                "recovery": c["recovery"],
            }
            for c in blocked
        ],
    }


# ---------------------------------------------------------------------------
# Human output
# ---------------------------------------------------------------------------
def print_human(report: dict[str, Any], verbose: bool = False) -> None:
    summary = report["summary"]
    print("ALM CAPABILITY PREFLIGHT")
    print(f"schema           : {report['schema_version']}")
    print(f"fixture          : {report['fixture']}")
    print(f"repo root        : {report['repo_root']}")
    if summary["repository_ready"]:
        print(
            f"repository       : READY "
            f"({summary['capability_states']['ready']}/{len(report['capabilities'])} ready, "
            f"{summary['capability_states']['blocked']} blocked)"
        )
    else:
        print(
            f"repository       : BLOCKED "
            f"({summary['capability_states']['blocked']} blocked, "
            f"{summary['capability_states']['ready']} ready)"
        )
    print(
        f"external checks  : {summary['external_checks_unknown']} UNKNOWN - never claimed "
        "locally (see release-gate commands below)"
    )
    env_presence = summary["env_presence"]
    print(
        f"env presence     : {env_presence['count_present']} present, "
        f"{len(env_presence['missing'])} missing (names only; values never shown)"
    )
    print("secret values    : none emitted")
    print()

    print("capabilities:")
    for cap in report["capabilities"]:
        marker = "blocked" if cap["state"] == "blocked" else "ready  "
        print(f"  [{marker}] {cap['id']:<18} {cap['name']}")
        if verbose:
            if cap["repository"]["artifacts_present"]:
                print(
                    "      artifacts present: "
                    + ", ".join(cap["repository"]["artifacts_present"])
                )
            if cap["repository"]["artifacts_missing"]:
                print(
                    "      artifacts missing: "
                    + ", ".join(cap["repository"]["artifacts_missing"])
                )
            if cap["env"]["present"]:
                print("      env present      : " + ", ".join(cap["env"]["present"]))
            if cap["env"]["missing"]:
                print("      env missing      : " + ", ".join(cap["env"]["missing"]))
            for check in cap["policy"]["checks"]:
                print(
                    f"      policy {check['key']:<22} "
                    f"{'ok' if check['ok'] else 'FAIL'}: {check['note']}"
                )
            if cap["repository"]["detail"]:
                print(f"      repo check       : {cap['repository']['detail']}")
            print(f"      limitation       : {cap['limitation']}")

    print()
    if report["blocked"]:
        print("blocked (fail closed before any mutation):")
        for entry in report["blocked"]:
            print(f"  - {entry['id']}")
            for reason in entry["reasons"]:
                print(f"      reason  : {reason}")
            print(f"      recovery: {entry['recovery']}")
    else:
        print("blocked: (none)")

    print()
    print("release-gate external checks (UNKNOWN is not ready - run separately):")
    for cap in report["capabilities"]:
        print(f"  {cap['id']:<18}: {cap['external']['command']}")
    print()
    print(
        "Fixtures prove classification and redaction only - never live provider "
        "availability or login success."
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="check_alm_capabilities.py",
        description=(
            "Deterministic, no-secret authentication/capability preflight for "
            "AuditLayer. Presence-only env checks; external/live verification "
            "is always UNKNOWN and never claimed locally."
        ),
    )
    parser.add_argument(
        "--fixture",
        default=None,
        help=(
            "Path to a JSON fixture environment ({'name': ..., 'env': {...}}). "
            "Values are presence-only and never printed. Defaults to the real "
            "process environment."
        ),
    )
    parser.add_argument("--json", action="store_true", help="Emit only the stable JSON report")
    parser.add_argument(
        "--verbose", action="store_true", help="Human output with per-capability detail"
    )
    args = parser.parse_args(argv)

    fixture_path: Path | None = None
    if args.fixture:
        fixture_path = _resolve_path(args.fixture)
        if not fixture_path.is_file():
            print(f"ERROR: fixture not found: {args.fixture}", file=sys.stderr)
            return EXIT_USAGE

    try:
        env, mode, fixture_label = load_environment(fixture_path)
    except (ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: invalid fixture: {exc}", file=sys.stderr)
        return EXIT_USAGE

    report = build_report(env, mode, fixture_label)

    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print_human(report, verbose=args.verbose)

    return EXIT_OK if report["summary"]["repository_ready"] else EXIT_BLOCKED


if __name__ == "__main__":
    raise SystemExit(main())
