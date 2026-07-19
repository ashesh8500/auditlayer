#!/usr/bin/env python3
"""Static release checks for the ordered Supabase migration contract."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase" / "migrations"
REQUIRED = {
    "0016": ("claim_next_queued", "claim_next_refinement", "skip locked", "service_role"),
    "0017": ("prompt_version",),
    "0018": ("reap_stale_running", "skip locked", "service_role"),
    "0019": ("wellness_benchmarks", "row level security"),
    "0020": ("peer_graph", "row level security"),
    "0021": ("get_benchmarks", "is_admin", "service_role"),
    "0022": ("redeem_trial_link", "submit_entitled_audit", "admin_set_access", "row level security"),
    "0023": ("deepseek-v4-flash",),
    "0024": ("token_cap", "120000"),
    "0028": (
        'drop policy if exists "service role can manage connections"',
        "to service_role",
        "with check (true)",
    ),
}

# A CREATE POLICY with USING (true) and no TO clause applies to PUBLIC: every
# role (anon included) passes it, and permissive policies are OR'd. That is
# the instagram_connections token leak fixed in 0028. Historical migrations
# are immutable, so the guard only binds versions above 0028; the 0007 fix
# itself is pinned via REQUIRED.
OPEN_POLICY_GUARD_AFTER = "0028"

OPEN_TRUE_POLICY_RE = re.compile(
    r"create\s+policy\b(?:(?!;).)*?using\s*\(\s*true\s*\)(?:(?!;).)*?;",
    re.IGNORECASE | re.DOTALL,
)
TO_CLAUSE_RE = re.compile(r"\bto\s+[a-z_]", re.IGNORECASE)


def find_open_true_policies(sql: str) -> list[str]:
    """Return CREATE POLICY statements that have USING (true) but no TO clause."""
    offenders: list[str] = []
    for match in OPEN_TRUE_POLICY_RE.finditer(sql):
        statement = match.group(0)
        head = statement[: statement.lower().index("using")]
        if not TO_CLAUSE_RE.search(head):
            offenders.append(" ".join(statement.split()))
    return offenders


SELF_TEST_FIXTURES: tuple[tuple[str, bool], ...] = (
    # The 0007 bug, reintroduced — must be flagged.
    (
        'CREATE POLICY "Service role can manage connections"\n'
        "    ON public.instagram_connections FOR ALL\n"
        "    USING (true)\n"
        "    WITH CHECK (true);",
        True,
    ),
    # The 0028 fix — scoped to service_role, must pass.
    (
        'CREATE POLICY "Service role can manage connections"\n'
        "    ON public.instagram_connections FOR ALL\n"
        "    TO service_role\n"
        "    USING (true)\n"
        "    WITH CHECK (true);",
        False,
    ),
    # Intentional public read with an explicit TO clause (0006 shape) — passes.
    (
        "create policy share_links_public_read on public.share_links\n"
        "  for select to anon, authenticated\n"
        "  using (true);",
        False,
    ),
    # Ordinary owner policy without TO — passes (not USING (true)).
    (
        'CREATE POLICY "Users can view own connections"\n'
        "    ON public.instagram_connections FOR SELECT\n"
        "    USING (user_id = auth.uid());",
        False,
    ),
)


def self_test() -> int:
    failures = 0
    for index, (sql, expect_offender) in enumerate(SELF_TEST_FIXTURES, start=1):
        found = find_open_true_policies(sql)
        if bool(found) != expect_offender:
            failures += 1
            print(
                f"self-test fixture {index} FAILED: "
                f"expected_offender={expect_offender} found={found}"
            )
    if failures:
        print(f"self-test FAILED: {failures}/{len(SELF_TEST_FIXTURES)} fixtures wrong")
        return 1
    print(
        f"self-test OK: {len(SELF_TEST_FIXTURES)} fixtures "
        "(bad PUBLIC policy flagged, scoped/owner policies pass)"
    )
    return 0


def main() -> int:
    files = sorted(MIGRATIONS.glob("*.sql"))
    versions: list[str] = []
    by_version: dict[str, Path] = {}
    for path in files:
        match = re.match(r"^(\d{4})_[a-z0-9_]+\.sql$", path.name)
        if not match:
            raise SystemExit(f"invalid migration filename: {path.name}")
        version = match.group(1)
        if version in by_version:
            raise SystemExit(f"duplicate migration version: {version}")
        versions.append(version)
        by_version[version] = path
    if versions != sorted(versions):
        raise SystemExit("migration filenames are not ordered")

    for version, needles in REQUIRED.items():
        path = by_version.get(version)
        if path is None:
            raise SystemExit(f"required migration {version} is missing")
        sql = path.read_text(encoding="utf-8").lower()
        for needle in needles:
            if needle not in sql:
                raise SystemExit(f"{path.name} missing release contract: {needle}")
        if "security definer" in sql and "set search_path" not in sql:
            raise SystemExit(f"{path.name} has SECURITY DEFINER without fixed search_path")

    for version, path in by_version.items():
        if version <= OPEN_POLICY_GUARD_AFTER:
            continue
        offenders = find_open_true_policies(path.read_text(encoding="utf-8"))
        for statement in offenders:
            raise SystemExit(
                f"{path.name} has CREATE POLICY with USING (true) and no TO clause "
                f"(applies to PUBLIC): {statement}"
            )

    print(f"migration contract OK: {len(files)} files, latest={versions[-1]}")
    return 0


if __name__ == "__main__":
    if "--self-test" in sys.argv[1:]:
        raise SystemExit(self_test())
    raise SystemExit(main())
