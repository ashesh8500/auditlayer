import { describe, expect, it } from "vitest";

import {
  AUDIT_STATUSES,
  BLOCK_NOTE_MIN_LENGTH,
  FOUNDER_NOTE_MAX_LENGTH,
  FOUNDER_TRANSITION_ACTIONS,
  FOUNDER_TRANSITION_MATRIX,
  boundFounderNote,
  canTransition,
  executeFounderTransition,
  type AuditStatus,
  type FounderTransitionAction,
  type TransitionResult,
  type TransitionRpcCall,
} from "./admin-audit-transitions";

// ---------------------------------------------------------------------------
// Recording adapter fixture.
//
// Simulates the canonical `founder_transition_audit` RPC boundary against an
// in-memory audit store: it validates the founder actor, locks and compares the
// current status, resolves the transition against the matrix, bounds the note,
// and records every write it would perform (status update and event insert).
// The fixture never performs real network/DB writes; it records what the
// canonical path WOULD write, so tests can prove one-write/one-event on valid
// cases and zero writes on every rejection.
// ---------------------------------------------------------------------------
interface FixtureAudit {
  status: AuditStatus;
  admin_notes: string;
}

interface RecordedWrite {
  kind: "audit_update" | "audit_event_insert";
  auditId: string;
  statusBefore?: string;
  statusAfter?: string;
  eventType?: string;
  phase?: string | null;
  detail?: string;
}

class RecordingTransitionFixture {
  audits = new Map<string, FixtureAudit>();
  adminIds = new Set<string>();
  writes: RecordedWrite[] = [];
  rpcCalls: Array<{ p_audit_id: string; p_action: string; p_actor_id: string; p_note: string }> = [];

  constructor(
    audits: Record<string, FixtureAudit>,
    adminIds: string[],
  ) {
    for (const [id, audit] of Object.entries(audits)) this.audits.set(id, { ...audit });
    for (const id of adminIds) this.adminIds.add(id);
  }

  rpc: TransitionRpcCall = async (args) => {
    this.rpcCalls.push(args);
    const audit = this.audits.get(args.p_audit_id);

    // Actor authority.
    if (!this.adminIds.has(args.p_actor_id)) {
      return {
        data: { ok: false, code: "unauthorized", message: "Founder role required for audit transitions." },
        error: null,
      };
    }
    // Supported action.
    if (!FOUNDER_TRANSITION_ACTIONS.includes(args.p_action as FounderTransitionAction)) {
      return {
        data: { ok: false, code: "unsupported_action", message: `Unsupported founder action: ${args.p_action}.` },
        error: null,
      };
    }
    // Missing audit.
    if (!audit) {
      return { data: { ok: false, code: "audit_not_found", message: "Audit not found." }, error: null };
    }

    const statusBefore = audit.status;
    const note = boundFounderNote(args.p_note);

    // Matrix resolution — mirrors the SQL RPC exactly.
    if (args.p_action === "approve" && (statusBefore === "needs_review" || statusBefore === "blocked")) {
      return this.apply(args.p_audit_id, statusBefore, "queued", "audit_approved", "approved", note || "Approved by founder");
    }
    if (args.p_action === "requeue" && (statusBefore === "failed" || statusBefore === "ready")) {
      return this.apply(args.p_audit_id, statusBefore, "queued", "audit_requeued", "queued", "Re-queued by founder");
    }
    if (args.p_action === "block" && (statusBefore === "needs_review" || statusBefore === "queued" || statusBefore === "running")) {
      if (note.length < BLOCK_NOTE_MIN_LENGTH) {
        return {
          data: { ok: false, code: "note_required", message: "Blocking requires a clear note.", status_before: statusBefore, status_after: null },
          error: null,
        };
      }
      return this.apply(args.p_audit_id, statusBefore, "blocked", "audit_blocked", "failed", note, note);
    }
    return {
      data: { ok: false, code: "invalid_transition", message: `Transition ${args.p_action} is not allowed from status ${statusBefore}.`, status_before: statusBefore, status_after: null },
      error: null,
    };
  };

