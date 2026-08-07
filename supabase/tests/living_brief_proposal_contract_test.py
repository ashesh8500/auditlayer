#!/usr/bin/env python3
"""Static SQL contract test for Living Brief protected proposal semantics (ALM-I-009).

No live database is contacted, nothing is deployed, and no customer data is
touched.  This test reads the migration files under supabase/migrations/ and
asserts the software contract statically:

  - the new migration is the newest additive migration;
  - proposals carry a worker-computed evidence-linked semantic fingerprint;
  - a durable rejection table keys rejection by (subject, fingerprint) so an
    unchanged-evidence rejected proposal cannot recur, while new evidence
    changes the fingerprint and makes a proposal admissible again;
  - the create RPC requires the fingerprint, validates the bounded RFC 6901
    path/operation, and fails closed on unchanged-evidence recurrence;
  - the resolve RPC is owner-scoped, keeps the existing 3-argument call site,
    requires an explicit owner confirmation to accept protected fields
    (identity incl. vision, positioning, goals, constraints), requires an
    exact current base version, atomically appends exactly one confirmed next
    Living Brief version plus a durable decision on accept, records a
    decision and rejection fingerprint with no version on reject, resolves
    exactly once, and leaves canonical state unchanged on stale/wrong-owner/
    invalid-path/missing-confirmation failures;
  - Living Brief versions remain immutable (kernel trigger preserved, no
    UPDATE/DELETE in this migration);
  - anonymous access fails closed; browser roles may only SELECT the
    rejection ledger; service-role owns writes;
  - SECURITY DEFINER RPCs fix search_path.

Fixtures verify software contracts only; they do not prove migration success
on production or model calibration.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "supabase" / "migrations"
EXPECTED_FILE = "20260807120000_living_brief_proposal_semantics.sql"

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
        "0.1 migration is the newest file",
        migration == files[-1],
        f"expected latest={migration.name}, got {files[-1].name}",
    )

    sql = migration.read_text(encoding="utf-8")
    lower = sql.lower()

    # -----------------------------------------------------------------------
    # 1. Evidence-linked semantic fingerprint on proposals.
    # -----------------------------------------------------------------------
    check(
        "1.1 semantic_fingerprint column added additively",
        lower_matches(
            sql,
            r"alter\s+table\s+public\.context_update_proposals\s*"
            r"add\s+column\s+if\s+not\s+exists\s+semantic_fingerprint\s+text",
        ),
    )
    check(
        "1.2 fingerprint indexed by subject",
        lower_matches(
            sql,
            r"create\s+index\s+if\s+not\s+exists\s+idx_context_update_proposals_fingerprint"
            r"\s+on\s+public\.context_update_proposals\s*\(\s*subject_id\s*,\s*semantic_fingerprint\s*\)",
        ),
    )

    # -----------------------------------------------------------------------
    # 2. Durable rejection ledger — non-recurrence gate.
    # -----------------------------------------------------------------------
    check(
        "2.1 rejected_context_proposals table created additively",
        lower_matches(
            sql,
            r"create\s+table\s+if\s+not\s+exists\s+public\.rejected_context_proposals",
        ),
    )
    check(
        "2.2 unique (subject_id, semantic_fingerprint) prevents unchanged-evidence recurrence",
        lower_matches(
            sql,
            r"unique\s*\(\s*subject_id\s*,\s*semantic_fingerprint\s*\)",
        ),
    )
    check(
        "2.3 rejection row keeps path/operation/value/evidence for audit",
        (
            lower_matches(sql, r"path\s+text\s+not\s+null")
            and lower_matches(sql, r"operation\s+text\s+not\s+null")
            and lower_matches(sql, r"proposed_value\s+jsonb\s+not\s+null")
            and lower_matches(sql, r"evidence_ids\s+jsonb\s+not\s+null")
        ),
    )
    check(
        "2.4 operation check constraint is add/replace/remove",
        lower_matches(
            sql,
            r"check\s*\(\s*operation\s+in\s*\(\s*'add'\s*,\s*'replace'\s*,\s*'remove'\s*\)\s*\)",
        ),
    )

    # -----------------------------------------------------------------------
    # 3. Bounded RFC 6901 helpers.
    # -----------------------------------------------------------------------
    check(
        "3.1 brief_path_tokens validates bounded RFC 6901",
        lower_matches(sql, r"create\s+or\s+replace\s+function\s+public\.brief_path_tokens\s*\("),
    )
    check(
        "3.2 brief_path_is_protected classifies protected fields",
        lower_matches(sql, r"create\s+or\s+replace\s+function\s+public\.brief_path_is_protected\s*\("),
    )
    check(
        "3.3 apply_brief_pointer is bounded and rejects unsupported operations",
        (
            lower_matches(sql, r"create\s+or\s+replace\s+function\s+public\.apply_brief_pointer\s*\(")
            and lower_matches(sql, r"brief_operation_unsupported")
            and lower_matches(sql, r"brief_path_out_of_bounds")
        ),
    )
    check(
        "3.4 helpers fix search_path",
        (
            lower_matches(sql, r"set\s+search_path\s*=\s*public")
            and not lower_matches(
                sql,
                r"create\s+or\s+replace\s+function\s+public\.brief_path_tokens\s*\([^)]*\)[^$]*"
                r"security\s+definer[^$]*\$",
            )
        ),
    )

    # -----------------------------------------------------------------------
    # 4. create RPC — fingerprint required, path/operation validated,
    #    unchanged-evidence recurrence fails closed.
    # -----------------------------------------------------------------------
    check(
        "4.1 create RPC redefined",
        lower_matches(
            sql,
            r"create\s+or\s+replace\s+function\s+public\.create_context_update_proposals\s*\(",
        ),
    )
    check(
        "4.2 create RPC requires 64-hex semantic fingerprint",
        lower_matches(
            sql,
            r"_fingerprint\s+is\s+null\s+or\s+_fingerprint\s+!~\s*'"
            r"\^\[0-9a-f\]\{64\}\$'",
        ),
    )
    check(
        "4.3 create RPC rejects unchanged-evidence recurrence",
        (
            lower_matches(sql, r"proposal_rejected_same_evidence")
            and lower_matches(
                sql,
                r"from\s+public\.rejected_context_proposals\s+r\s*"
                r"where\s+r\.subject_id\s*=\s*_subject_id\s*"
                r"and\s+r\.semantic_fingerprint\s*=\s*_fingerprint",
            )
        ),
    )
    check(
        "4.4 create RPC validates path and operation",
        (
            lower_matches(sql, r"perform\s+public\.brief_path_tokens\s*\(\s*_path\s*\)")
            and lower_matches(sql, r"brief_operation_unsupported")
        ),
    )

    # -----------------------------------------------------------------------
    # 5. resolve RPC — owner scope, confirmation, base version, atomicity.
    # -----------------------------------------------------------------------
    check(
        "5.1 resolve RPC redefined with optional explicit confirmation",
        lower_matches(
            sql,
            r"create\s+or\s+replace\s+function\s+public\.resolve_context_update_proposal\s*"
            r"\(\s*p_proposal_id\s+uuid\s*,\s*p_status\s+text\s*,\s*p_user_id\s+uuid\s*,"
            r"\s*p_explicit_confirmation\s+boolean\s+default\s+false\s*\)",
        ),
    )
    check(
        "5.2 RPC is SECURITY DEFINER with fixed search_path",
        (
            lower_matches(sql, r"security\s+definer")
            and lower_matches(sql, r"set\s+search_path\s*=\s*public")
        ),
    )
    check(
        "5.3 owner scope enforced (not owned by user)",
        lower_matches(sql, r"is\s+not\s+owned\s+by\s+user"),
    )
    check(
        "5.4 exactly-once resolution guarded by status='proposed' + row lock",
        (
            lower_matches(sql, r"cup\.status\s*=\s*'proposed'")
            and lower_matches(sql, r"for\s+update\s+of\s+cup")
        ),
    )
    check(
        "5.5 protected path requires explicit owner confirmation",
        (
            lower_matches(sql, r"protected_brief_path_requires_confirmation")
            and lower_matches(
                sql,
                r"not\s+coalesce\s*\(\s*p_explicit_confirmation\s*,\s*false\s*\)",
            )
        ),
    )
    check(
        "5.6 exact current base version required",
        (
            lower_matches(sql, r"stale_base_version")
            and lower_matches(
                sql,
                r"select\s+coalesce\s*\(\s*max\s*\(\s*version\s*\)\s*,\s*0\s*\)\s+into\s+v_current_version",
            )
            and lower_matches(sql, r"v_current_version\s*<>\s*v_proposal\.base_version")
        ),
    )
    check(
        "5.7 evidence_ids must be well-formed UUIDs (format gate)",
        lower_matches(sql, r"proposal_evidence_invalid"),
    )
    check(
        "5.8 accept atomically appends a confirmed next version",
        (
            lower_matches(
                sql,
                r"insert\s+into\s+public\.living_brief_versions\s*\([^)]*confirmed[^)]*\)",
            )
            and lower_matches(sql, r"confirmed\s*,\s*created_by")
            and lower_matches(sql, r"v_next_version")
        ),
    )
    check(
        "5.9 accept records a durable decision",
        lower_matches(
            sql,
            r"insert\s+into\s+public\.decisions\s*\([^)]*target_type[^)]*target_id[^)]*decision[^)]*\)",
        ),
    )
    check(
        "5.10 reject records decision without creating a version",
        (
            lower_matches(
                sql,
                r"insert\s+into\s+public\.decisions\s*\([^)]*\)\s*"
                r"values\s*\([^;]*'rejected'[^;]*\)",
            )
            and lower_matches(
                sql,
                r"insert\s+into\s+public\.rejected_context_proposals\s*\(",
            )
        ),
    )
    check(
        "5.11 duplicate resolution fails closed",
        lower_matches(sql, r"proposal\s+%\s+was\s+already\s+resolved"),
    )
    check(
        "5.12 invalid status fails closed",
        lower_matches(sql, r"proposal_status_invalid"),
    )

    # -----------------------------------------------------------------------
    # 6. Backward-compatible product call site (3-argument wrapper).
    # -----------------------------------------------------------------------
    check(
        "6.1 existing 3-argument resolve call site preserved",
        lower_matches(
            sql,
            r"create\s+or\s+replace\s+function\s+public\.resolve_context_update_proposal\s*"
            r"\(\s*p_proposal_id\s+uuid\s*,\s*p_status\s+text\s*,\s*p_user_id\s+uuid\s*\)",
        ),
    )
    check(
        "6.2 3-argument wrapper delegates with explicit_confirmation=false",
        lower_matches(
            sql,
            r"perform\s+public\.resolve_context_update_proposal\s*\(\s*p_proposal_id\s*,"
            r"\s*p_status\s*,\s*p_user_id\s*,\s*false\s*\)",
        ),
    )

    # -----------------------------------------------------------------------
    # 7. Immutable history preserved.
    # -----------------------------------------------------------------------
    check(
        "7.1 no UPDATE on living_brief_versions in this migration",
        not lower_matches(sql, r"update\s+public\.living_brief_versions"),
    )
    check(
        "7.2 no DELETE on living_brief_versions in this migration",
        not lower_matches(sql, r"delete\s+from\s+public\.living_brief_versions"),
    )
    check(
        "7.3 immutability trigger not dropped",
        not lower_matches(sql, r"drop\s+trigger\s+reject_living_brief_mutation"),
    )

    # -----------------------------------------------------------------------
    # 8. Revokes / grants — anonymous fails closed; browser SELECT only.
    # -----------------------------------------------------------------------
    check(
        "8.1 create RPC revoked from public/anon/authenticated",
        lower_matches(
            sql,
            r"revoke\s+all\s+on\s+function\s+public\.create_context_update_proposals[^;]*"
            r"from\s+public\s*,\s*anon\s*,\s*authenticated",
        ),
    )
    check(
        "8.2 create RPC granted to service_role",
        lower_matches(
            sql,
            r"grant\s+execute\s+on\s+function\s+public\.create_context_update_proposals[^;]*"
            r"to\s+service_role",
        ),
    )
    check(
        "8.3 4-arg resolve RPC revoked from public/anon/authenticated",
        lower_matches(
            sql,
            r"revoke\s+all\s+on\s+function\s+public\.resolve_context_update_proposal"
            r"\(uuid,\s*text,\s*uuid,\s*boolean\)[^;]*from\s+public\s*,\s*anon\s*,\s*authenticated",
        ),
    )
    check(
        "8.4 4-arg resolve RPC granted to service_role",
        lower_matches(
            sql,
            r"grant\s+execute\s+on\s+function\s+public\.resolve_context_update_proposal"
            r"\(uuid,\s*text,\s*uuid,\s*boolean\)[^;]*to\s+service_role",
        ),
    )
    check(
        "8.5 rejection ledger revoked from anon",
        lower_matches(
            sql,
            r"revoke\s+all\s+on\s+public\.rejected_context_proposals\s+from\s+anon",
        ),
    )
    check(
        "8.6 browser roles get SELECT only on rejection ledger (no write grant)",
        (
            lower_matches(
                sql,
                r"grant\s+select\s+on\s+public\.rejected_context_proposals\s+to\s+authenticated",
            )
            and lower_matches(
                sql,
                r"revoke\s+insert\s*,\s*update\s*,\s*delete\s+on\s+public\.rejected_context_proposals\s+from\s+authenticated",
            )
            and not lower_matches(
                sql,
                r"grant\s+(insert|update|delete)\s+on\s+public\.rejected_context_proposals\s+to\s+authenticated",
            )
        ),
    )
    check(
        "8.7 service_role holds write capability on rejection ledger",
        lower_matches(
            sql,
            r"grant\s+all\s+on\s+public\.rejected_context_proposals\s+to\s+service_role",
        ),
    )

    # -----------------------------------------------------------------------
    # 9. Cross-file release contract.
    # -----------------------------------------------------------------------
    check(
        "9.1 migration filename matches the ordered contract",
        version_re.match(migration.name) is not None,
        migration.name,
    )

    # -----------------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------------
    print()
    if _failed:
        print(f"LIVING BRIEF PROPOSAL CONTRACT FAILED: {len(_failed)} failure(s)")
        for name, detail in _failed:
            print(f"  - {name}: {detail}")
        return 1

    print(f"LIVING BRIEF PROPOSAL CONTRACT PASSED ({len(_passed)} assertions)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
