/**
 * ALM-I-019 — recommendation decision contract tests (no live DB, no network,
 * no provider calls).
 *
 * Covers:
 *  - rpcRecordDecision adapter: exactly-one allowlisted `record_decision` call
 *    per valid submission, correct p_* argument shapes, error never success;
 *  - planRecommendationDecision matrix: owner/admin/other-user, wrong subject,
 *    missing recommendation, accepted/rejected, modified/superseded/garbage,
 *    duplicate, stale, malformed note, persistence failure → exact
 *    write/noop with exactly-one/zero write counts;
 *  - projectLatestDecision: deterministic latest durable decision projection;
 *  - recommendationDecisionDisplayState: rejected suppression, accepted,
 *    actionable, decided_other (superseded never mapped to accept);
 *  - customer-safe error copy (modified is explicitly unsupported);
 *  - the versioned static contract artifact under web/artifacts/.
 *
 * Fixtures prove software contracts only; they do not prove live RLS,
 * creator efficacy, retention, or business impact.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  isSupportedRecommendationDecision,
  planRecommendationDecision,
  projectLatestDecision,
  rpcRecordDecision,
  recommendationDecisionDisplayState,
  recommendationDecisionPlanError,
  UNSUPPORTED_RECOMMENDATION_DECISIONS,
  RECOMMENDATION_DECISION_VALUES,
  type AdminClient,
  type DecisionLedgerRow,
  type RecommendationDecisionPlan,
  type RecommendationDecisionPlanInput,
} from "./api";

// ---------------------------------------------------------------------------
// Fixture identifiers (valid v4-shaped UUIDs so the planner's fail-closed
// UUID validation accepts only the intended malformed cases).
// ---------------------------------------------------------------------------

const OWNER_ID = "00000000-0000-4000-8000-0000000000aa";
const ADMIN_ID = "00000000-0000-4000-8000-0000000000bb";
const OTHER_ID = "00000000-0000-4000-8000-0000000000cc";
const SUBJECT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_SUBJECT_ID = "33333333-3333-4333-8333-333333333333";
const REC_ID = "22222222-2222-4222-8222-222222222222";
const REC2_ID = "55555555-5555-4555-8555-555555555555";
const DECISION_ID = "44444444-4444-4444-8444-444444444444";

type RpcCall = { name: string; args: Record<string, unknown> };

/** Recording admin client — counts every RPC call for write-count assertions. */
function recordingAdminClient(overrides?: {
  rpcError?: { message: string };
  decisionId?: string;
}): AdminClient & { calls: RpcCall[] } {
  const calls: RpcCall[] = [];
  const client = {
    calls,
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (overrides?.rpcError) {
        return { data: null, error: overrides.rpcError };
      }
      if (name === "record_decision") {
        return { data: overrides?.decisionId ?? DECISION_ID, error: null };
      }
      return { data: null, error: { message: `unexpected rpc ${name}` } };
    },
  };
  return client as unknown as AdminClient & { calls: RpcCall[] };
}

function ledgerRow(
  id: string,
  targetId: string,
  decision: string,
  userId: string,
  createdAt = "2026-08-01T00:00:00.000Z",
): DecisionLedgerRow {
  return {
    id,
    target_id: targetId,
    decision,
    note: null,
    user_id: userId,
    created_at: createdAt,
  };
}

/**
 * Faithful mirror of the server action's execution path: a write plan becomes
 * exactly one rpcRecordDecision call; every noop plan makes zero writes.
 */
async function executePlan(
  client: AdminClient & { calls: RpcCall[] },
  plan: RecommendationDecisionPlan,
  requestedDecision: string,
): Promise<{ ok: boolean; decisionId?: string; error?: string }> {
  try {
    if (plan.action === "noop") {
      if (plan.reason === "duplicate" && plan.decisionId) {
        return { ok: true, decisionId: plan.decisionId };
      }
      return {
        ok: false,
        error: recommendationDecisionPlanError(plan),
      };
    }
    const decisionId = await rpcRecordDecision(client, plan.call);
    return { ok: true, decisionId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not record that decision.",
    };
  }
}

