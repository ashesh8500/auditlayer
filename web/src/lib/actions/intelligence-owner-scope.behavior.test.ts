import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  subjectOwned: false,
  filters: [] as Array<{ table: string; column: string; value: unknown }>,
  recordDecision: vi.fn(),
  createSubject: vi.fn(),
  lookupBatchRetry: vi.fn(),
  submitAtomicBatch: vi.fn(),
  listChannels: vi.fn(),
  listBriefs: vi.fn(),
}));

function clientFactory() {
  return {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          state.filters.push({ table, column, value });
          return query;
        },
        maybeSingle: async () => {
          if (table === "subjects" && state.subjectOwned) {
            return {
              data: {
                id: "11111111-1111-4111-8111-111111111111",
                user_id: "admin-user",
                subject_type: "creator",
              },
              error: null,
            };
          }
          if (table === "recommendations") {
            return {
              data: {
                id: "22222222-2222-4222-8222-222222222222",
                intelligence_runs: {
                  subject_id: "11111111-1111-4111-8111-111111111111",
                },
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        in: async () => ({ data: null, error: null, count: 0 }),
        then: (
          resolve: (value: { data: unknown[]; error: null }) => unknown,
        ) => Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return query;
    },
  };
}

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireProfile: async () => ({ id: "admin-user", role: "admin" }),
}));
vi.mock("@/lib/env", () => ({
  isSupabaseAdminConfigured: () => true,
  isSupabaseConfigured: () => true,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: clientFactory }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => clientFactory(),
}));
vi.mock("@/lib/intelligence/subjects", () => ({
  listChannelsForSubject: state.listChannels,
  listBriefVersionsForSubject: state.listBriefs,
}));
vi.mock("@/lib/intelligence/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/intelligence/api")>();
  return {
    ...actual,
    rpcRecordDecision: state.recordDecision,
    rpcCreateSubject: state.createSubject,
    rpcLookupEntitledAuditBatchRetry: state.lookupBatchRetry,
    rpcSubmitEntitledAuditBatch: state.submitAtomicBatch,
  };
});

import {
  loadSubjectWizardContextAction,
  prepareAndSubmitIntelligenceBatch,
  recordRecommendationDecisionAction,
} from "@/lib/actions/intelligence";

const SUBJECT_ID = "11111111-1111-4111-8111-111111111111";
const RECOMMENDATION_ID = "22222222-2222-4222-8222-222222222222";

