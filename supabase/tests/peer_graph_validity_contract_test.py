#!/usr/bin/env python3
"""Static SQL contract test for same-tier peer validity evidence (ALM-I-024).

No live database is contacted, nothing is deployed, and no customer data is
touched. This test reads the migration file under supabase/migrations/ and
asserts the software contract statically:

  - the W015 migration file exists with the reserved version 20260807160000
    and orders after the current and anticipated W014 additive migrations
    without rewriting old files;
  - the migration is additive to `peer_graph` only: it adds provenance and
    relationship evidence columns, fails closed on defaults ('' /
    'unverified' / 'unknown' / '[]'), enforces allowlist CHECK constraints,
    and adds no table, column alteration, drop, policy change, or new grant;
  - RLS compatibility: peer_graph RLS remains enabled, no browser-visible
    policy is created, no FOR ALL USING (true) policy is introduced without
    service_role, and no SECURITY DEFINER function is added without a fixed
    search_path;
  - backward compatibility: every existing peer_graph column from migration
    0020 (handle, niche, followers, platform, avg_likes, avg_comments,
    top_format, last_scraped, benchmarks_id) is untouched by this migration.

Fixtures verify the software contract only; they do not prove migration
success on production, live handle existence, metric freshness, relationship
truth, report calibration, creator efficacy, or business impact.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "supabase" / "migrations"
EXPECTED_FILE = "20260807160000_peer_validity_evidence.sql"
# Existing peer_graph columns (migration 0020) that must remain untouched.
EXISTING_COLUMNS = (
    "handle",
    "niche",
    "followers",
    "platform",
    "avg_likes",
    "avg_comments",
    "top_format",
    "last_scraped",
    "benchmarks_id",
)
# New evidence columns with their fail-closed defaults.
NEW_COLUMNS = {
    "source_url": "default ''",
    "source_observed_at": None,  # nullable — NULL renders Data needed
    "verification_status": "default 'unverified'",
    "relationship_status": "default 'unknown'",
    "relationship_evidence": "default '[]'",
}

_passed: list[str] = []
_failed: list[tuple[str, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    if ok:
        _passed.append(name)
        print(f"  PASS  {name}")
    else:
        _failed.append((name, detail))
        print(f"  FAIL  {name}  -- {detail}")


def require(cond: bool, message: str) -> None:
    if not cond:
        raise SystemExit(f"harness precondition failed: {message}")


def lower_matches(sql: str, pattern: str) -> bool:
    return re.search(pattern, sql, flags=re.IGNORECASE | re.DOTALL) is not None


def count_matches(sql: str, pattern: str) -> int:
    return len(re.findall(pattern, sql, flags=re.IGNORECASE | re.DOTALL))


def main() -> int:
    files = sorted(p for p in MIGRATIONS.glob("*.sql"))
    require(len(files) > 0, f"no migrations under {MIGRATIONS}")

    version_re = re.compile(r"^(\d{4}|\d{14})_[a-z0-9_]+\.sql$")
    versions: list[str] = []
    for path in files:
        m = version_re.match(path.name)
        if m is None:
            raise SystemExit(f"invalid migration filename: {path.name}")
        versions.append(m.group(1))
    require(versions == sorted(versions), "migration filenames are not ordered")

    candidates = [p for p in files if p.name == EXPECTED_FILE]
    require(len(candidates) == 1, f"expected exactly one {EXPECTED_FILE}")
    migration = candidates[0]

    # -----------------------------------------------------------------------
    # 1. Ordering: W015 (20260807160000) must order after the current latest
    #    (20260807140000) and after the anticipated W014 additive migration
    #    (20260807150000). Old files are never rewritten.
    # -----------------------------------------------------------------------
    check(
        "1.1 W015 migration file is present",
        migration.exists(),
        str(migration),
    )
    check(
        "1.2 W015 version orders after current latest (20260807140000)",
        migration.name > "20260807140000_",
        f"got {migration.name}",
    )
    check(
        "1.3 W015 version orders after anticipated W014 (20260807150000)",
        migration.name > "20260807150000_",
        "gate must compose W015 after W014's additive migration",
    )

    sql = migration.read_text(encoding="utf-8")
    lower = sql.lower()

    # -----------------------------------------------------------------------
    # 2. Additive columns with fail-closed defaults.
    # -----------------------------------------------------------------------
    check(
        "2.1 migration alters only peer_graph",
        lower_matches(sql, r"alter\s+table\s+public\.peer_graph") and not lower_matches(sql, r"create\s+table"),
    )
    for column, default in NEW_COLUMNS.items():
        check(
            f"2.2 additive column present: {column}",
            lower_matches(sql, rf"add\s+column\s+if\s+not\s+exists\s+{column}\b"),
        )
        if default is not None:
            check(
                f"2.3 fail-closed default on {column}: {default}",
                lower_matches(sql, rf"add\s+column\s+if\s+not\s+exists\s+{column}\b[^;]*{re.escape(default)}"),
                f"expected default {default!r}",
            )
        else:
            check(
                f"2.3 nullable observation column: {column}",
                lower_matches(sql, rf"add\s+column\s+if\s+not\s+exists\s+{column}\s+timestamptz\b"),
            )
    check(
        "2.4 no column type alteration",
        not lower_matches(sql, r"alter\s+column"),
    )
    check(
        "2.5 no column drop",
        not lower_matches(sql, r"drop\s+column"),
    )

    # -----------------------------------------------------------------------
    # 3. Allowlist CHECK constraints (fail-closed vocabulary).
    # -----------------------------------------------------------------------
    check(
        "3.1 verification_status CHECK allowlist",
        lower_matches(
            sql,
            r"verification_status\s+in\s*\(\s*'unverified'\s*,\s*'verified'\s*,\s*'failed'\s*\)",
        ),
    )
    check(
        "3.2 relationship_status CHECK allowlist",
        lower_matches(
            sql,
            r"relationship_status\s+in\s*\(\s*'unknown'\s*,\s*'collaborator'\s*,\s*'competitor'\s*\)",
        ),
    )
    check(
        "3.3 constraints guarded for idempotency",
        lower_matches(sql, r"if\s+not\s+exists\s*\(?\s*select\s+1\s+from\s+pg_constraint"),
    )

    # -----------------------------------------------------------------------
    # 4. RLS / security compatibility: nothing is weakened.
    # -----------------------------------------------------------------------
    check(
        "4.1 RLS is not disabled",
        not lower_matches(sql, r"disable\s+row\s+level\s+security"),
    )
    check(
        "4.2 no new RLS policy",
        not lower_matches(sql, r"create\s+policy"),
    )
    check(
        "4.3 no unscoped FOR ALL USING (true) policy",
        not (
            lower_matches(sql, r"\bfor\s+all\b")
            and lower_matches(sql, r"using\s*\(\s*true\s*\)")
        ),
    )
    check(
        "4.4 no browser-role grant",
        not lower_matches(sql, r"grant\b.*\b(anon|authenticated)\b"),
    )
    check(
        "4.5 no SECURITY DEFINER without fixed search_path",
        not (
            lower_matches(sql, r"security\s+definer")
            and not lower_matches(sql, r"set\s+search_path\s*=\s*public")
        ),
    )
    check(
        "4.6 no new table",
        count_matches(sql, r"create\s+table") == 0,
    )

    # -----------------------------------------------------------------------
    # 5. Backward compatibility: existing columns untouched.
    # -----------------------------------------------------------------------
    for column in EXISTING_COLUMNS:
        check(
            f"5.1 existing column untouched: {column}",
            not lower_matches(sql, rf"alter\s+column\s+{column}\b")
            and not lower_matches(sql, rf"drop\s+column\s+{column}\b"),
        )

    # -----------------------------------------------------------------------
    # 6. No raw payload/source leakage into the migration.
    # -----------------------------------------------------------------------
    check(
        "6.1 no embedded customer/source payload literals",
        not lower_matches(sql, r"payload\s+jsonb")
        and not lower_matches(sql, r"insert\s+into\s+public\.peer_graph"),
    )

    print(f"\nPEER GRAPH VALIDITY CONTRACT: {len(_passed)} passed, {len(_failed)} failed")
    if _failed:
        print("FAILED CHECKS:")
        for name, detail in _failed:
            print(f"  - {name}: {detail}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
