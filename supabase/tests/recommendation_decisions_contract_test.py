#!/usr/bin/env python3
"""Static SQL contract test for the canonical decisions ledger (ALM-I-021).

No live database is contacted, nothing is deployed, and no customer data is
touched. This test reads the migration files under supabase/migrations/ and
asserts the software contract statically:

  - additive vocabulary: the new migration widens `decisions.decision` to
    accepted | rejected | modified | superseded by replacing ONLY the named
    CHECK constraint created by the kernel migration;
  - the original kernel migration is NOT edited (it still names the original
    three-value vocabulary and still does not name `modified` in its
    decisions CHECK);
  - `record_decision` remains SECURITY DEFINER with a fixed search_path and
    still validates recommendation -> intelligence_run -> subject linkage;
  - public/anon/authenticated execute stays revoked; service_role execute
    stays granted; the browser never gains table mutation in the additive
    migration and decisions RLS stays enabled with owner/admin policies;
  - the migration timestamp is unique and later than the W013 reserved
    timestamp 20260807140000.

Fixtures verify software contracts only; they do not prove live RLS
behavior, creator efficacy, retention, or business impact.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "supabase" / "migrations"
KERNEL = "20260723020611_alm_intelligence_kernel.sql"
EXPECTED_FILE = "20260807150000_decision_vocabulary_modified.sql"
W013_RESERVED = "20260807140000"

# ---------------------------------------------------------------------------
# Tiny check harness — deterministic, no dependencies beyond the stdlib.
# ---------------------------------------------------------------------------
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


def main() -> int:
    files = sorted(p for p in MIGRATIONS.glob("*.sql"))
    require(len(files) > 0, f"no migrations under {MIGRATIONS}")

    version_re = re.compile(r"^(\d{4}|\d{14})_[a-z0-9_]+\.[sS][qQ][lL]$")
    versions = []
    for path in files:
        m = version_re.match(path.name)
        if m is None:
            raise SystemExit(f"invalid migration filename: {path.name}")
        versions.append(m.group(1))
    require(versions == sorted(versions), "migration filenames are not ordered")
    require(len(versions) == len(set(versions)), "duplicate migration versions")

    candidates = [p for p in files if p.name == EXPECTED_FILE]
    require(len(candidates) == 1, f"expected exactly one {EXPECTED_FILE}")
    migration = candidates[0]

    kernel_candidates = [p for p in files if p.name == KERNEL]
    require(len(kernel_candidates) == 1, f"expected exactly one {KERNEL}")
    kernel_sql = kernel_candidates[0].read_text(encoding="utf-8")

    sql = migration.read_text(encoding="utf-8")

    # -----------------------------------------------------------------------
    # 1. Additive vocabulary — accepted/rejected/modified/superseded.
    # -----------------------------------------------------------------------
    check(
        "1.1 additive migration exists with an ordered filename",
        version_re.match(migration.name) is not None,
        migration.name,
    )
    check(
        "1.2 migration timestamp is later than the W013 reserved 20260807140000",
        migration.name[:14] > W013_RESERVED,
        migration.name,
    )
    check(
        "1.3 drops the existing decisions_decision_check constraint",
        lower_matches(
            sql,
            r"alter\s+table\s+public\.decisions\s+drop\s+constraint\s+if\s+exists\s+decisions_decision_check",
        ),
    )
    check(
        "1.4 adds decisions_decision_check naming accepted/rejected/modified/superseded",
        lower_matches(
            sql,
            r"check\s*\(\s*decision\s+in\s*\(\s*'accepted'\s*,\s*'rejected'\s*,\s*'modified'\s*,\s*'superseded'\s*\)\s*\)",
        ),
    )
    check(
        "1.5 additive migration does not rewrite unrelated tables (no create table)",
        not lower_matches(sql, r"create\s+table"),
    )
    check(
        "1.6 additive migration does not grant browser table mutation on decisions",
        not lower_matches(
            sql,
            r"grant\s+(insert|update|delete)\s+on\s+public\.decisions\s+to\s+(authenticated|anon)",
        ),
    )

    # -----------------------------------------------------------------------
    # 2. Kernel migration is NOT edited — the original vocabulary remains.
    # -----------------------------------------------------------------------
    check(
        "2.1 kernel still names the original three-value decisions CHECK",
        lower_matches(
            kernel_sql,
            r"check\s*\(\s*decision\s+in\s*\(\s*'accepted'\s*,\s*'rejected'\s*,\s*'superseded'\s*\)\s*\)",
        ),
    )
    check(
        "2.2 kernel decisions CHECK does not name modified (no silent rewrite)",
        not lower_matches(
            kernel_sql,
            r"check\s*\(\s*decision\s+in\s*\([^)]*'modified'",
        ),
    )
    check(
        "2.3 kernel still enables RLS on decisions",
        lower_matches(
            kernel_sql,
            r"alter\s+table\s+public\.decisions\s+enable\s+row\s+level\s+security",
        ),
    )
    check(
        "2.4 kernel decisions read policy is own-row scoped",
        lower_matches(
            kernel_sql,
            r"create\s+policy\s+decisions_select_own\s+on\s+public\.decisions"
            r"\s+for\s+select\s+to\s+authenticated"
            r"\s+using\s*\(\s*auth\.uid\s*\(\s*\)\s*=\s*user_id\s*\)",
        ),
    )
    check(
        "2.5 kernel decisions admin policy is is_admin() gated",
        lower_matches(
            kernel_sql,
            r"create\s+policy\s+decisions_admin_all\s+on\s+public\.decisions"
            r"\s+for\s+all\s+to\s+authenticated"
            r"\s+using\s*\(\s*public\.is_admin\s*\(\s*\)\s*\)",
        ),
    )

    # -----------------------------------------------------------------------
    # 3. record_decision RPC — linkage, SECURITY DEFINER, fixed search_path.
    # -----------------------------------------------------------------------
    check(
        "3.1 additive migration reasserts record_decision",
        lower_matches(
            sql,
            r"create\s+or\s+replace\s+function\s+public\.record_decision\s*\(",
        ),
    )
    check(
        "3.2 record_decision is SECURITY DEFINER",
        lower_matches(sql, r"security\s+definer"),
    )
    check(
        "3.3 record_decision fixes search_path = public",
        lower_matches(sql, r"set\s+search_path\s*=\s*public"),
    )
    check(
        "3.4 record_decision validates recommendation -> run -> subject linkage",
        lower_matches(
            sql,
            r"join\s+public\.intelligence_runs\s+ir\s+on\s+ir\.id\s*=\s*r\.intelligence_run_id"
            r"\s+where\s+r\.id\s*=\s*p_target_id\s+and\s+ir\.subject_id\s*=\s*p_subject_id",
        ),
    )
    check(
        "3.5 record_decision raises on cross-subject targets",
        lower_matches(sql, r"does\s+not\s+belong\s+to\s+subject"),
    )
    check(
        "3.6 record_decision inserts into public.decisions only",
        lower_matches(
            sql,
            r"insert\s+into\s+public\.decisions\s*\("
            r"\s*subject_id\s*,\s*user_id\s*,\s*target_type\s*,\s*target_id\s*,\s*decision\s*,\s*note\s*\)",
        ),
    )

    # -----------------------------------------------------------------------
    # 4. Grants — anonymous/browser fail closed; service_role is the writer.
    # -----------------------------------------------------------------------
    check(
        "4.1 record_decision revoked from public/anon/authenticated",
        lower_matches(
            sql,
            r"revoke\s+all\s+on\s+function\s+public\.record_decision[^;]*"
            r"from\s+public\s*,\s*anon\s*,\s*authenticated",
        ),
    )
    check(
        "4.2 record_decision granted to service_role",
        lower_matches(
            sql,
            r"grant\s+execute\s+on\s+function\s+public\.record_decision[^;]*to\s+service_role",
        ),
    )
    check(
        "4.3 record_decision not granted to authenticated in the additive migration",
        not lower_matches(
            sql,
            r"grant\s+execute\s+on\s+function\s+public\.record_decision[^;]*to\s+authenticated",
        ),
    )
    check(
        "4.4 kernel still revokes decisions from anon",
        lower_matches(kernel_sql, r"revoke\s+all\s+on\s+public\.decisions\s+from\s+anon"),
    )

    # -----------------------------------------------------------------------
    # 5. Cross-file ordering contract.
    # -----------------------------------------------------------------------
    later_sql = "\n".join(
        p.read_text(encoding="utf-8").lower()
        for p in files[files.index(migration) + 1 :]
    )
    check(
        "5.1 additive vocabulary is not re-dropped by a later migration",
        not lower_matches(
            later_sql,
            r"alter\s+table\s+public\.decisions\s+drop\s+constraint",
        ),
    )
    check(
        "5.2 later migrations do not recreate the decisions table",
        not lower_matches(
            later_sql,
            r"create\s+table\s+(if\s+not\s+exists\s+)?public\.decisions",
        ),
    )

    # -----------------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------------
    print()
    if _failed:
        print(f"RECOMMENDATION DECISIONS CONTRACT FAILED: {len(_failed)} failure(s)")
        for name, detail in _failed:
            print(f"  - {name}: {detail}")
        return 1

    print(
        f"RECOMMENDATION DECISIONS CONTRACT PASSED ({len(_passed)} assertions)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
