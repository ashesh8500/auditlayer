#!/usr/bin/env python3
"""Static release checks for the ordered Supabase migration contract."""
from __future__ import annotations

import re
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
}


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

    print(f"migration contract OK: {len(files)} files, latest={versions[-1]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
