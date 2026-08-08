import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "..",
    "supabase",
    "migrations",
    "20260808004102_retry_lookup_before_entitlement.sql",
  ),
  "utf8",
).toLowerCase();

describe("pre-entitlement retry lookup migration", () => {
  it("returns only a recent batch whose subject is still owned by the user", () => {
    expect(migration).toContain("lookup_entitled_audit_batch_retry");
    expect(migration).toContain("join public.subjects");
    expect(migration).toContain("s.user_id = p_user_id");
    expect(migration).toContain("created_at >= now() - interval '10 minutes'");
    expect(migration).toContain("'subject_id'");
    expect(migration).toContain("'audit_ids'");
  });

  it("is a service-role-only security-definer function", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public");
    expect(migration).toContain(
      "revoke all on function public.lookup_entitled_audit_batch_retry(uuid, text) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.lookup_entitled_audit_batch_retry(uuid, text) to service_role",
    );
  });
});
