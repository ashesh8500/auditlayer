#!/usr/bin/env python3
"""Promote a user to admin by email. Requires worker/.env service role."""
from __future__ import annotations

import sys
from pathlib import Path

# Load worker/.env
env_path = Path(__file__).resolve().parents[1] / "worker" / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        import os

        os.environ.setdefault(k.strip(), v.strip())

from supabase import create_client  # noqa: E402


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python scripts/promote-admin.py <email> [<email> ...]")
        return 1

    url = __import__("os").environ.get("SUPABASE_URL")
    key = __import__("os").environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in worker/.env")
        return 1

    client = create_client(url, key)
    for email in sys.argv[1:]:
        email = email.strip().lower()
        result = (
            client.table("profiles")
            .update({"role": "admin"})
            .eq("email", email)
            .execute()
        )
        if result.data:
            print(f"✓ promoted {email} → admin")
        else:
            print(f"⚠ no profile for {email} — user must sign in once first")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