  private apply(
    auditId: string,
    statusBefore: AuditStatus,
    statusAfter: string,
    eventType: string,
    phase: string,
    detail: string,
    blockNote?: string,
  ) {
    const audit = this.audits.get(auditId)!;
    // Exactly one status change.
    this.writes.push({ kind: "audit_update", auditId, statusBefore, statusAfter });
    audit.status = statusAfter as AuditStatus;
    if (blockNote) {
      audit.admin_notes = [audit.admin_notes, `Blocked: ${blockNote}`].filter(Boolean).join("\n");
    }
    // Exactly one matching founder event.
    this.writes.push({ kind: "audit_event_insert", auditId, eventType, phase, detail });
    return {
      data: {
        ok: true,
        code: "ok",
        status_before: statusBefore,
        status_after: statusAfter,
        event_type: eventType,
        phase,
        detail,
      },
      error: null,
    };
  }

  statusOf(auditId: string): AuditStatus | undefined {
    return this.audits.get(auditId)?.status;
  }

  writeCounts() {
    const updates = this.writes.filter((w) => w.kind === "audit_update").length;
    const events = this.writes.filter((w) => w.kind === "audit_event_insert").length;
    return { updates, events, total: this.writes.length };
  }
}

const ADMIN = "00000000-0000-0000-0000-0000000000aa";
const NON_ADMIN = "00000000-0000-0000-0000-0000000000bb";
const AUDIT = "11111111-1111-1111-1111-111111111111";
const OTHER_AUDIT = "22222222-2222-2222-2222-222222222222";

function fixtureAudits(): Record<string, FixtureAudit> {
  return {
    [AUDIT]: { status: "needs_review", admin_notes: "" },
    [OTHER_AUDIT]: { status: "failed", admin_notes: "" },
  };
}

