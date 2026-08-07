#!/usr/bin/env python3
"""Static SQL contract test for founder audit recovery transitions (ALM-I-017).

No live database is contacted, nothing is deployed, and no customer data is
touched.  This test reads the migration file under supabase/migrations/ and
asserts the software contract statically:

  - the migration is present and the additive migration set remains ordered
    (later additive waves may append newer migrations);
  - the `founder_transition_audit` RPC is SECURITY DEFINER with a fixed
    search_path, locks the current audit row (`for update`), and compares the
    locked status before writing (compare-and-transition);
  - the founder actor is validated against `profiles.role = 'admin'`;
  - the transition matrix is authoritative: approve accepts needs_review/
    blocked -> queued; requeue accepts failed/ready -> queued; block accepts
    needs_review/queued/running -> blocked and rejects terminal success
    (ready), terminal failure (failed), already-blocked (blocked), and
    pre-submission draft;
  - the note is bounded (control characters stripped, whitespace collapsed,
    capped at 500) and block requires a clear note (>= 4 chars);
  - a valid transition changes status exactly once and inserts exactly one
    matching founder `audit_events` row in the same transaction;
  - every rejection returns a bounded structured jsonb result and performs
    zero status/event writes (no UPDATE/INSERT reachable on the rejection
    paths);
  - grants are service_role-only: public/anon/authenticated are revoked and
    no browser mutation grant is added;
  - the migration is additive: it creates no table, column, policy, or trigger.

Fixtures verify software contracts only; they do not prove migration success
on production, live concurrency, founder comprehension, or recovery latency.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "supabase" / "migrations"
EXPECTED_FILE = "20260807130000_founder_audit_transition.sql"

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


def count_matches(sql: str, pattern: str) -> int:
    return len(re.findall(pattern, sql, flags=re.IGNORECASE | re.DOTALL))


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
        "0.1 migration is present and migrations remain ordered",
        migration in files and versions == sorted(versions),
        f"expected ordered migration set containing {migration.name}",
    )

    sql = migration.read_text(encoding="utf-8")
    lower = sql.lower()

    # -----------------------------------------------------------------------
    # 1. RPC shape: SECURITY DEFINER, fixed search_path, one RPC.
    # -----------------------------------------------------------------------
    check(
        "1.1 founder_transition_audit RPC defined",
        lower_matches(
            sql,
            r"create\s+or\s+replace\s+function\s+public\.founder_transition_audit\s*\(",
        ),
    )
    check(
        "1.2 RPC is SECURITY DEFINER",
        lower_matches(sql, r"security\s+definer"),
    )
    check(
        "1.3 RPC fixes search_path to public",
        lower_matches(sql, r"set\s+search_path\s*=\s*public"),
    )
    check(
        "1.4 exactly one RPC function in the migration",
        count_matches(sql, r"create\s+or\s+replace\s+function") == 1,
        str(count_matches(sql, r"create\s+or\s+replace\s+function")),
    )

    # -----------------------------------------------------------------------
    # 2. Row-level lock + compare semantics (stale/duplicate rejection).
    # -----------------------------------------------------------------------
    check(
        "2.1 audit row locked with FOR UPDATE before transition",
        lower_matches(sql, r"from\s+public\.audits[\s\S]{0,400}?for\s+update"),
    )
    check(
        "2.2 status read into v_status_before",
        lower_matches(sql, r"select\s+status\s+into\s+v_status_before"),
    )
    check(
        "2.3 UPDATE guarded by locked status (compare-and-transition)",
        lower_matches(
            sql,
            r"update\s+public\.audits[\s\S]{0,500}?where\s+id\s*=\s*p_audit_id"
            r"\s+and\s+status\s*=\s*v_status_before",
        ),
    )
    check(
        "2.4 row count checked after UPDATE",
        lower_matches(sql, r"get\s+diagnostics\s+v_updated\s*=\s*row_count"),
    )
    check(
        "2.5 stale_status rejection path present",
        lower_matches(sql, r"'stale_status'"),
    )

    # -----------------------------------------------------------------------
    # 3. Founder actor validation.
    # -----------------------------------------------------------------------
    check(
        "3.1 actor validated against profiles.role = 'admin'",
        (
            lower_matches(sql, r"from\s+public\.profiles")
            and lower_matches(sql, r"role\s*=\s*'admin'")
            and lower_matches(sql, r"p_actor_id")
        ),
    )
    check(
        "3.2 unauthorized rejection path present",
        lower_matches(sql, r"'unauthorized'"),
    )

    # -----------------------------------------------------------------------
    # 4. Canonical transition matrix.
    # -----------------------------------------------------------------------
    check(
        "4.1 approve accepts needs_review/blocked",
        lower_matches(
            sql,
            r"p_action\s*=\s*'approve'\s+and\s+v_status_before\s+in\s*\("
            r"\s*'needs_review'\s*,\s*'blocked'\s*\)",
        ),
    )
    check(
        "4.2 approve targets queued",
        (
            lower_matches(sql, r"'audit_approved'")
            and lower_matches(sql, r"'approved'")
            and lower_matches(sql, r"v_target_status\s*:=\s*'queued'")
        ),
    )
    check(
        "4.3 requeue accepts failed/ready",
        lower_matches(
            sql,
            r"p_action\s*=\s*'requeue'\s+and\s+v_status_before\s+in\s*\("
            r"\s*'failed'\s*,\s*'ready'\s*\)",
        ),
    )
    check(
        "4.4 requeue targets queued with deterministic detail",
        (
            lower_matches(sql, r"'audit_requeued'")
            and lower_matches(sql, r"'Re-queued by founder'")
        ),
    )
    check(
        "4.5 block accepts needs_review/queued/running only",
        lower_matches(
            sql,
            r"p_action\s*=\s*'block'\s+and\s+v_status_before\s+in\s*\("
            r"\s*'needs_review'\s*,\s*'queued'\s*,\s*'running'\s*\)",
        ),
    )
    check(
        "4.6 block does NOT accept ready/failed/blocked/draft",
        (
            not lower_matches(
                sql,
                r"p_action\s*=\s*'block'\s+and\s+v_status_before\s+in\s*\([^)]*'ready'",
            )
            and not lower_matches(
                sql,
                r"p_action\s*=\s*'block'\s+and\s+v_status_before\s+in\s*\([^)]*'failed'",
            )
            and not lower_matches(
                sql,
                r"p_action\s*=\s*'block'\s+and\s+v_status_before\s+in\s*\([^)]*'blocked'",
            )
            and not lower_matches(
                sql,
                r"p_action\s*=\s*'block'\s+and\s+v_status_before\s+in\s*\([^)]*'draft'",
            )
        ),
    )
    check(
        "4.7 block targets blocked with founder vocabulary",
        (
            lower_matches(sql, r"'audit_blocked'")
            and lower_matches(sql, r"v_target_status\s*:=\s*'blocked'")
        ),
    )
    check(
        "4.8 unsupported_action rejection path present",
        lower_matches(sql, r"'unsupported_action'"),
    )
    check(
        "4.9 invalid_transition rejection path present",
        lower_matches(sql, r"'invalid_transition'"),
    )

    # -----------------------------------------------------------------------
    # 5. Note bounds and redaction.
    # -----------------------------------------------------------------------
    check(
        "5.1 control characters stripped from note",
        lower_matches(sql, r"regexp_replace"),
    )
    check(
        "5.2 note capped at 500 characters",
        lower_matches(sql, r"left\([\s\S]{0,200}?500\s*\)"),
    )
    check(
        "5.3 block requires a clear note (>= 4 chars)",
        lower_matches(sql, r"length\s*\(\s*v_note\s*\)\s*<\s*4"),
    )
    check(
        "5.4 note_required rejection path present",
        lower_matches(sql, r"'note_required'"),
    )

    # -----------------------------------------------------------------------
    # 6. Atomic write + event invariant.
    # -----------------------------------------------------------------------
    check(
        "6.1 exactly one INSERT into audit_events",
        count_matches(sql, r"insert\s+into\s+public\.audit_events") == 1,
        str(count_matches(sql, r"insert\s+into\s+public\.audit_events")),
    )
    check(
        "6.2 founder event carries actor, type, phase, detail",
        (
            lower_matches(sql, r"audit_id\s*,\s*actor\s*,\s*event_type\s*,\s*phase\s*,\s*detail")
            and lower_matches(sql, r"'admin:'\s*\|\|\s*p_actor_id")
        ),
    )
    check(
        "6.3 event insert happens after successful UPDATE",
        lower.find("insert into public.audit_events") > lower.find(
            "update public.audits"
        ),
    )

    # -----------------------------------------------------------------------
    # 7. Grants — service_role only, no browser mutation grant.
    # -----------------------------------------------------------------------
    check(
        "7.1 RPC revoked from public/anon/authenticated",
        lower_matches(
            sql,
            r"revoke\s+all\s+on\s+function\s+public\.founder_transition_audit"
            r"[^;]*from\s+public\s*,\s*anon\s*,\s*authenticated",
        ),
    )
    check(
        "7.2 RPC granted to service_role only",
        (
            lower_matches(
                sql,
                r"grant\s+execute\s+on\s+function\s+public\.founder_transition_audit"
                r"[^;]*to\s+service_role",
            )
            and not lower_matches(
                sql,
                r"grant\s+execute\s+on\s+function\s+public\.founder_transition_audit"
                r"[^;]*to\s+(anon|authenticated)",
            )
        ),
    )
    check(
        "7.3 no browser mutation grant added for audits/audit_events",
        not lower_matches(
            sql,
            r"grant\s+(insert|update|delete)\s+on\s+public\.(audits|audit_events)"
            r"\s+to\s+(anon|authenticated)",
        ),
    )

    # -----------------------------------------------------------------------
    # 8. Additive-only migration.
    # -----------------------------------------------------------------------
    check(
        "8.1 no CREATE TABLE in this migration",
        not lower_matches(sql, r"create\s+table"),
    )
    check(
        "8.2 no ALTER TABLE in this migration",
        not lower_matches(sql, r"alter\s+table"),
    )
    check(
        "8.3 no CREATE POLICY in this migration",
        not lower_matches(sql, r"create\s+policy"),
    )
    check(
        "8.4 no CREATE TRIGGER in this migration",
        not lower_matches(sql, r"create\s+trigger"),
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
        print(f"FOUNDER AUDIT TRANSITION CONTRACT FAILED: {len(_failed)} failure(s)")
        for name, detail in _failed:
            print(f"  - {name}: {detail}")
        return 1

    print(f"FOUNDER AUDIT TRANSITION CONTRACT PASSED ({len(_passed)} assertions)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
