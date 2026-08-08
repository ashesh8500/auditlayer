import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "..",
    "supabase",
    "migrations",
    "20260808011216_preserve_compatibility_batch_errors.sql",
  ),
  "utf8",
).toLowerCase();

describe("compatibility batch RPC concurrency migration", () => {
  it("serializes submit_audit_batch and uses the rolling retry window", () => {
    expect(migration).toContain(
      "create or replace function public.submit_audit_batch",
    );
    expect(migration).toMatch(
      /perform\s+1\s+from public\.profiles[\s\S]*?where id = p_user_id[\s\S]*?for update/,
    );
    expect(migration).toMatch(
      /from public\.audit_batches[\s\S]*?created_at >= now\(\) - interval '10 minutes'/,
    );
    expect(migration).toContain(
      "raise exception 'subject % is not owned by user %'",
    );
  });

  it("prevents the add-audit compatibility shim from crossing tenants", () => {
    expect(migration).toContain(
      "create or replace function public.add_audit_to_batch",
    );
    expect(migration).toMatch(
      /from public\.audit_batches[\s\S]*?where id = p_batch_id[\s\S]*?for update/,
    );
    expect(migration).toMatch(
      /from public\.audits[\s\S]*?where id = p_audit_id[\s\S]*?user_id = v_batch_user_id/,
    );
    expect(migration).toContain(
      "raise exception 'audit % is not owned by batch user %'",
    );
  });
});