// ---------------------------------------------------------------------------
describe("canonical matrix", () => {
  const expected: Record<FounderTransitionAction, Partial<Record<AuditStatus, { target: AuditStatus }>>> = {
    approve: {
      needs_review: { target: "queued" },
      blocked: { target: "queued" },
    },
    requeue: {
      failed: { target: "queued" },
      ready: { target: "queued" },
    },
    block: {
      needs_review: { target: "blocked" },
      queued: { target: "blocked" },
      running: { target: "blocked" },
    },
  };

  it("declares only the canonical action and status vocabularies", () => {
    expect(FOUNDER_TRANSITION_ACTIONS).toEqual(["approve", "requeue", "block"]);
    expect(AUDIT_STATUSES).toEqual([
      "draft",
      "queued",
      "running",
      "ready",
      "needs_review",
      "blocked",
      "failed",
    ]);
  });

  it("covers every expected action×status pair as allowed", () => {
    for (const action of FOUNDER_TRANSITION_ACTIONS) {
      for (const [status, spec] of Object.entries(expected[action])) {
        const decision = canTransition(action, status);
        expect(decision.allowed, `${action} from ${status}`).toBe(true);
        expect(decision.spec?.target, `${action} target from ${status}`).toBe(spec.target);
      }
    }
  });

  it("rejects every non-declared pair with a deterministic rejection", () => {
    for (const action of FOUNDER_TRANSITION_ACTIONS) {
      for (const status of AUDIT_STATUSES) {
        const expectedAllowed = status in (expected[action] ?? {});
        const decision = canTransition(action, status);
        expect(decision.allowed, `${action} from ${status}`).toBe(expectedAllowed);
        if (!expectedAllowed) {
          expect(decision.code).toBe("invalid_transition");
          expect(decision.tip).toContain(action);
          expect(decision.tip).toContain(status);
        }
      }
    }
  });

  it("rejects unsupported actions and unknown statuses fail closed", () => {
    const unsupported = canTransition("publish", "queued");
    expect(unsupported.allowed).toBe(false);
    expect(unsupported.code).toBe("unsupported_action");

    const unknown = canTransition("approve", "interstellar");
    expect(unknown.allowed).toBe(false);
    expect(unknown.code).toBe("unknown_status");
  });

  it("block rejects terminal success, terminal failure, already-blocked, and draft", () => {
    for (const status of ["ready", "failed", "blocked", "draft"] as AuditStatus[]) {
      expect(canTransition("block", status).allowed, `block from ${status}`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
describe("note bounds and redaction", () => {
  it("strips control characters and collapses whitespace runs", () => {
    expect(boundFounderNote("  first\tsecond  \n third ")).toBe("first second third");
    expect(boundFounderNote("a\u0000b\u0007c")).toBe("abc");
  });

  it("caps the note at the declared maximum", () => {
    const long = "x".repeat(FOUNDER_NOTE_MAX_LENGTH + 50);
    expect(boundFounderNote(long).length).toBe(FOUNDER_NOTE_MAX_LENGTH);
  });

  it("keeps the block minimum length constant aligned", () => {
    expect(BLOCK_NOTE_MIN_LENGTH).toBe(4);
    expect(boundFounderNote("abc").length).toBeLessThan(BLOCK_NOTE_MIN_LENGTH);
  });
});

// ---------------------------------------------------------------------------
describe("recording adapter fixture — atomic write/event contract", () => {
  it("approve from needs_review writes exactly one status change and one founder event", async () => {
    const fixture = new RecordingTransitionFixture(fixtureAudits(), [ADMIN]);
    const result = await executeFounderTransition(fixture.rpc, {
      action: "approve",
      auditId: AUDIT,
      actorId: ADMIN,
      note: "looks good",
      currentStatus: "needs_review",
    });
    expect(result).toMatchObject({ ok: true, code: "ok", statusBefore: "needs_review", statusAfter: "queued", eventType: "audit_approved" });
    const counts = fixture.writeCounts();
    expect(counts).toEqual({ updates: 1, events: 1, total: 2 });
    expect(fixture.statusOf(AUDIT)).toBe("queued");
  });

  it("approve from blocked unblocks to queued", async () => {
    const audits = fixtureAudits();
    audits[AUDIT].status = "blocked";
    const fixture = new RecordingTransitionFixture(audits, [ADMIN]);
    const result = await executeFounderTransition(fixture.rpc, {
      action: "approve",
      auditId: AUDIT,
      actorId: ADMIN,
      currentStatus: "blocked",
    });
    expect(result.ok).toBe(true);
    expect(fixture.statusOf(AUDIT)).toBe("queued");
    expect(fixture.writeCounts()).toEqual({ updates: 1, events: 1, total: 2 });
  });

  it("requeue from failed writes one status change and one requeue event", async () => {
    const fixture = new RecordingTransitionFixture(fixtureAudits(), [ADMIN]);
    const result = await executeFounderTransition(fixture.rpc, {
      action: "requeue",
      auditId: OTHER_AUDIT,
      actorId: ADMIN,
      currentStatus: "failed",
    });
    expect(result).toMatchObject({ ok: true, code: "ok", statusBefore: "failed", statusAfter: "queued", eventType: "audit_requeued", phase: "queued" });
    expect(fixture.writeCounts()).toEqual({ updates: 1, events: 1, total: 2 });
  });

  it("requeue from ready re-queues a completed audit", async () => {
    const audits = fixtureAudits();
    audits[AUDIT].status = "ready";
    const fixture = new RecordingTransitionFixture(audits, [ADMIN]);
    const result = await executeFounderTransition(fixture.rpc, {
      action: "requeue",
      auditId: AUDIT,
      actorId: ADMIN,
      currentStatus: "ready",
    });
    expect(result.ok).toBe(true);
    expect(fixture.statusOf(AUDIT)).toBe("queued");
    expect(fixture.writeCounts()).toEqual({ updates: 1, events: 1, total: 2 });
  });

  it("block from needs_review/queued/running writes one status change and one blocked event with the note", async () => {
    for (const status of ["needs_review", "queued", "running"] as AuditStatus[]) {
      const audits = fixtureAudits();
      audits[AUDIT].status = status;
      const fixture = new RecordingTransitionFixture(audits, [ADMIN]);
      const result = await executeFounderTransition(fixture.rpc, {
        action: "block",
        auditId: AUDIT,
        actorId: ADMIN,
        note: "customer disputed the handle",
        currentStatus: status,
      });
      expect(result.ok, `block from ${status}`).toBe(true);
      expect(result.statusAfter).toBe("blocked");
      expect(fixture.statusOf(AUDIT)).toBe("blocked");
      expect(fixture.writeCounts()).toEqual({ updates: 1, events: 1, total: 2 });
      const event = fixture.writes.find((w) => w.kind === "audit_event_insert");
      expect(event?.eventType).toBe("audit_blocked");
      expect(event?.phase).toBe("failed");
    }
  });

  it("block requires a clear note and performs zero writes without one", async () => {
    const fixture = new RecordingTransitionFixture(fixtureAudits(), [ADMIN]);
    const result = await executeFounderTransition(fixture.rpc, {
      action: "block",
      auditId: AUDIT,
      actorId: ADMIN,
      note: "x",
      currentStatus: "needs_review",
    });
    expect(result).toMatchObject({ ok: false, code: "note_required" });
    expect(fixture.writeCounts()).toEqual({ updates: 0, events: 0, total: 0 });
    expect(fixture.statusOf(AUDIT)).toBe("needs_review");
  });
});

// ---------------------------------------------------------------------------
describe("recording adapter fixture — fail-closed zero-write rejections", () => {
  it("duplicate approve after the row is already queued performs zero writes", async () => {
    const fixture = new RecordingTransitionFixture(fixtureAudits(), [ADMIN]);
    const first = await executeFounderTransition(fixture.rpc, {
      action: "approve",
      auditId: AUDIT,
      actorId: ADMIN,
      currentStatus: "needs_review",
    });
    expect(first.ok).toBe(true);
    const before = fixture.writeCounts();

    const duplicate = await executeFounderTransition(fixture.rpc, {
      action: "approve",
      auditId: AUDIT,
      actorId: ADMIN,
      currentStatus: "needs_review", // client still shows the stale state
    });
    expect(duplicate.ok).toBe(false);
    expect(duplicate.code).toBe("invalid_transition");
    expect(fixture.writeCounts()).toEqual(before);
    expect(fixture.statusOf(AUDIT)).toBe("queued");
  });

  it("stale submission (server status differs from client projection) performs zero writes", async () => {
    const fixture = new RecordingTransitionFixture(fixtureAudits(), [ADMIN]);
    // Server row already moved to running while the client still shows needs_review.
    fixture.audits.get(AUDIT)!.status = "running";
    const result = await executeFounderTransition(fixture.rpc, {
      action: "approve",
      auditId: AUDIT,
      actorId: ADMIN,
      currentStatus: "needs_review",
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("invalid_transition");
    expect(fixture.writeCounts()).toEqual({ updates: 0, events: 0, total: 0 });
    expect(fixture.statusOf(AUDIT)).toBe("running");
  });

  it("missing audit returns audit_not_found with zero writes", async () => {
    const fixture = new RecordingTransitionFixture(fixtureAudits(), [ADMIN]);
    const result = await executeFounderTransition(fixture.rpc, {
      action: "approve",
      auditId: "99999999-9999-9999-9999-999999999999",
      actorId: ADMIN,
      currentStatus: "needs_review",
    });
    expect(result).toMatchObject({ ok: false, code: "audit_not_found" });
    expect(fixture.writeCounts()).toEqual({ updates: 0, events: 0, total: 0 });
  });

  it("unsupported action performs zero writes and returns unsupported_action", async () => {
    const fixture = new RecordingTransitionFixture(fixtureAudits(), [ADMIN]);
    const result = await executeFounderTransition(fixture.rpc, {
      action: "publish" as unknown as FounderTransitionAction,
      auditId: AUDIT,
      actorId: ADMIN,
      currentStatus: "needs_review",
    });
    expect(result).toMatchObject({ ok: false, code: "unsupported_action" });
    expect(fixture.writeCounts()).toEqual({ updates: 0, events: 0, total: 0 });
    expect(fixture.rpcCalls).toHaveLength(0); // rejected before any RPC boundary call
  });

  it("unauthorized actor performs zero writes and returns unauthorized", async () => {
    const fixture = new RecordingTransitionFixture(fixtureAudits(), [ADMIN]);
    const result = await executeFounderTransition(fixture.rpc, {
      action: "approve",
      auditId: AUDIT,
      actorId: NON_ADMIN,
      currentStatus: "needs_review",
    });
    expect(result).toMatchObject({ ok: false, code: "unauthorized" });
    expect(fixture.writeCounts()).toEqual({ updates: 0, events: 0, total: 0 });
  });

  it("wrong current status for a valid action performs zero writes", async () => {
    const fixture = new RecordingTransitionFixture(fixtureAudits(), [ADMIN]);
    const result = await executeFounderTransition(fixture.rpc, {
      action: "approve",
      auditId: OTHER_AUDIT, // failed
      actorId: ADMIN,
      currentStatus: "failed",
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("invalid_transition");
    expect(fixture.writeCounts()).toEqual({ updates: 0, events: 0, total: 0 });
  });

  it("server-action path without a client status is decided by the RPC, not rejected locally", async () => {
    const fixture = new RecordingTransitionFixture(fixtureAudits(), [ADMIN]);
    // approveAudit/requeueAudit/blockAudit pass only the audit id, no
    // client-observed status. The adapter must not reject on unknown status;
    // the RPC compares against the locked row.
    const result = await executeFounderTransition(fixture.rpc, {
      action: "approve",
      auditId: AUDIT,
      actorId: ADMIN,
      note: "founder cleared it",
    });
    expect(result.ok).toBe(true);
    expect(result.statusAfter).toBe("queued");
    expect(fixture.rpcCalls).toHaveLength(1);
    expect(fixture.writeCounts()).toEqual({ updates: 1, events: 1, total: 2 });

    // And the stale duplicate of that same server-action call fails closed
    // against the already-moved row with zero additional writes.
    const duplicate = await executeFounderTransition(fixture.rpc, {
      action: "approve",
      auditId: AUDIT,
      actorId: ADMIN,
      note: "founder cleared it",
    });
    expect(duplicate.ok).toBe(false);
    expect(duplicate.code).toBe("invalid_transition");
    expect(fixture.writeCounts()).toEqual({ updates: 1, events: 1, total: 2 });
  });

  it("server-action block path enforces the note minimum even without a client status", async () => {
    const fixture = new RecordingTransitionFixture(fixtureAudits(), [ADMIN]);
    const result = await executeFounderTransition(fixture.rpc, {
      action: "block",
      auditId: AUDIT,
      actorId: ADMIN,
      note: "no",
    });
    expect(result).toMatchObject({ ok: false, code: "note_required" });
    expect(fixture.rpcCalls).toHaveLength(0);
    expect(fixture.writeCounts()).toEqual({ updates: 0, events: 0, total: 0 });
  });
});

// ---------------------------------------------------------------------------
describe("adapter composition", () => {
  it("bounds the note before the RPC boundary sees it", async () => {
    const fixture = new RecordingTransitionFixture(fixtureAudits(), [ADMIN]);
    const longNote = `\u0000  ${"y".repeat(FOUNDER_NOTE_MAX_LENGTH + 10)}  \u0007`;
    await executeFounderTransition(fixture.rpc, {
      action: "block",
      auditId: AUDIT,
      actorId: ADMIN,
      note: longNote,
      currentStatus: "needs_review",
    });
    expect(fixture.rpcCalls).toHaveLength(1);
    const sent = fixture.rpcCalls[0];
    expect(sent.p_note.length).toBeLessThanOrEqual(FOUNDER_NOTE_MAX_LENGTH);
    expect(sent.p_note).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/);
  });

  it("maps a malformed RPC response to a bounded fail-closed result", async () => {
    const rpc: TransitionRpcCall = async () => ({ data: null, error: null });
    const result = await executeFounderTransition(rpc, {
      action: "approve",
      auditId: AUDIT,
      actorId: ADMIN,
      currentStatus: "needs_review",
    });
    expect(result).toMatchObject({ ok: false, code: "rpc_error" });
  });

  it("maps an RPC transport error to rpc_error without inventing success", async () => {
    const rpc: TransitionRpcCall = async () => ({ data: null, error: { message: "connection refused" } });
    const result = await executeFounderTransition(rpc, {
      action: "approve",
      auditId: AUDIT,
      actorId: ADMIN,
      currentStatus: "needs_review",
    });
    expect(result).toMatchObject({ ok: false, code: "rpc_error", message: "connection refused" });
  });

  it("exposes the matrix as deterministic vocabulary for the artifact", () => {
    const snapshot = JSON.stringify(FOUNDER_TRANSITION_MATRIX);
    expect(snapshot).toContain('"audit_approved"');
    expect(snapshot).toContain('"audit_requeued"');
    expect(snapshot).toContain('"audit_blocked"');
    expect(JSON.stringify(FOUNDER_TRANSITION_MATRIX)).toBe(snapshot);
  });

  it("the committed artifact matches the code matrix (drift guard)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const artifactPath = path.resolve(
      __dirname,
      "../../artifacts/founder-audit-transition-contract.json",
    );
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as {
      action_matrix: Record<
        FounderTransitionAction,
        Partial<Record<AuditStatus, { to: string; event_type: string; phase: string }>>
      >;
      provider_calls: number;
      no_environment_path: boolean;
      no_timestamp: boolean;
      no_customer_data: boolean;
      no_secret_values: boolean;
    };

    // Every action×source in the code matrix is recorded in the artifact.
    for (const action of FOUNDER_TRANSITION_ACTIONS) {
      for (const [status, spec] of Object.entries(FOUNDER_TRANSITION_MATRIX[action])) {
        const recorded = artifact.action_matrix[action][status as AuditStatus];
        expect(recorded, `${action} from ${status} recorded`).toBeDefined();
        expect(recorded?.to, `${action} target`).toBe(spec.target);
        expect(recorded?.event_type, `${action} event`).toBe(spec.eventType);
        expect(recorded?.phase, `${action} phase`).toBe(spec.phase);
      }
      // No artifact entry that the code matrix does not declare.
      for (const [status, recorded] of Object.entries(artifact.action_matrix[action] ?? {})) {
        expect(
          FOUNDER_TRANSITION_MATRIX[action][status as AuditStatus],
          `${action} from ${status} declared in code`,
        ).toBeDefined();
        expect(recorded).toBeDefined();
      }
    }

    // Deterministic no-secret/no-live markers.
    expect(artifact.provider_calls).toBe(0);
    expect(artifact.no_environment_path).toBe(true);
    expect(artifact.no_timestamp).toBe(true);
    expect(artifact.no_customer_data).toBe(true);
    expect(artifact.no_secret_values).toBe(true);
    const raw = fs.readFileSync(artifactPath, "utf8");
    expect(raw).not.toMatch(/\/home\/|SECRET|SERVICE_ROLE/);
  });
});

// Keep TypeScript honest about the result shape used by server actions.
const _resultShape: TransitionResult = {
  ok: false,
  code: "invalid_transition",
  message: "",
  statusBefore: null,
  statusAfter: null,
  eventType: null,
};
void _resultShape;
