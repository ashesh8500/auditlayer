#!/usr/bin/env python3
"""Static tenant-access contract checker for AuditLayer.

Reads the ordered Supabase migrations and statically proves the fail-closed
RLS/storage contract for private subject intelligence and report artifacts:

  subjects, living_brief_versions, evidence, audits, audit_report_versions
  + private storage objects (reports/pdfs buckets)

Rules per private resource class:
  - RLS is enabled on the table.
  - At least one owner-scoped SELECT policy (auth.uid()/owns_subject/owns_audit).
  - At least one admin policy referencing public.is_admin().
  - No SELECT policy targets `anon` (share_links is the explicit exception).
  - No unscoped `FOR ALL ... USING (true)` policy survives on the table
    (historical unsafe policies are accepted only when a later migration
    explicitly drops them, mirroring scripts/check-migrations.py).

Storage rules:
  - reports/pdfs buckets are private (public=false).
  - owner-read object policy scoped by owns_audit(foldername(name)[1]).
  - admin-all object policy scoped by is_admin().
  - no anon object policy for the private buckets.

This proves the software/security contract in the repository only. It does NOT
prove the linked production database or live auth provider state; the exact
local Supabase probe for runtime RLS behavior is emitted as UNKNOWN below.

Exit 0 and final line `TENANT ACCESS CONTRACT PASSED` on success.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "supabase" / "migrations"

POLICY_RE = re.compile(
    r"create\s+policy\s+(?:\"([^\"]+)\"|([a-z0-9_]+))\s+on\s+([a-z0-9_.]+)(.*?);",
    flags=re.IGNORECASE | re.DOTALL,
)

# Private resource classes: table -> required owner predicate marker.
RESOURCE_CLASSES: dict[str, str] = {
    "subjects": "auth.uid() = user_id",
    "living_brief_versions": "owns_subject",
    "evidence": "owns_subject",
    "audits": "auth.uid() = user_id",
    "audit_report_versions": "owns_audit",
}

PRIVATE_BUCKETS = ("reports", "pdfs")

FAILURES: list[str] = []
NOTES: list[str] = []


def fail(message: str) -> None:
    FAILURES.append(message)


def rls_enabled(sql: str, table: str) -> bool:
    return re.search(
        rf"alter\s+table\s+(?:only\s+)?(?:public\.)?{re.escape(table)}\s+enable\s+row\s+level\s+security",
        sql,
        flags=re.IGNORECASE,
    ) is not None


def bucket_insert(sql: str, bucket: str) -> str | None:
    match = re.search(
        rf"insert\s+into\s+storage\.buckets\s*\([^)]*\)\s*values\s*\(\s*'{re.escape(bucket)}'[^)]*\)",
        sql,
        flags=re.IGNORECASE | re.DOTALL,
    )
    return match.group(0) if match else None


def policies_for_table(sql: str, table: str) -> list[tuple[str, str, str]]:
    """Return (policy_name, policy_target, policy_statement) for `table`."""
    out: list[tuple[str, str, str]] = []
    for match in POLICY_RE.finditer(sql):
        name = match.group(1) or match.group(2)
        target = match.group(3).lower()
        statement = match.group(0)
        if target == f"public.{table}" or target == table:
            out.append((name, target, statement))
    return out


def is_unscoped_all(statement: str) -> bool:
    return (
        re.search(r"\bfor\s+all\b", statement, flags=re.IGNORECASE) is not None
        and re.search(r"\busing\s*\(\s*true\s*\)", statement, flags=re.IGNORECASE) is not None
        and re.search(r"\bto\s+service_role\b", statement, flags=re.IGNORECASE) is None
    )


def check_private_table(sql: str, table: str, owner_marker: str) -> int:
    if not rls_enabled(sql, table):
        fail(f"{table}: RLS not enabled (`alter table ... enable row level security` missing)")
        return 0

    policies = policies_for_table(sql, table)
    owner_scoped = [p for p in policies if owner_marker.lower() in p[2].lower()]
    admin_scoped = [p for p in policies if "is_admin" in p[2].lower()]
    anon_scoped = [p for p in policies if re.search(r"\bto\s+anon\b", p[2], flags=re.IGNORECASE)]
    unscoped_all = [p for p in policies if is_unscoped_all(p[2])]

    if not owner_scoped:
        fail(f"{table}: no owner-scoped SELECT policy using `{owner_marker}`")
    if not admin_scoped:
        fail(f"{table}: no admin policy referencing is_admin()")
    if anon_scoped:
        names = ", ".join(p[0] for p in anon_scoped)
        fail(f"{table}: anon SELECT/other policy leaks private rows: {names}")
    if unscoped_all:
        names = ", ".join(p[0] for p in unscoped_all)
        fail(f"{table}: unscoped FOR ALL USING (true) policy: {names}")
    NOTES.append(
        f"{table}: RLS on; owner-scoped({len(owner_scoped)}), admin-scoped({len(admin_scoped)}), "
        f"anon={len(anon_scoped)}, unscoped-all={len(unscoped_all)}"
    )
    return len(policies)


def check_storage_bucket(sql: str, bucket: str) -> int:
    values = bucket_insert(sql, bucket)
    if values is None:
        fail(f"storage bucket {bucket}: insert into storage.buckets missing")
        return 0
    if not re.search(r",\s*false\s*,", values, flags=re.IGNORECASE):
        fail(f"storage bucket {bucket}: bucket must be private (public=false)")

    object_policies = policies_for_table(sql, "storage.objects")
    relevant = [p for p in object_policies if f"bucket_id = '{bucket}'" in p[2]]

    owner_read = [
        p for p in relevant
        if re.search(r"\bfor\s+select\b", p[2], flags=re.IGNORECASE)
        and "owns_audit" in p[2]
    ]
    admin_all = [
        p for p in relevant
        if re.search(r"\bfor\s+all\b", p[2], flags=re.IGNORECASE)
        and "is_admin" in p[2]
    ]
    anon_read = [
        p for p in relevant
        if re.search(r"\bto\s+anon\b", p[2], flags=re.IGNORECASE)
    ]
    if not owner_read:
        fail(f"storage bucket {bucket}: no owner-read object policy scoped by owns_audit")
    if not admin_all:
        fail(f"storage bucket {bucket}: no admin-all object policy scoped by is_admin")
    if anon_read:
        names = ", ".join(p[0] for p in anon_read)
        fail(f"storage bucket {bucket}: anon object policy leaks private objects: {names}")
    NOTES.append(
        f"storage.{bucket}: private bucket; owner-read({len(owner_read)}), admin-all({len(admin_all)}), anon={len(anon_read)}"
    )
    return len(object_policies)


def main() -> int:
    files = sorted(MIGRATIONS.glob("*.sql"))
    if not files:
        print("FATAL: no migration files found", file=sys.stderr)
        return 2

    sql = "\n\n".join(f.read_text(encoding="utf-8") for f in files)
    lowered_by_path = {path: path.read_text(encoding="utf-8").lower() for path in files}

    # --- 1. Private resource classes -------------------------------------
    inspected = 0
    for table, owner_marker in RESOURCE_CLASSES.items():
        inspected += check_private_table(sql, table, owner_marker)

    # --- 2. Private storage buckets --------------------------------------
    for bucket in PRIVATE_BUCKETS:
        inspected += check_storage_bucket(sql, bucket)

    # --- 3. Explicit token-scoped share exception ------------------------
    share_policies = policies_for_table(sql, "share_links")
    inspected += len(share_policies)
    public_read = [
        p for p in share_policies
        if p[0] == "share_links_public_read"
        and re.search(r"\bto\s+anon\b", p[2], flags=re.IGNORECASE)
    ]
    if not public_read:
        fail("share_links: explicit public-read exception (share_links_public_read to anon) missing")
    # The exception must never extend to audits or private report objects.
    audits_anon = [
        p for p in policies_for_table(sql, "audits")
        if re.search(r"\bto\s+anon\b", p[2], flags=re.IGNORECASE)
    ]
    reports_anon = [
        p for p in policies_for_table(sql, "storage.objects")
        if re.search(r"\bto\s+anon\b", p[2], flags=re.IGNORECASE)
        and "bucket_id = 'reports'" in p[2]
    ]
    if audits_anon:
        fail("audits: anon policy found — share exception must not extend to private audits")
    if reports_anon:
        fail("storage.reports: anon object policy found — share exception must not expose report artifacts")

    # --- 4. Corpus-wide fail-closed scan (remediation-aware) -------------
    for index, path in enumerate(files):
        file_text = path.read_text(encoding="utf-8")
        later_sql = "\n".join(lowered_by_path[p] for p in files[index + 1 :])
        for match in POLICY_RE.finditer(file_text):
            name = (match.group(1) or match.group(2)).lower()
            target = match.group(3).lower()
            statement = match.group(0)
            if target in ("public.share_links", "share_links"):
                continue  # documented token-scoped exception
            if not is_unscoped_all(statement):
                continue
            remediation = f'drop policy if exists "{name}" on {target}'
            if remediation not in later_sql:
                fail(f"corpus-wide: unscoped FOR ALL USING (true) policy {name!r} on {target} (no later drop)")

    # --- 5. Report --------------------------------------------------------
    print("=" * 70)
    print("TENANT ACCESS CONTRACT — STATIC RLS/STORAGE CHECK")
    print("=" * 70)
    print(f"migrations inspected : {len(files)} (latest={files[-1].name})")
    print(f"policies inspected   : {inspected}")
    print(f"resource classes     : {len(RESOURCE_CLASSES)} (subjects, living_brief_versions, evidence, audits, audit_report_versions)")
    print(f"private buckets      : {', '.join(PRIVATE_BUCKETS)}")
    print("-" * 70)
    for note in NOTES:
        print(f"  OK  {note}")
    print("-" * 70)

    if FAILURES:
        print("FAILED CHECKS:")
        for f in FAILURES:
            print(f"  FAIL {f}")
        print("TENANT ACCESS CONTRACT FAILED")
        return 1

    print("TENANT ACCESS CONTRACT PASSED")
    print()
    print("UNKNOWN (not statically provable, needs a later release gate):")
    print("  - Live RLS behavior under real JWTs (auth.uid() resolution, role")
    print("    simulation, storage.foldername() parsing) requires a local Supabase.")
    print("  - Exact local probe (release gate, never linked production):")
    print("      supabase start")
    print("      psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \\")
    print("        -f supabase/tests/alm_intelligence_kernel_test.sql")
    print("      psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \\")
    print("        -f supabase/tests/alm_intelligence_ai_storage_test.sql")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
