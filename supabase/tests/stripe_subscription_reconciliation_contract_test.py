#!/usr/bin/env python3
"""Static SQL contract test for Stripe subscription reconciliation (ALM-I-020).

No live database is contacted, nothing is deployed, and no customer data is
touched.  This test reads the migration file under supabase/migrations/ and
asserts the software contract statically:

  - the new migration is the newest additive migration;
  - the append-only `provider_event_receipts` table exists, keyed by provider
    event id, with typed bounded columns, a digest-length bound, plan/status/
    command/outcome allowlists, a unique (provider, provider_event_id)
    constraint, and a profile FK;
  - receipts are append-only: a guard trigger blocks UPDATE/DELETE and no
    application path mutates existing receipt rows;
  - the `reconcile_stripe_subscription` RPC is SECURITY DEFINER with a fixed
    search_path, re-validates every allowlist (event type, status, plan,
    identity, digest), records an event identity at most once, locks the
    matching profile row (`for update`), compares the deterministic
    (provider_created_epoch, provider_event_id) tuple, and fails closed on
    duplicate/stale/equal-time replay/equal-time conflict/missing profile/
    profile-customer mismatch;
  - founder/manual access precedence: a profile with subscription_status in
    ('manual_enterprise', 'complimentary') is never overwritten; the receipt
    is recorded applied=false with outcome_code='manual_precedence';
  - a valid event performs exactly one receipt INSERT and at most one profile
    UPDATE inside the same function body (single transaction, never a split
    write);
  - the receipt stores bounded typed facts and a digest only — no raw Stripe/
    customer payload param exists;
  - RLS is enabled on the table, browser roles are revoked, and execute is
    granted to service_role only;
  - the migration is additive: it creates exactly one new table and only
    alters that same new table.

Fixtures verify software contracts only; they do not prove migration success
on production, live Stripe delivery, database isolation, payment correctness,
or business impact.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "supabase" / "migrations"
EXPECTED_FILE = "20260807140000_stripe_subscription_reconciliation.sql"

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
    # 1. Receipt table: append-only, keyed by provider event id, bounded.
    # -----------------------------------------------------------------------
    check(
        "1.1 provider_event_receipts table created",
        lower_matches(
            sql,
            r"create\s+table\s+if\s+not\s+exists\s+public\.provider_event_receipts\s*\(",
        ),
    )
    for column in [
        "provider",
        "provider_event_id",
        "provider_created_epoch",
        "subscription_id",
        "customer_id",
        "profile_id",
        "command_type",
        "plan",
        "subscription_status",
        "current_period_end_epoch",
        "digest",
        "applied",
        "outcome_code",
        "created_at",
    ]:
        check(f"1.2 receipt column present: {column}", lower_matches(sql, rf"\b{column}\b"))
    check(
        "1.3 receipt keyed uniquely by (provider, provider_event_id)",
        lower_matches(
            sql,
            r"unique\s*\(\s*provider\s*,\s*provider_event_id\s*\)",
        ),
    )
    check(
        "1.4 receipt profile FK references profiles",
        lower_matches(
            sql,
            r"profile_id\s+uuid\s+not\s+null\s+references\s+public\.profiles\s*\(\s*id\s*\)",
        ),
    )
    check(
        "1.5 digest bounded to sha256 hex (64 chars)",
        lower_matches(sql, r"length\s*\(\s*digest\s*\)\s*=\s*64"),
    )
    check(
        "1.6 plan allowlist on receipt",
        lower_matches(
            sql,
            r"check\s*\(\s*plan\s+in\s*\(\s*'free'\s*,\s*'starter'\s*,\s*'pro'\s*,\s*'enterprise'\s*\)\s*\)",
        ),
    )
    check(
        "1.7 status allowlist on receipt",
        lower_matches(
            sql,
            r"check\s*\(\s*subscription_status\s+in\s*\(\s*'active'\s*,\s*'trialing'\s*,\s*'canceled'\s*\)\s*\)",
        ),
    )
    check(
        "1.8 command_type allowlist on receipt",
        lower_matches(
            sql,
            r"check\s*\(\s*command_type\s+in\s*\(\s*'plan_grant'\s*,\s*'plan_revoke'\s*\)\s*\)",
        ),
    )
    check(
        "1.9 outcome_code allowlist on receipt",
        lower_matches(
            sql,
            r"check\s*\(\s*outcome_code\s+in\s*\(\s*'applied'\s*,\s*'manual_precedence'\s*\)\s*\)",
        ),
    )
    check(
        "1.10 append-only guard trigger blocks UPDATE/DELETE",
        (
            lower_matches(sql, r"before\s+update\s+or\s+delete\s+on\s+public\.provider_event_receipts")
            and lower_matches(sql, r"raise\s+exception\s+'provider_event_receipts\s+is\s+append-only'")
        ),
    )

    # -----------------------------------------------------------------------
    # 2. RPC shape: SECURITY DEFINER, fixed search_path, bounded typed inputs.
    # -----------------------------------------------------------------------
    check(
        "2.1 reconcile_stripe_subscription RPC defined",
        lower_matches(
            sql,
            r"create\s+or\s+replace\s+function\s+public\.reconcile_stripe_subscription\s*\(",
        ),
    )
    check(
        "2.2 RPC is SECURITY DEFINER",
        lower_matches(sql, r"security\s+definer"),
    )
    check(
        "2.3 RPC fixes search_path to public",
        lower_matches(sql, r"set\s+search_path\s*=\s*public"),
    )
    check(
        "2.4 RPC takes typed bounded scalars only (no raw payload param)",
        (
            lower_matches(sql, r"p_event_id\s+text")
            and lower_matches(sql, r"p_digest\s+text")
            and not lower_matches(sql, r"p_payload\b")
            and not lower_matches(sql, r"\bpayload\s+jsonb\b")
        ),
    )
    check(
        "2.5 RPC rejects null inputs explicitly before allowlist checks",
        (
            lower_matches(sql, r"p_event_created\s+is\s+null\s+or\s+p_event_created\s*<=\s*0")
            and lower_matches(sql, r"p_status\s+is\s+null")
            and lower_matches(sql, r"p_plan\s+is\s+null")
        ),
    )
    check(
        "2.6 RPC re-validates the event type allowlist",
        lower_matches(
            sql,
            r"p_event_type\s+(is\s+null\s+or\s+)?not\s+in\s*\(\s*'checkout\.session\.completed'\s*,\s*"
            r"'customer\.subscription\.created'\s*,\s*'customer\.subscription\.updated'\s*,\s*"
            r"'customer\.subscription\.deleted'\s*\)",
        ),
    )
    check(
        "2.7 RPC re-validates the status allowlist",
        lower_matches(
            sql,
            r"p_status\s+not\s+in\s*\(\s*'active'\s*,\s*'trialing'\s*,\s*'canceled'\s*\)",
        ),
    )
    check(
        "2.8 RPC re-validates the plan allowlist",
        lower_matches(
            sql,
            r"p_plan\s+not\s+in\s*\(\s*'free'\s*,\s*'starter'\s*,\s*'pro'\s*,\s*'enterprise'\s*\)",
        ),
    )

    # -----------------------------------------------------------------------
    # 3. Idempotency + deterministic ordering.
    # -----------------------------------------------------------------------
    check(
        "3.1 duplicate event id detected before any write",
        lower_matches(
            sql,
            r"exists\s*\(\s*select\s+1\s+from\s+public\.provider_event_receipts"
            r"[\s\S]{0,200}?provider_event_id\s*=\s*p_event_id\s*\)",
        ),
    )
    check(
        "3.2 duplicate returns bounded code",
        lower_matches(sql, r"'duplicate'"),
    )
    check(
        "3.3 latest receipt selected by (created, event id) ordering",
        lower_matches(
            sql,
            r"order\s+by\s+provider_created_epoch\s+desc\s*,\s*provider_event_id\s+desc",
        ),
    )
    check(
        "3.4 stale event rejected by tuple comparison",
        lower_matches(
            sql,
            r"\(\s*p_event_created\s*,\s*p_event_id\s*\)\s*<\s*\(\s*v_last_created\s*,\s*v_last_event_id\s*\)",
        ),
    )
    check(
        "3.5 stale returns bounded code",
        lower_matches(sql, r"'stale'"),
    )
    check(
        "3.6 equal-time same-value replay fails closed",
        (
            lower_matches(sql, r"p_event_created\s*=\s*v_last_created")
            and lower_matches(sql, r"'replay'")
        ),
    )
    check(
        "3.7 equal-time contradiction fails closed",
        lower_matches(sql, r"'equal_time_conflict'"),
    )

    # -----------------------------------------------------------------------
    # 4. Profile resolution, locking, and linkage safety.
    # -----------------------------------------------------------------------
    check(
        "4.1 profile hint path locks the profile row FOR UPDATE",
        lower_matches(
            sql,
            r"from\s+public\.profiles\s+where\s+id\s*=\s*p_profile_id\s+for\s+update",
        ),
    )
    check(
        "4.2 customer fallback path locks the profile row FOR UPDATE",
        lower_matches(
            sql,
            r"from\s+public\.profiles\s+where\s+stripe_customer_id\s*=\s*p_customer_id\s+for\s+update",
        ),
    )
    check(
        "4.3 missing profile returns bounded code",
        lower_matches(sql, r"'profile_not_found'"),
    )
    check(
        "4.4 profile/customer disagreement fails closed",
        lower_matches(
            sql,
            r"v_profile\.stripe_customer_id\s+is\s+not\s+null\s+and\s+v_profile\.stripe_customer_id\s*<>\s*p_customer_id",
        ),
    )
    check(
        "4.5 profile_customer_mismatch bounded code present",
        lower_matches(sql, r"'profile_customer_mismatch'"),
    )

    # -----------------------------------------------------------------------
    # 5. Founder/manual access precedence.
    # -----------------------------------------------------------------------
    check(
        "5.1 manual_enterprise/complimentary never overwritten",
        lower_matches(
            sql,
            r"v_profile\.subscription_status\s+in\s*\(\s*'manual_enterprise'\s*,\s*'complimentary'\s*\)",
        ),
    )
    check(
        "5.2 manual precedence records applied=false receipt",
        (
            lower_matches(sql, r"'manual_precedence'")
            and lower_matches(sql, r"applied,\s*outcome_code")
        ),
    )
    check(
        "5.3 manual precedence path precedes the profile UPDATE",
        lower.find("'manual_precedence'") < lower.find("update public.profiles"),
    )

    # -----------------------------------------------------------------------
    # 6. Atomic write invariant: one receipt + at most one profile transition.
    # -----------------------------------------------------------------------
    check(
        "6.1 exactly two INSERT INTO provider_event_receipts (apply + manual)",
        count_matches(sql, r"insert\s+into\s+public\.provider_event_receipts") == 2,
        str(count_matches(sql, r"insert\s+into\s+public\.provider_event_receipts")),
    )
    check(
        "6.2 exactly one UPDATE on public.profiles",
        count_matches(sql, r"update\s+public\.profiles") == 1,
        str(count_matches(sql, r"update\s+public\.profiles")),
    )
    check(
        "6.3 receipt INSERT precedes the profile UPDATE (same transaction)",
        lower.find("insert into public.provider_event_receipts") < lower.find(
            "update public.profiles"
        ),
    )
    check(
        "6.4 profile transition row count guarded (no silent success)",
        (
            lower_matches(sql, r"get\s+diagnostics\s+v_updated\s*=\s*row_count")
            and lower_matches(sql, r"v_updated\s*<>\s*1")
        ),
    )
    check(
        "6.5 no direct UPDATE outside the RPC body",
        count_matches(sql, r"update\s+public\.profiles\s+set") == 1,
    )

    # -----------------------------------------------------------------------
    # 7. RLS + grants: service_role only, browser roles revoked.
    # -----------------------------------------------------------------------
    check(
        "7.1 RLS enabled on the receipt table",
        lower_matches(
            sql,
            r"alter\s+table\s+public\.provider_event_receipts\s+enable\s+row\s+level\s+security",
        ),
    )
    check(
        "7.2 table revoked from anon/authenticated",
        lower_matches(
            sql,
            r"revoke\s+all\s+on\s+public\.provider_event_receipts\s+from\s+anon\s*,\s*authenticated",
        ),
    )
    check(
        "7.3 RPC revoked from public/anon/authenticated",
        lower_matches(
            sql,
            r"revoke\s+all\s+on\s+function\s+public\.reconcile_stripe_subscription"
            r"[^;]*from\s+public\s*,\s*anon\s*,\s*authenticated",
        ),
    )
    check(
        "7.4 RPC granted to service_role only",
        (
            lower_matches(
                sql,
                r"grant\s+execute\s+on\s+function\s+public\.reconcile_stripe_subscription"
                r"[^;]*to\s+service_role",
            )
            and not lower_matches(
                sql,
                r"grant\s+execute\s+on\s+function\s+public\.reconcile_stripe_subscription"
                r"[^;]*to\s+(anon|authenticated)",
            )
        ),
    )
    check(
        "7.5 no browser mutation grant on the receipt table",
        not lower_matches(
            sql,
            r"grant\s+(insert|update|delete)\s+on\s+public\.provider_event_receipts"
            r"\s+to\s+(anon|authenticated)",
        ),
    )

    # -----------------------------------------------------------------------
    # 8. Additive-only migration.
    # -----------------------------------------------------------------------
    check(
        "8.1 exactly one CREATE TABLE (the new receipt table)",
        count_matches(sql, r"create\s+table") == 1,
        str(count_matches(sql, r"create\s+table")),
    )
    check(
        "8.2 no ALTER on existing tables",
        not lower_matches(
            sql,
            r"alter\s+table\s+(?!public\.provider_event_receipts)",
        ),
    )
    check(
        "8.3 no CREATE POLICY in this migration",
        not lower_matches(sql, r"create\s+policy"),
    )
    check(
        "8.4 no raw payload storage path (no jsonb event/object column)",
        not lower_matches(sql, r"event_data\s+jsonb")
        and not lower_matches(sql, r"raw_payload"),
    )

    # -----------------------------------------------------------------------
    # 9. Cross-file release contract.
    # -----------------------------------------------------------------------
    check(
        "9.1 migration filename matches the ordered contract",
        version_re.match(migration.name) is not None,
        migration.name,
    )
    check(
        "9.2 migration count advanced additively (45 files)",
        len(files) == 45,
        f"got {len(files)} files",
    )

    # -----------------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------------
    print()
    if _failed:
        print(f"STRIPE SUBSCRIPTION RECONCILIATION CONTRACT FAILED: {len(_failed)} failure(s)")
        for name, detail in _failed:
            print(f"  - {name}: {detail}")
        return 1

    print(f"STRIPE SUBSCRIPTION RECONCILIATION CONTRACT PASSED ({len(_passed)} assertions)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
