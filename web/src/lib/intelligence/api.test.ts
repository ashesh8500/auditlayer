import { describe, it, expect } from "vitest";
import {
  buildBatchIdempotencyKey,
  stubPrepareAndSubmitBatch,
  ASSUMED_RPC_SHAPES,
} from "./api";
import type { BatchSubmission } from "./types";

function mkSubmission(overrides: Partial<BatchSubmission> = {}): BatchSubmission {
  return {
    subjectId: "subj-001",
    briefVersionId: "bv-003",
    changeNotes: "Launched new offer",
    requests: [
      { channelId: "ch-001", reportType: "standard", forceRefresh: false },
      { channelId: "ch-002", reportType: "pulse", forceRefresh: false },
    ],
    ...overrides,
  };
}

describe("buildBatchIdempotencyKey", () => {
  it("is stable for the same inputs", () => {
    const a = buildBatchIdempotencyKey(mkSubmission(), [
      "@narinkaji",
      "https://narinkaji.com",
    ]);
    const b = buildBatchIdempotencyKey(mkSubmission(), [
      "https://narinkaji.com",
      "@narinkaji",
    ]);
    expect(a).toBe(b);
  });

  it("changes when channels change", () => {
    const a = buildBatchIdempotencyKey(mkSubmission(), ["@a"]);
    const b = buildBatchIdempotencyKey(mkSubmission(), ["@b"]);
    expect(a).not.toBe(b);
  });
});

describe("stubPrepareAndSubmitBatch", () => {
  it("rejects empty batches", () => {
    const result = stubPrepareAndSubmitBatch(
      mkSubmission({ requests: [] }),
      [],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at least one channel/i);
  });

  it("rejects missing subject", () => {
    const result = stubPrepareAndSubmitBatch(
      mkSubmission({ subjectId: "" }),
      ["@x"],
    );
    expect(result.ok).toBe(false);
  });

  it("returns deterministic stub ids without inventing live progress", () => {
    const submission = mkSubmission();
    const locators = ["@narinkaji", "https://narinkaji.com"];
    const a = stubPrepareAndSubmitBatch(submission, locators);
    const b = stubPrepareAndSubmitBatch(submission, locators);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.mode).toBe("stub");
      expect(a.batchId).toBe(b.batchId);
      expect(a.auditIds).toEqual(b.auditIds);
      expect(a.auditIds).toHaveLength(2);
    }
  });
});

describe("KERNEL_RPC_SHAPES", () => {
  it("documents service-role batch and subject RPCs with kernel arg names", () => {
    expect(ASSUMED_RPC_SHAPES.submit_audit_batch.grant).toBe("service_role");
    expect(ASSUMED_RPC_SHAPES.create_subject.args).toContain("p_user_id");
    expect(ASSUMED_RPC_SHAPES.link_subject_channel.args).toContain(
      "p_channel_type",
    );
    expect(ASSUMED_RPC_SHAPES.resolve_context_update_proposal.args).toEqual([
      "p_proposal_id",
      "p_status",
      "p_user_id",
    ]);
  });
});