describe("customer subject actions under a broad admin database policy", () => {
  beforeEach(() => {
    state.subjectOwned = false;
    state.filters.length = 0;
    state.recordDecision.mockReset();
    state.createSubject.mockReset();
    state.lookupBatchRetry.mockReset();
    state.submitAtomicBatch.mockReset();
    state.listChannels.mockReset();
    state.listBriefs.mockReset();
  });

  it("does not load foreign subject children in the audit wizard", async () => {
    await expect(
      loadSubjectWizardContextAction({ subjectId: SUBJECT_ID }),
    ).resolves.toEqual({ ok: false, error: "Subject not found." });
    expect(state.listChannels).not.toHaveBeenCalled();
    expect(state.listBriefs).not.toHaveBeenCalled();
    expect(state.filters).toEqual(
      expect.arrayContaining([
        { table: "subjects", column: "id", value: SUBJECT_ID },
        { table: "subjects", column: "user_id", value: "admin-user" },
      ]),
    );
  });

  it("does not create audits or a batch for a foreign subject", async () => {
    const result = await prepareAndSubmitIntelligenceBatch({
      submission: {
        subjectId: SUBJECT_ID,
        briefVersionId: "",
        changeNotes: "",
        requests: [
          {
            channelId: "instagram-channel",
            reportType: "standard",
            forceRefresh: false,
          },
        ],
      },
      channelLocators: ["auditlayermedia"],
      channelMeta: [
        {
          locator: "auditlayermedia",
          channelType: "instagram",
        },
      ],
    });
    expect(result).toEqual({
      ok: false,
      mode: "live",
      error: "Subject not found.",
    });
    expect(state.submitAtomicBatch).not.toHaveBeenCalled();
  });

  it("creates a new subject inside the same idempotent batch transaction", async () => {
    state.submitAtomicBatch.mockResolvedValue({
      batchId: "batch-1",
      auditIds: ["audit-1"],
      subjectId: SUBJECT_ID,
    });

    const result = await prepareAndSubmitIntelligenceBatch({
      submission: {
        subjectId: "new-subject",
        briefVersionId: "",
        changeNotes: "Launch notes",
        requests: [
          {
            channelId: "instagram-channel",
            reportType: "standard",
            forceRefresh: false,
          },
        ],
      },
      newSubjectName: "AuditLayer Media",
      newSubjectType: "creator",
      channelLocators: ["auditlayermedia"],
      channelMeta: [
        {
          locator: "auditlayermedia",
          channelType: "instagram",
        },
      ],
    });

    expect(state.createSubject).not.toHaveBeenCalled();
    expect(state.submitAtomicBatch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        subjectId: null,
        subjectDraft: {
          name: "AuditLayer Media",
          subjectType: "creator",
          identity: {
            name: "AuditLayer Media",
            subject_type: "creator",
          },
          goals: ["Launch notes"],
        },
      }),
    );
    expect(result).toEqual({
      ok: true,
      mode: "live",
      batchId: "batch-1",
      auditIds: ["audit-1"],
      subjectId: SUBJECT_ID,
    });
  });

  it("returns a committed retry before mutable entitlement planning", async () => {
    state.lookupBatchRetry.mockResolvedValue({
      batchId: "batch-retry",
      auditIds: ["audit-retry"],
      subjectId: SUBJECT_ID,
    });

    const result = await prepareAndSubmitIntelligenceBatch({
      submission: {
        subjectId: "new-subject",
        briefVersionId: "",
        changeNotes: "Launch notes",
        requests: [
          {
            channelId: "instagram-channel",
            reportType: "standard",
            forceRefresh: false,
          },
        ],
      },
      newSubjectName: "AuditLayer Media",
      newSubjectType: "creator",
      channelLocators: ["auditlayermedia"],
      channelMeta: [
        {
          locator: "auditlayermedia",
          channelType: "instagram",
        },
      ],
    });

    expect(result).toEqual({
      ok: true,
      mode: "live",
      batchId: "batch-retry",
      auditIds: ["audit-retry"],
      subjectId: SUBJECT_ID,
    });
    expect(state.submitAtomicBatch).not.toHaveBeenCalled();
    expect(state.createSubject).not.toHaveBeenCalled();
    expect(state.filters).toEqual([]);
  });

  it("submits an owned multi-write batch through exactly one atomic RPC", async () => {
    state.subjectOwned = true;
    state.submitAtomicBatch.mockResolvedValue({
      batchId: "batch-001",
      auditIds: ["audit-001"],
      subjectId: SUBJECT_ID,
    });

    const result = await prepareAndSubmitIntelligenceBatch({
      submission: {
        subjectId: SUBJECT_ID,
        briefVersionId: "",
        changeNotes: "",
        requests: [
          {
            channelId: "instagram-channel",
            reportType: "standard",
            forceRefresh: false,
          },
        ],
      },
      channelLocators: ["auditlayermedia"],
      channelMeta: [
        {
          locator: "auditlayermedia",
          channelType: "instagram",
        },
      ],
    });

    expect(result).toMatchObject({
      ok: true,
      mode: "live",
      batchId: "batch-001",
      auditIds: ["audit-001"],
      subjectId: SUBJECT_ID,
    });
    expect(state.submitAtomicBatch).toHaveBeenCalledTimes(1);
    expect(state.submitAtomicBatch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "admin-user",
        subjectId: SUBJECT_ID,
        audits: [
          expect.objectContaining({
            channelType: "instagram",
            channelLocator: "auditlayermedia",
            handle: "auditlayermedia",
            reportType: "standard",
          }),
        ],
      }),
    );
  });

  it("does not leak database errors from the atomic batch boundary", async () => {
    state.subjectOwned = true;
    state.submitAtomicBatch.mockRejectedValue(
      new Error("subject_not_owned: internal database detail"),
    );

    const result = await prepareAndSubmitIntelligenceBatch({
      submission: {
        subjectId: SUBJECT_ID,
        briefVersionId: "",
        changeNotes: "",
        requests: [
          {
            channelId: "instagram-channel",
            reportType: "standard",
            forceRefresh: false,
          },
        ],
      },
      channelLocators: ["auditlayermedia"],
      channelMeta: [
        {
          locator: "auditlayermedia",
          channelType: "instagram",
        },
      ],
    });

    expect(result).toEqual({
      ok: false,
      mode: "live",
      error: "We couldn't create that batch.",
    });
  });

  it("does not write a recommendation decision for a foreign subject", async () => {
    const result = await recordRecommendationDecisionAction({
      subjectId: SUBJECT_ID,
      recommendationId: RECOMMENDATION_ID,
      decision: "accepted",
    });
    expect(result).toEqual({ ok: false, error: "Recommendation not found." });
    expect(state.recordDecision).not.toHaveBeenCalled();
    expect(state.filters).toEqual(
      expect.arrayContaining([
        { table: "subjects", column: "id", value: SUBJECT_ID },
        { table: "subjects", column: "user_id", value: "admin-user" },
      ]),
    );
  });

  it("does not leak an ownership-race database error from record_decision", async () => {
    state.subjectOwned = true;
    state.recordDecision.mockRejectedValue(
      new Error("subject_not_owned: internal database detail"),
    );

    const result = await recordRecommendationDecisionAction({
      subjectId: SUBJECT_ID,
      recommendationId: RECOMMENDATION_ID,
      decision: "accepted",
    });

    expect(result).toEqual({
      ok: false,
      error: "Could not record that decision.",
    });
  });
});
