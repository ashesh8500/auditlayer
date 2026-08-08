import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "..",
    "supabase",
    "migrations",
    "20260807233734_atomic_entitled_audit_batches.sql",
  ),
  "utf8",
).toLowerCase();

describe("atomic entitled audit batch migration", () => {
  it("owns authorization, entitlement consumption, audit creation, and batch linking in one transaction", () => {
    expect(migration).toContain(
      "create or replace function public.submit_entitled_audit_batch",
    );
    expect(migration).toContain("where id = p_subject_id and user_id = p_user_id");
    expect(migration).toContain("for update");
    expect(migration).toContain("public.submit_entitled_audit(");
    expect(migration).toContain("public.link_subject_channel(");
    expect(migration).toContain("insert into public.audit_events");
    expect(migration).toContain("insert into public.audit_batches");
    expect(migration).toContain("insert into public.batch_audits");
  });

  it("returns the original batch and audits before creating anything on an idempotent retry", () => {
    const existingBatchLookup = migration.indexOf("from public.audit_batches");
    const firstAuditCreation = migration.indexOf("public.submit_entitled_audit(");
    expect(existingBatchLookup).toBeGreaterThan(-1);
    expect(firstAuditCreation).toBeGreaterThan(existingBatchLookup);
    expect(migration).toContain("'batch_id', v_batch_id");
    expect(migration).toContain("'audit_ids', to_jsonb(v_audit_ids)");
  });

  it("is callable only by the service role", () => {
    expect(migration).toContain(
      "revoke all on function public.submit_entitled_audit_batch(uuid, uuid, text, jsonb) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.submit_entitled_audit_batch(uuid, uuid, text, jsonb) to service_role",
    );
  });
});
