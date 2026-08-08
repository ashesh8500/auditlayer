import { describe, it, expect, vi } from "vitest";
import {
  rpcLookupEntitledAuditBatchRetry,
  rpcSubmitEntitledAuditBatch,
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
    const locators = ["@narinfazlalipour", "https://example.com/narin-fazlalipour"];
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
    expect(ASSUMED_RPC_SHAPES.lookup_entitled_audit_batch_retry.grant).toBe(
      "service_role",
    );
  });
});

describe("rpcLookupEntitledAuditBatchRetry", () => {
  it("returns a committed retry payload and preserves null misses", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          batch_id: "batch-retry",
          audit_ids: ["audit-retry"],
          subject_id: "subject-retry",
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    const admin = { rpc } as never;

    await expect(
      rpcLookupEntitledAuditBatchRetry(admin, {
        userId: "user-1",
        idempotencyKey: "fingerprint-1",
      }),
    ).resolves.toEqual({
      batchId: "batch-retry",
      auditIds: ["audit-retry"],
      subjectId: "subject-retry",
    });
    await expect(
      rpcLookupEntitledAuditBatchRetry(admin, {
        userId: "user-1",
        idempotencyKey: "missing",
      }),
    ).resolves.toBeNull();
  });
});

describe("rpcSubmitEntitledAuditBatch", () => {
  it("creates and links every entitled audit through one database transaction", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const admin = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return {
          data: {
            batch_id: "batch-001",
            audit_ids: ["audit-001"],
            subject_id: "subject-001",
          },
          error: null,
        };
      },
    } as never;

    const result = await rpcSubmitEntitledAuditBatch(admin, {
      userId: "user-001",
      subjectId: "subject-001",
      subjectDraft: null,
      idempotencyKey: "retry-window-key",
      audits: [
        {
          channelType: "instagram",
          channelLocator: "auditlayermedia",
          handle: "auditlayermedia",
          platform: "instagram",
          goal: "growth",
          reportType: "standard",
          context: "",
          status: "queued",
          limitations: [],
          milestoneLabel: "10K",
          forceRefresh: true,
        },
      ],
    });

    expect(result).toEqual({
      batchId: "batch-001",
      auditIds: ["audit-001"],
      subjectId: "subject-001",
    });
    expect(calls).toEqual([
      {
        name: "submit_entitled_audit_batch_v2",
        args: {
          p_user_id: "user-001",
          p_subject_id: "subject-001",
          p_subject_draft: null,
          p_idempotency_key: "retry-window-key",
          p_audits: [
            {
              channel_type: "instagram",
              channel_locator: "auditlayermedia",
              handle: "auditlayermedia",
              platform: "instagram",
              goal: "growth",
              report_type: "standard",
              context: "",
              status: "queued",
              limitations: [],
              milestone_label: "10K",
              force_refresh: true,
            },
          ],
        },
      },
    ]);
  });
});
