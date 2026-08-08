import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "..",
    "supabase",
    "migrations",
    "20260808001443_rolling_batch_idempotency.sql",
  ),
  "utf8",
).toLowerCase();

describe("rolling batch idempotency migration", () => {
  it("replaces the permanent unique key with a rolling retry lookup", () => {
    expect(migration).toContain(
      "drop constraint if exists audit_batches_user_id_idempotency_key_key",
    );
    expect(migration).toContain("idx_audit_batches_retry_lookup");
    expect(migration).toContain("created_at >= now() - interval '10 minutes'");
    expect(migration).toContain("order by created_at desc");
  });

  it("preserves one serialized transaction while honoring force refresh", () => {
    expect(migration).toContain("for update");
    const subjectLock = migration.indexOf("from public.subjects");
    const subjectLockEnd = migration.indexOf("for update", subjectLock);
    expect(subjectLock).toBeGreaterThan(-1);
    expect(subjectLockEnd).toBeGreaterThan(subjectLock);
    expect(migration).toContain("public.submit_entitled_audit(");
    expect(migration).toContain("set force_refresh =");
    expect(migration).toContain("v_item->>'force_refresh'");
  });

  it("creates draft subjects and their first brief inside the idempotent transaction", () => {
    expect(migration).toContain("submit_entitled_audit_batch_v2");
    const retryLookup = migration.lastIndexOf("from public.audit_batches");
    const subjectCreation = migration.indexOf("public.create_subject(", retryLookup);
    expect(retryLookup).toBeGreaterThan(-1);
    expect(subjectCreation).toBeGreaterThan(retryLookup);
    expect(migration).toContain("public.record_living_brief_version(");
    expect(migration).toContain("'subject_id', v_subject_id");
  });

  it("keeps the security-definer RPC service-role only", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public");
    expect(migration).toContain(
      "revoke all on function public.submit_entitled_audit_batch(uuid, uuid, text, jsonb) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.submit_entitled_audit_batch(uuid, uuid, text, jsonb) to service_role",
    );
    expect(migration).toContain(
      "revoke all on function public.submit_entitled_audit_batch_v2(uuid, uuid, jsonb, text, jsonb) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.submit_entitled_audit_batch_v2(uuid, uuid, jsonb, text, jsonb) to service_role",
    );
  });
});
