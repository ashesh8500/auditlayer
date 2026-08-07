#!/usr/bin/env python3
"""Static SQL contract test for report → intelligence provenance (ALM-I-025).

No live database is contacted, nothing is deployed, and no customer data is
touched. This test reads the migration file under supabase/migrations/ and
asserts the software contract statically:

  - the migration is present and the additive migration set remains ordered
    (later additive waves may append newer migrations);
  - `audit_report_versions` gains one optional nullable FK reference
    (`intelligence_run_id`) to `intelligence_runs` and a partial unique index
    so a run is linked at most once (duplicate link fails closed);
  - `finalize_initial_report` and `finalize_refinement_report` accept an
    optional `p_intelligence_run_id` (default null → legacy callers unchanged);
  - when a run id is provided the RPC fails closed unless the run exists, is
    `completed`, and belongs to the same subject as the audit's batch
    (batch_audits → audit_batches.subject_id = intelligence_runs.subject_id);
  - version allocation stays idempotent and immutable (version 1 for initial,
    max+1 for refinements, same-path retries preserved);
  - both RPCs remain SECURITY DEFINER with a fixed search_path and are
    service_role-only (public/anon/authenticated revoked, no browser grants);
  - the migration is additive: no new table, policy, or trigger.

Fixtures verify software contracts only; they do not prove migration success
on production, live FK behavior, RLS under real JWTs, or customer value.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "supabase" / "migrations"
EXPECTED_FILE = "20260807170000_report_intelligence_provenance.sql"

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
    check(
        "0.1 migration is present and migrations remain ordered",
        migration in files and versions == sorted(versions),
        f"expected ordered migration set containing {migration.name}",
    )
    check(
        "0.2 migration sorts after the W014/W015 additive migrations",
        versions[-1] == "20260807170000",
        versions[-1],
    )

    sql = migration.read_text(encoding="utf-8")
    lower = sql.lower()

    # -----------------------------------------------------------------------
    # 1. Optional nullable FK column + partial unique index.
    # -----------------------------------------------------------------------
    check(
        "1.1 intelligence_run_id column added to audit_report_versions",
        lower_matches(sql, r"add\s+column\s+if\s+not\s+exists\s+intelligence_run_id\s+uuid"),
    )
    check(
        "1.2 reference targets intelligence_runs(id)",
        lower_matches(
            sql,
            r"references\s+public\.intelligence_runs\s*\(\s*id\s*\)",
        ),
    )
    check(
        "1.3 reference is nullable (legacy rows keep NULL provenance)",
        not lower_matches(
            sql,
            r"add\s+column\s+if\s+not\s+exists\s+intelligence_run_id\s+uuid\s+not\s+null",
        ),
    )
    check(
        "1.4 partial unique index allows at most one version per run",
        lower_matches(
            sql,
            r"create\s+unique\s+index\s+if\s+not\s+exists\s+audit_report_versions_intelligence_run_uidx"
            r"[\s\S]{0,200}?where\s+intelligence_run_id\s+is\s+not\s+null",
        ),
    )

    # -----------------------------------------------------------------------
    # 2. Both finalization RPCs accept the optional provenance reference.
    # -----------------------------------------------------------------------
    check(
        "2.1 finalize_initial_report extended with p_intelligence_run_id",
        lower_matches(
            sql,
            r"create\s+function\s+public\.finalize_initial_report\s*\([\s\S]{0,700}?"
            r"p_intelligence_run_id\s+uuid\s+default\s+null",
        ),
    )
    check(
        "2.2 finalize_refinement_report extended with p_intelligence_run_id",
        lower_matches(
            sql,
            r"create\s+function\s+public\.finalize_refinement_report\s*\([\s\S]{0,900}?"
            r"p_intelligence_run_id\s+uuid\s+default\s+null",
        ),
    )
    check(
        "2.3 optional reference defaults to null (legacy callers unchanged)",
        count_matches(sql, r"p_intelligence_run_id\s+uuid\s+default\s+null") == 2,
        str(count_matches(sql, r"p_intelligence_run_id\s+uuid\s+default\s+null")),
    )

    # -----------------------------------------------------------------------
    # 3. Fail-closed validation: same subject + completed status.
    # -----------------------------------------------------------------------
    check(
        "3.1 provenance gate joins the audit's batch to the run subject",
        lower_matches(
            sql,
            r"from\s+public\.intelligence_runs\s+ir\s*"
            r"join\s+public\.batch_audits\s+ba\s+on\s+ba\.audit_id\s*=\s*p_audit_id\s*"
            r"join\s+public\.audit_batches\s+ab\s+on\s+ab\.id\s*=\s*ba\.batch_id",
        ),
    )
    check(
        "3.2 run must be completed",
        lower_matches(sql, r"ir\.status\s*=\s*'completed'"),
    )
    check(
        "3.3 run subject must equal the audit batch subject",
        lower_matches(sql, r"ir\.subject_id\s*=\s*ab\.subject_id"),
    )
    check(
        "3.4 mismatched/nonexistent/non-completed provenance raises",
        lower_matches(sql, r"raise\s+exception\s+'intelligence_run_provenance_invalid'"),
    )
    check(
        "3.5 gate runs before any version write",
        lower.find("intelligence_run_provenance_invalid")
        < lower.find("insert into public.audit_report_versions"),
    )

    # -----------------------------------------------------------------------
    # 4. Immutable version semantics preserved.
    # -----------------------------------------------------------------------
    check(
        "4.1 initial version stays exactly version 1",
        lower_matches(
            sql,
            r"insert\s+into\s+public\.audit_report_versions[\s\S]{0,400}?values\s*\(\s*p_audit_id\s*,\s*1\s*,",
        ),
    )
    check(
        "4.2 refinement version allocation stays max+1",
        lower_matches(sql, r"coalesce\s*\(\s*max\s*\(\s*version\s*\)\s*,\s*0\s*\)\s*\+\s*1"),
    )
    check(
        "4.3 idempotent same-path retry preserved (initial)",
        lower_matches(sql, r"initial_report_already_finalized"),
    )

    # -----------------------------------------------------------------------
    # 5. RPC security posture unchanged.
    # -----------------------------------------------------------------------
    check(
        "5.1 both RPCs are SECURITY DEFINER",
        count_matches(sql, r"security\s+definer") == 2,
        str(count_matches(sql, r"security\s+definer")),
    )
    check(
        "5.2 both RPCs fix search_path",
        count_matches(sql, r"set\s+search_path\s*=\s*''") == 2,
        str(count_matches(sql, r"set\s+search_path\s*=\s*''")),
    )
    check(
        "5.3 public/anon/authenticated revoked from both RPCs",
        count_matches(
            sql,
            r"revoke\s+all\s+on\s+function\s+public\.finalize_(initial|refinement)_report"
            r"[^;]*from\s+public\s*,\s*anon\s*,\s*authenticated",
        )
        == 2,
        str(
            count_matches(
                sql,
                r"revoke\s+all\s+on\s+function\s+public\.finalize_(initial|refinement)_report"
                r"[^;]*from\s+public\s*,\s*anon\s*,\s*authenticated",
            )
        ),
    )
    check(
        "5.4 service_role-only execute grants",
        count_matches(
            sql,
            r"grant\s+execute\s+on\s+function\s+public\.finalize_(initial|refinement)_report"
            r"[^;]*to\s+service_role",
        )
        == 2
        and not lower_matches(
            sql,
            r"grant\s+execute\s+on\s+function\s+public\.finalize_(initial|refinement)_report"
            r"[^;]*to\s+(anon|authenticated)",
        ),
    )
    check(
        "5.5 no browser mutation grant added",
        not lower_matches(
            sql,
            r"grant\s+(insert|update|delete)\s+on\s+public\.(audits|audit_report_versions)"
            r"\s+to\s+(anon|authenticated)",
        ),
    )

    # -----------------------------------------------------------------------
    # 6. Additive-only migration.
    # -----------------------------------------------------------------------
    check(
        "6.1 no CREATE TABLE in this migration",
        not lower_matches(sql, r"create\s+table"),
    )
    check(
        "6.2 no CREATE POLICY in this migration",
        not lower_matches(sql, r"create\s+policy"),
    )
    check(
        "6.3 no CREATE TRIGGER in this migration",
        not lower_matches(sql, r"create\s+trigger"),
    )
    check(
        "6.4 no destructive drop of columns/tables/constraints",
        not lower_matches(sql, r"drop\s+(column|table|constraint)"),
    )

    # -----------------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------------
    print()
    if _failed:
        print(f"REPORT INTELLIGENCE PROVENANCE CONTRACT FAILED: {len(_failed)} failure(s)")
        for name, detail in _failed:
            print(f"  - {name}: {detail}")
        return 1

    print(f"REPORT INTELLIGENCE PROVENANCE CONTRACT PASSED ({len(_passed)} assertions)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
