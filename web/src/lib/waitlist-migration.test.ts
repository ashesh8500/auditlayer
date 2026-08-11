import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "../supabase/migrations/20260811160736_waitlist_entries.sql"),
  "utf8",
).toLowerCase();

describe("waitlist migration", () => {
  it("keeps public leads private while allowing durable deduplicated storage", () => {
    expect(migration).toContain("create table public.waitlist_entries");
    expect(migration).toContain("email text not null unique");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("force row level security");
    expect(migration).toContain("revoke all on table public.waitlist_entries from anon, authenticated");
    expect(migration).not.toContain("create policy");
  });
});
