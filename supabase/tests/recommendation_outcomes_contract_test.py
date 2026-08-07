#!/usr/bin/env python3
"""Static SQL contract test for the recommendation-outcome ledger (ALM-I-003).

No live database is contacted, nothing is deployed, and no customer data is
touched.  This test reads the migration files under supabase/migrations/ and
asserts the software contract statically:

  - linkage: outcome rows must reference a real recommendation AND a real
    subject (NOT NULL FKs), so unlinked observations cannot be stored as
    recommendation efficacy evidence;
  - decision state: accepted | rejected | modified is enforced by a check;
  - bounded, ordered observation window: window_start <= window_end;
  - observed outcome data and explicit confounding notes are required;
  - RLS: row level security enabled, read scoped to subject ownership, no
    overbroad FOR ALL ... USING (true) policy, admin-only write via policy;
  - the only write path is a SECURITY DEFINER RPC with fixed search_path,
    revoked from public/anon/authenticated and granted to service_role;
  - the RPC validates subject ownership linkage, recommendation->subject
    linkage (cross-subject rejection), decision state, and window ordering;
  - anonymous reads fail closed (revoked) and browser roles may only SELECT.

Fixtures verify software contracts only; they do not prove causal efficacy,
creator calibration, or migration success on production.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "supabase" / "migrations"
TABLE = "recommendation_outcomes"
RPC = "record_recommendation_outcome"
EXPECTED_FILE = "20260807000000_recommendation_outcome_ledger.sql"

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


# ---------------------------------------------------------------------------
# 0. Locate the migration and prove it is the newest additive migration.
# ---------------------------------------------------------------------------
def main() -> int:
    files = sorted(p for p in MIGRATIONS.glob("*.sql"))
    require(len(files) > 0, f"no migrations under {MIGRATIONS}")

    version_re = re.compile(r"^(\d{4}|\d{14})_[a-z0-9_]+\.sql$")
    versions = []
    for path in files:
        m = version_re.match(path.name)
        if m is None:
            raise SystemExit(f"invalid migration filename: {path.name}")
        versions.append(m.group(1))
    require(versions == sorted(versions), "migration filenames are not ordered")

    candidates = [p for p in files if p.name == EXPECTED_FILE]
    require(len(candidates) == 1, f"expected exactly one {EXPECTED_FILE}")
    migration = candidates[0]
    m = version_re.match(migration.name)
    require(m is not None, f"unparseable migration filename: {migration.name}")
    outcome_idx = files.index(migration)
    later_sql = "\n".join(
        p.read_text(encoding="utf-8").lower() for p in files[outcome_idx + 1 :]
    )
    check(
        "0.1 outcome ledger is not superseded or rewritten by a later migration",
        migration in files
        and not lower_matches(
            later_sql,
            r"drop\s+table\s+(if\s+exists\s+)?public\.recommendation_outcomes",
        )
        and not lower_matches(
            later_sql,
            r"create\s+table\s+(if\s+not\s+exists\s+)?public\.recommendation_outcomes",
        ),
        f"expected {migration.name} contract intact at head",
    )

    sql = migration.read_text(encoding="utf-8")

    # -----------------------------------------------------------------------
    # 1. Linkage — NOT NULL FKs to a real recommendation and a real subject.
    # -----------------------------------------------------------------------
    check(
        "1.1 table created additively",
        lower_matches(sql, r"create\s+table\s+if\s+not\s+exists\s+public\.recommendation_outcomes"),
    )
    check(
        "1.2 recommendation_id NOT NULL FK to recommendations",
        lower_matches(
            sql,
            r"recommendation_id\s+uuid\s+not\s+null\s+references\s+public\.recommendations\s*\(",
        ),
    )
    check(
        "1.3 subject_id NOT NULL FK to subjects",
        lower_matches(
            sql,
            r"subject_id\s+uuid\s+not\s+null\s+references\s+public\.subjects\s*\(",
        ),
    )
    # The RPC must reject a recommendation that does not belong to the subject.
    check(
        "1.4 cross-subject rejection is representable (RPC raises)",
        lower_matches(
            sql,
            r"does\s+not\s+belong\s+to\s+subject",
        ),
    )

    # -----------------------------------------------------------------------
    # 2. Decision state — accepted | rejected | modified.
    # -----------------------------------------------------------------------
    check(
        "2.1 decision_state check constraint names all three states",
        (
            lower_matches(sql, r"decision_state\s+text\s+not\s+null")
            and lower_matches(sql, r"accepted")
            and lower_matches(sql, r"rejected")
            and lower_matches(sql, r"modified")
        ),
    )

    # -----------------------------------------------------------------------
    # 3. Bounded, ordered observation window.
    # -----------------------------------------------------------------------
    check(
        "3.1 window_start NOT NULL",
        lower_matches(sql, r"window_start\s+timestamptz\s+not\s+null"),
    )
    check(
        "3.2 window_end NOT NULL",
        lower_matches(sql, r"window_end\s+timestamptz\s+not\s+null"),
    )
    check(
        "3.3 window ordering check window_end >= window_start",
        lower_matches(sql, r"window_end\s*>=\s*window_start"),
    )

    # -----------------------------------------------------------------------
    # 4. Observed outcome data and honest confounding notes.
    # -----------------------------------------------------------------------
    check(
        "4.1 observed outcome_data required (NOT NULL)",
        lower_matches(sql, r"outcome_data\s+jsonb\s+not\s+null"),
    )
    check(
        "4.2 explicit confounding_notes required (NOT NULL)",
        lower_matches(sql, r"confounding_notes\s+jsonb\s+not\s+null"),
    )
    check(
        "4.3 evidence_ids present for walkable outcome support",
        lower_matches(sql, r"evidence_ids\s+jsonb\s+not\s+null"),
    )

    # -----------------------------------------------------------------------
    # 5. RLS — enabled, read scoped to subject ownership, no overbroad policy.
    # -----------------------------------------------------------------------
    check(
        "5.1 row level security enabled on table",
        lower_matches(
            sql,
            r"alter\s+table\s+public\.recommendation_outcomes\s+enable\s+row\s+level\s+security",
        ),
    )
    check(
        "5.2 select-own policy scoped to owns_subject(subject_id)",
        lower_matches(
            sql,
            r"create\s+policy\s+recommendation_outcomes_select_own"
            r"\s+on\s+public\.recommendation_outcomes"
            r"\s+for\s+select\s+to\s+authenticated"
            r"\s+using\s*\(\s*public\.owns_subject\s*\(\s*subject_id\s*\)\s*\)",
        ),
    )
    check(
        "5.3 no overbroad FOR ALL ... USING (true) policy",
        not lower_matches(
            sql,
            r"create\s+policy[^;]*for\s+all[^;]*using\s*\(\s*true\s*\)",
        ),
    )
    check(
        "5.4 admin policy uses is_admin()",
        lower_matches(sql, r"public\.is_admin\s*\("),
    )

    # -----------------------------------------------------------------------
    # 6. Typed write RPC — SECURITY DEFINER, fixed search_path, service-role.
    # -----------------------------------------------------------------------
    check(
        "6.1 write RPC exists",
        lower_matches(sql, rf"create\s+or\s+replace\s+function\s+public\.{RPC}\s*\("),
    )
    check(
        "6.2 RPC is SECURITY DEFINER",
        lower_matches(sql, r"security\s+definer"),
    )
    check(
        "6.3 RPC fixes search_path (no search_path capture)",
        lower_matches(sql, r"set\s+search_path\s*=\s*public"),
    )
    check(
        "6.4 RPC validates subject ownership linkage",
        lower_matches(sql, r"not\s+owned\s+by\s+user"),
    )
    check(
        "6.5 RPC validates recommendation->subject linkage",
        lower_matches(
            sql,
            r"join\s+public\.intelligence_runs\s+ir\s+on\s+ir\.id\s*=\s*r\.intelligence_run_id",
        ),
    )
    check(
        "6.6 RPC validates window time ordering",
        lower_matches(sql, r"window_start\s*<=\s*window_end"),
    )
    check(
        "6.7 RPC validates decision_state membership",
        lower_matches(
            sql,
            r"p_decision_state\s+not\s+in\s*\(\s*'accepted'\s*,\s*'rejected'\s*,\s*'modified'\s*\)",
        ),
    )

    # -----------------------------------------------------------------------
    # 7. Revokes / grants — anonymous fails closed; browser SELECT only.
    # -----------------------------------------------------------------------
    check(
        "7.1 RPC revoked from public/anon/authenticated",
        lower_matches(
            sql,
            rf"revoke\s+all\s+on\s+function\s+public\.{RPC}[^;]*from\s+public\s*,\s*anon\s*,\s*authenticated",
        ),
    )
    check(
        "7.2 RPC granted to service_role",
        lower_matches(
            sql,
            rf"grant\s+execute\s+on\s+function\s+public\.{RPC}[^;]*to\s+service_role",
        ),
    )
    check(
        "7.3 table revoked from anon",
        lower_matches(
            sql,
            rf"revoke\s+all\s+on\s+public\.recommendation_outcomes\s+from\s+anon",
        ),
    )
    check(
        "7.4 browser roles get SELECT only (no INSERT/UPDATE/DELETE grant)",
        not lower_matches(
            sql,
            r"grant\s+(insert|update|delete)\s+on\s+public\.recommendation_outcomes\s+to\s+authenticated",
        ),
    )
    check(
        "7.5 service_role holds write capability",
        lower_matches(
            sql,
            r"grant\s+all\s+on\s+public\.recommendation_outcomes\s+to\s+service_role",
        ),
    )

    # -----------------------------------------------------------------------
    # 8. Cross-file release contract — the new migration must not break the
    #    ordered migration contract checked by scripts/check-migrations.py.
    # -----------------------------------------------------------------------
    check(
        "8.1 migration filename matches the ordered contract",
        version_re.match(migration.name) is not None,
        migration.name,
    )

    # -----------------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------------
    print()
    if _failed:
        print(f"RECOMMENDATION OUTCOME CONTRACT FAILED: {len(_failed)} failure(s)")
        for name, detail in _failed:
            print(f"  - {name}: {detail}")
        return 1

    print(f"RECOMMENDATION OUTCOME CONTRACT PASSED ({len(_passed)} assertions)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