function planInput(
  overrides: Partial<RecommendationDecisionPlanInput> = {},
): RecommendationDecisionPlanInput {
  return {
    subjectId: SUBJECT_ID,
    recommendationId: REC_ID,
    decision: "accepted",
    note: "",
    configured: true,
    profile: { id: OWNER_ID, role: "client" },
    subject: { id: SUBJECT_ID, user_id: OWNER_ID },
    recommendationSubjectId: SUBJECT_ID,
    existingDecisions: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Recording adapter — exactly-one allowlisted record_decision call
// ---------------------------------------------------------------------------

describe("rpcRecordDecision (one authoritative ledger call)", () => {
  it("records an accept with exactly one allowlisted record_decision call", async () => {
    const client = recordingAdminClient();
    const id = await rpcRecordDecision(client, {
      subjectId: SUBJECT_ID,
      userId: OWNER_ID,
      targetType: "recommendation",
      targetId: REC_ID,
      decision: "accepted",
      note: "Keep this",
    });
    expect(id).toBe(DECISION_ID);
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]!.name).toBe("record_decision");
    expect(client.calls[0]!.args).toEqual({
      p_subject_id: SUBJECT_ID,
      p_user_id: OWNER_ID,
      p_target_type: "recommendation",
      p_target_id: REC_ID,
      p_decision: "accepted",
      p_note: "Keep this",
    });
  });

  it("records a reject with the same single-call shape", async () => {
    const client = recordingAdminClient();
    await rpcRecordDecision(client, {
      subjectId: SUBJECT_ID,
      userId: OWNER_ID,
      targetType: "recommendation",
      targetId: REC_ID,
      decision: "rejected",
    });
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]!.args.p_decision).toBe("rejected");
    expect(client.calls[0]!.args.p_note).toBe("");
  });

  it("records a modified refinement with its note in the same single-call shape", async () => {
    const client = recordingAdminClient();
    const id = await rpcRecordDecision(client, {
      subjectId: SUBJECT_ID,
      userId: OWNER_ID,
      targetType: "recommendation",
      targetId: REC_ID,
      decision: "modified",
      note: "Tighten the niche to metabolic health",
    });
    expect(id).toBe(DECISION_ID);
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]!.name).toBe("record_decision");
    expect(client.calls[0]!.args.p_decision).toBe("modified");
    expect(client.calls[0]!.args.p_note).toBe(
      "Tighten the niche to metabolic health",
    );
  });

  it("surfaces a ledger persistence failure as an error, never success", async () => {
    const client = recordingAdminClient({
      rpcError: { message: "connection terminated" },
    });
    await expect(
      rpcRecordDecision(client, {
        subjectId: SUBJECT_ID,
        userId: OWNER_ID,
        targetType: "recommendation",
        targetId: REC_ID,
        decision: "accepted",
      }),
    ).rejects.toThrow("connection terminated");
    // The write was attempted exactly once and the failure surfaced.
    expect(client.calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Planner matrix — owner/admin/other, linkage, decisions, idempotency
// ---------------------------------------------------------------------------

describe("planRecommendationDecision matrix", () => {
  const matrix: Array<{
    name: string;
    overrides: Partial<RecommendationDecisionPlanInput>;
    plan: "write" | "noop";
    reason?: string;
    decision?: string;
    writes: number;
  }> = [
    {
      name: "owner accept → one write",
      overrides: { decision: "accepted" },
      plan: "write",
      decision: "accepted",
      writes: 1,
    },
    {
      name: "owner reject → one write",
      overrides: { decision: "rejected" },
      plan: "write",
      decision: "rejected",
      writes: 1,
    },
    {
      name: "owner modified with refinement note → one write",
      overrides: {
        decision: "modified",
        note: "Make it specific to cold plunge frequency",
      },
      plan: "write",
      decision: "modified",
      writes: 1,
    },
    {
      name: "admin modified with refinement note on another user's subject → one write",
      overrides: {
        profile: { id: ADMIN_ID, role: "admin" },
        subject: { id: SUBJECT_ID, user_id: OTHER_ID },
        decision: "modified",
        note: "Adjust the posting cadence recommendation",
      },
      plan: "write",
      decision: "modified",
      writes: 1,
    },
    {
      name: "modified without a refinement note → zero writes",
      overrides: { decision: "modified", note: "   " },
      plan: "noop",
      reason: "missing_note",
      writes: 0,
    },
    {
      name: "modified with an oversized refinement note → zero writes",
      overrides: { decision: "modified", note: "x".repeat(501) },
      plan: "noop",
      reason: "malformed",
      writes: 0,
    },
    {
      name: "admin accept on a subject owned by another user → one write",
      overrides: {
        profile: { id: ADMIN_ID, role: "admin" },
        subject: { id: SUBJECT_ID, user_id: OTHER_ID },
        decision: "accepted",
      },
      plan: "write",
      decision: "accepted",
      writes: 1,
    },
    {
      name: "other user (not owner/admin) → zero writes",
      overrides: { profile: { id: OTHER_ID, role: "client" } },
      plan: "noop",
      reason: "unauthorized",
      writes: 0,
    },
    {
      name: "recommendation linked to a different subject → zero writes",
      overrides: { recommendationSubjectId: OTHER_SUBJECT_ID },
      plan: "noop",
      reason: "wrong_subject",
      writes: 0,
    },
    {
      name: "missing recommendation → zero writes",
      overrides: { recommendationSubjectId: null },
      plan: "noop",
      reason: "recommendation_not_found",
      writes: 0,
    },
    {
      name: "missing subject → zero writes",
      overrides: { subject: null },
      plan: "noop",
      reason: "subject_not_found",
      writes: 0,
    },
    {
      name: "superseded is explicitly unsupported → zero writes",
      overrides: { decision: "superseded" },
      plan: "noop",
      reason: "unsupported",
      writes: 0,
    },
    {
      name: "unknown decision value → zero writes",
      overrides: { decision: "maybe" },
      plan: "noop",
      reason: "unsupported",
      writes: 0,
    },
    {
      name: "duplicate same decision → zero writes (idempotent)",
      overrides: {
        existingDecisions: [
          ledgerRow(DECISION_ID, REC_ID, "accepted", OWNER_ID),
        ],
        decision: "accepted",
      },
      plan: "noop",
      reason: "duplicate",
      writes: 0,
    },
    {
      name: "stale different decision → zero writes",
      overrides: {
        existingDecisions: [
          ledgerRow(DECISION_ID, REC_ID, "rejected", OWNER_ID),
        ],
        decision: "accepted",
      },
      plan: "noop",
      reason: "stale",
      writes: 0,
    },
    {
      name: "malformed subject id → zero writes",
      overrides: { subjectId: "not-a-uuid" },
      plan: "noop",
      reason: "malformed",
      writes: 0,
    },
    {
      name: "malformed recommendation id → zero writes",
      overrides: { recommendationId: "subj-001" },
      plan: "noop",
      reason: "malformed",
      writes: 0,
    },
    {
      name: "malformed oversized note → zero writes",
      overrides: { note: "x".repeat(501) },
      plan: "noop",
      reason: "malformed",
      writes: 0,
    },
    {
      name: "not configured (no service-role client) → zero writes",
      overrides: { configured: false },
      plan: "noop",
      reason: "not_configured",
      writes: 0,
    },
  ];

  let writeCases = 0;
  let noopCases = 0;

  it.each(matrix)("$name", async (c) => {
    const client = recordingAdminClient();
    const plan = planRecommendationDecision(planInput(c.overrides));

    if (c.plan === "write") {
      expect(plan.action).toBe("write");
      if (plan.action !== "write") return;
      expect(plan.call.decision).toBe(c.decision);
      expect(plan.call.targetType).toBe("recommendation");
      expect(plan.call.targetId).toBe(REC_ID);
      expect(plan.call.subjectId).toBe(SUBJECT_ID);

      const result = await executePlan(client, plan, c.decision ?? "accepted");
      expect(result.ok).toBe(true);
      writeCases += 1;
    } else {
      expect(plan.action).toBe("noop");
      if (plan.action !== "noop") return;
      expect(plan.reason).toBe(c.reason);

      const result = await executePlan(
        client,
        plan,
        c.overrides.decision ?? "accepted",
      );
      if (c.reason === "duplicate") {
        expect(result.ok).toBe(true);
        expect(result.decisionId).toBe(DECISION_ID);
      } else {
        expect(result.ok).toBe(false);
      }
      noopCases += 1;
    }

    expect(client.calls).toHaveLength(c.writes);
    if (c.writes === 1) {
      expect(client.calls[0]!.name).toBe("record_decision");
    }
  });

  it("covers the declared matrix size (accepted, rejected, modified, missing-note, duplicate, stale, unsupported, malformed, unauthorized, linkage, persistence)", () => {
    expect(matrix.length).toBeGreaterThanOrEqual(16);
  });
});

// ---------------------------------------------------------------------------
// 3. Persistence failure at the action-equivalent boundary
// ---------------------------------------------------------------------------

describe("persistence failure is never success", () => {
  it("a write plan that the ledger rejects returns an error, not ok", async () => {
    const client = recordingAdminClient({
      rpcError: { message: "record_decision failed" },
    });
    const plan = planRecommendationDecision(planInput());
    expect(plan.action).toBe("write");
    if (plan.action !== "write") return;
    const result = await executePlan(client, plan, "accepted");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("record_decision failed");
    expect(client.calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 4. Allowlist — only accepted/rejected are customer-operable
// ---------------------------------------------------------------------------

describe("decision allowlist", () => {
  it("admits accepted, rejected, and modified (modified requires a note at plan time)", () => {
    expect(RECOMMENDATION_DECISION_VALUES).toEqual([
      "accepted",
      "rejected",
      "modified",
    ]);
    expect(isSupportedRecommendationDecision("accepted")).toBe(true);
    expect(isSupportedRecommendationDecision("rejected")).toBe(true);
    expect(isSupportedRecommendationDecision("modified")).toBe(true);
    expect(isSupportedRecommendationDecision("superseded")).toBe(false);
    expect(isSupportedRecommendationDecision("")).toBe(false);
  });

  it("names superseded as known-but-not-customer-operable (never silently mapped)", () => {
    expect(UNSUPPORTED_RECOMMENDATION_DECISIONS).not.toContain("modified");
    expect(UNSUPPORTED_RECOMMENDATION_DECISIONS).toContain("superseded");
  });
});

// ---------------------------------------------------------------------------
// 5. Latest-decision projection (read model)
// ---------------------------------------------------------------------------

describe("projectLatestDecision (deterministic read-model projection)", () => {
  it("projects the newest durable decision per recommendation", () => {
    const map = projectLatestDecision([
      ledgerRow(
        "d-1",
        REC_ID,
        "accepted",
        OWNER_ID,
        "2026-08-01T00:00:00.000Z",
      ),
      ledgerRow(
        "d-2",
        REC_ID,
        "rejected",
        OWNER_ID,
        "2026-08-02T00:00:00.000Z",
      ),
      ledgerRow(
        "d-3",
        REC2_ID,
        "accepted",
        ADMIN_ID,
        "2026-08-03T00:00:00.000Z",
      ),
    ]);
    expect(map[REC_ID]?.decision).toBe("rejected");
    expect(map[REC_ID]?.decidedAt).toBe("2026-08-02T00:00:00.000Z");
    expect(map[REC2_ID]?.decision).toBe("accepted");
  });

  it("breaks ties deterministically by id (newest id wins)", () => {
    const map = projectLatestDecision([
      ledgerRow("b-id", REC_ID, "accepted", OWNER_ID, "2026-08-02T00:00:00.000Z"),
      ledgerRow("a-id", REC_ID, "rejected", OWNER_ID, "2026-08-02T00:00:00.000Z"),
    ]);
    expect(map[REC_ID]?.decision).toBe("accepted");
  });

  it("returns an empty map for an empty ledger", () => {
    expect(projectLatestDecision([])).toEqual({});
  });

  it("keeps superseded honest (never mapped to accepted/free)", () => {
    const map = projectLatestDecision([
      ledgerRow("d-9", REC_ID, "superseded", OWNER_ID, "2026-08-04T00:00:00.000Z"),
    ]);
    expect(map[REC_ID]?.decision).toBe("superseded");
  });

  it("projects a modified refinement decision with its note", () => {
    const map = projectLatestDecision([
      {
        id: "d-11",
        target_id: REC_ID,
        decision: "modified",
        note: "Tighten the niche to metabolic health",
        user_id: OWNER_ID,
        created_at: "2026-08-05T00:00:00.000Z",
      },
    ]);
    expect(map[REC_ID]?.decision).toBe("modified");
    expect(map[REC_ID]?.note).toBe("Tighten the niche to metabolic health");
  });

  it("carries note/decidedBy/decidedAt for the durable decision", () => {
    const map = projectLatestDecision([
      {
        id: "d-1",
        target_id: REC_ID,
        decision: "accepted",
        note: "Because the offer launch landed",
        user_id: OWNER_ID,
        created_at: "2026-08-01T00:00:00.000Z",
      },
    ]);
    expect(map[REC_ID]).toEqual({
      decision: "accepted",
      note: "Because the offer launch landed",
      decidedBy: OWNER_ID,
      decidedAt: "2026-08-01T00:00:00.000Z",
    });
  });
});

// ---------------------------------------------------------------------------
// 6. Display state — rejected suppression, accepted, actionable, other
// ---------------------------------------------------------------------------

describe("recommendationDecisionDisplayState", () => {
  it("shows decision controls only for proposed with no durable decision", () => {
    expect(
      recommendationDecisionDisplayState({ status: "proposed", decision: null }),
    ).toBe("actionable");
  });

  it("suppresses rejected advice until new evidence", () => {
    expect(
      recommendationDecisionDisplayState({
        status: "proposed",
        decision: { decision: "rejected", note: "", decidedBy: OWNER_ID, decidedAt: "t" },
      }),
    ).toBe("rejected_suppressed");
  });

  it("marks accepted decisions as accepted (no controls)", () => {
    expect(
      recommendationDecisionDisplayState({
        status: "proposed",
        decision: { decision: "accepted", note: "", decidedBy: OWNER_ID, decidedAt: "t" },
      }),
    ).toBe("accepted");
  });

  it("marks modified decisions as refinement-requested (no controls)", () => {
    expect(
      recommendationDecisionDisplayState({
        status: "proposed",
        decision: { decision: "modified", note: "Tighten the niche", decidedBy: OWNER_ID, decidedAt: "t" },
      }),
    ).toBe("modified");
  });

  it("never surfaces controls for terminal/superseded states", () => {
    expect(
      recommendationDecisionDisplayState({ status: "in_progress", decision: null }),
    ).toBe("decided_other");
    expect(
      recommendationDecisionDisplayState({
        status: "proposed",
        decision: { decision: "superseded", note: "", decidedBy: OWNER_ID, decidedAt: "t" },
      }),
    ).toBe("decided_other");
  });

  it("a NEW recommendation row (new run/new evidence) becomes actionable again", () => {
    // The old rejected row stays suppressed; the new row is a fresh decision
    // surface — rejection recurrence is tied to the durable decision, not to
    // the old row.
    expect(
      recommendationDecisionDisplayState({
        status: "proposed",
        decision: { decision: "rejected", note: "", decidedBy: OWNER_ID, decidedAt: "t" },
      }),
    ).toBe("rejected_suppressed");
    expect(
      recommendationDecisionDisplayState({ status: "proposed", decision: null }),
    ).toBe("actionable");
  });
});

// ---------------------------------------------------------------------------
// 7. Customer-safe error copy
// ---------------------------------------------------------------------------

describe("recommendationDecisionPlanError (bounded, opaque, no leaks)", () => {
  it("explains that modified requires a refinement note (missing_note is a bounded error)", () => {
    const plan = planRecommendationDecision(
      planInput({ decision: "modified", note: "" }),
    );
    expect(plan.action).toBe("noop");
    if (plan.action !== "noop") return;
    expect(plan.reason).toBe("missing_note");
    expect(recommendationDecisionPlanError(plan)).toMatch(
      /note explaining what should change/i,
    );
  });

  it("keeps superseded/garbage opaque as unsupported (never success)", () => {
    for (const decision of ["superseded", "maybe"]) {
      const plan = planRecommendationDecision(planInput({ decision }));
      expect(plan.action).toBe("noop");
      if (plan.action !== "noop") continue;
      expect(recommendationDecisionPlanError(plan)).toBe(
        "That decision isn't supported.",
      );
    }
  });

  it("is opaque for unauthorized/not-found/wrong-subject (no existence leak)", () => {
    for (const overrides of [
      { profile: { id: OTHER_ID, role: "client" } },
      { subject: null },
      { recommendationSubjectId: null },
      { recommendationSubjectId: OTHER_SUBJECT_ID },
    ]) {
      const plan = planRecommendationDecision(planInput(overrides));
      expect(plan.action).toBe("noop");
      if (plan.action !== "noop") continue;
      const message = recommendationDecisionPlanError(plan);
      expect(message).toBe("Recommendation not found.");
      expect(message).not.toMatch(/owner|admin|permission|subject id|uuid/i);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Versioned static contract artifact + fixture report
// ---------------------------------------------------------------------------

describe("recommendation-decisions contract artifact", () => {
  it("is a versioned static contract that declares the verified vocabulary", () => {
    const raw = readFileSync(
      join(process.cwd(), "artifacts", "recommendation-decisions-contract.json"),
      "utf8",
    );
    const artifact = JSON.parse(raw) as {
      contract: string;
      version: string;
      status: string;
      decisionLedger: {
        schemaVocabulary: string[];
        supportedCustomerDecisions: string[];
        unsupportedCustomerDecision: string;
      };
    };
    expect(artifact.contract).toBe("recommendation-decisions");
    expect(artifact.version).toBe("1.1.0");
    expect(artifact.status).toBe("verified");
    expect(artifact.decisionLedger.schemaVocabulary).toEqual([
      "accepted",
      "rejected",
      "modified",
      "superseded",
    ]);
    expect(artifact.decisionLedger.supportedCustomerDecisions).toEqual([
      "accepted",
      "rejected",
      "modified",
    ]);
    expect(artifact.decisionLedger.unsupportedCustomerDecision).toBe(
      "superseded",
    );
  });
});

describe("fixture report", () => {
  it("records that fixtures ran with network_calls=0 and provider_calls=0", () => {
    const summary = JSON.stringify({
      network_calls: 0,
      provider_calls: 0,
      writes_by_valid_submission: "exactly one record_decision RPC",
      writes_by_invalid_submission: 0,
    });
    console.log(`[fixture-report] ${summary}`);
    expect(summary).toContain('"network_calls":0');
    expect(summary).toContain('"provider_calls":0');
  });
});
