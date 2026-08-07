/**
 * Canonical founder audit-recovery transition vocabulary (ALM-I-017).
 *
 * Approve / requeue / block are the three founder recovery actions over the
 * existing `audits` state machine. This module is the single pure typed source
 * of that vocabulary used by:
 *   - the founder server actions (canonical compare-and-transition path via
 *     the `founder_transition_audit` RPC),
 *   - the admin client controls (presentation projections of the matrix only —
 *     never mutation authority), and
 *   - deterministic fixtures that record every write the transition path would
 *     perform.
 *
 * The database RPC is authoritative: it locks the current audit row, validates
 * the founder actor, re-validates the transition against this same matrix,
 * bounds/redacts the note, changes status exactly once, and inserts exactly one
 * matching founder `audit_events` row in the same transaction. This module
 * cannot change state by itself; it only describes and composes the boundary.
 *
 * Fixtures verify software contracts; they do not prove live concurrency,
 * migration success, or founder comprehension.
 */

import type { AuditEventPhase } from "@/lib/domain";

// ---------------------------------------------------------------------------
// Canonical audit status vocabulary (mirrors docs/architecture-contract.md and
// web/src/lib/domain.ts — do not extend here).
// ---------------------------------------------------------------------------
export const AUDIT_STATUSES = [
  "draft",
  "queued",
  "running",
  "ready",
  "needs_review",
  "blocked",
  "failed",
] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];

// ---------------------------------------------------------------------------
// Founder recovery actions.
// ---------------------------------------------------------------------------
export const FOUNDER_TRANSITION_ACTIONS = ["approve", "requeue", "block"] as const;
export type FounderTransitionAction = (typeof FOUNDER_TRANSITION_ACTIONS)[number];

// ---------------------------------------------------------------------------
// Note bounds shared with the RPC (the RPC enforces these authoritatively).
// ---------------------------------------------------------------------------
export const FOUNDER_NOTE_MAX_LENGTH = 500;
export const BLOCK_NOTE_MIN_LENGTH = 4;

/** Strip control characters, collapse whitespace runs, trim, cap length. */
export function boundFounderNote(note: string): string {
  const cleaned = note
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t\r\n]+/g, " ")
    .trim();
  return cleaned.slice(0, FOUNDER_NOTE_MAX_LENGTH);
}

// ---------------------------------------------------------------------------
// Transition matrix — action × current-status → target + event vocabulary.
//
// approve: needs_review/blocked → queued (founder clears an audit to run).
// requeue: failed/ready → queued (recovery after terminal failure or a rerun).
// block:   needs_review/queued/running → blocked (founder stops an actionable
//          audit). Terminal success (ready), terminal failure (failed),
//          already-blocked (blocked), and pre-submission draft are rejected.
// ---------------------------------------------------------------------------
export interface TransitionSpec {
  target: AuditStatus;
  eventType: string;
  phase: AuditEventPhase | null;
  /** Default event detail when no note is supplied (approve/requeue). */
  defaultDetail: string;
  /** Block requires a clear founder note. */
  noteRequired: boolean;
}

export const FOUNDER_TRANSITION_MATRIX: Record<
  FounderTransitionAction,
  Partial<Record<AuditStatus, TransitionSpec>>
> = {
  approve: {
    needs_review: {
      target: "queued",
      eventType: "audit_approved",
      phase: "approved",
      defaultDetail: "Approved by founder",
      noteRequired: false,
    },
    blocked: {
      target: "queued",
      eventType: "audit_approved",
      phase: "approved",
      defaultDetail: "Approved by founder",
      noteRequired: false,
    },
  },
  requeue: {
    failed: {
      target: "queued",
      eventType: "audit_requeued",
      phase: "queued",
      defaultDetail: "Re-queued by founder",
      noteRequired: false,
    },
    ready: {
      target: "queued",
      eventType: "audit_requeued",
      phase: "queued",
      defaultDetail: "Re-queued by founder",
      noteRequired: false,
    },
  },
  block: {
    needs_review: {
      target: "blocked",
      eventType: "audit_blocked",
      phase: "failed",
      defaultDetail: "",
      noteRequired: true,
    },
    queued: {
      target: "blocked",
      eventType: "audit_blocked",
      phase: "failed",
      defaultDetail: "",
      noteRequired: true,
    },
    running: {
      target: "blocked",
      eventType: "audit_blocked",
      phase: "failed",
      defaultDetail: "",
      noteRequired: true,
    },
  },
};

export type TransitionRejectionCode =
  | "unsupported_action"
  | "invalid_transition"
  | "unknown_status";

export interface TransitionDecision {
  allowed: boolean;
  spec?: TransitionSpec;
  code?: TransitionRejectionCode;
  tip?: string;
}

/**
 * Pure projection used by presentation and pre-flight checks. Never the
 * mutation authority — the RPC re-validates every transition against the
 * locked row.
 */
export function canTransition(
  action: string,
  currentStatus: string,
): TransitionDecision {
  if (!FOUNDER_TRANSITION_ACTIONS.includes(action as FounderTransitionAction)) {
    return {
      allowed: false,
      code: "unsupported_action",
      tip: `Unsupported founder action: ${action}.`,
    };
  }
  if (!AUDIT_STATUSES.includes(currentStatus as AuditStatus)) {
    return {
      allowed: false,
      code: "unknown_status",
      tip: `Unknown audit status: ${currentStatus}.`,
    };
  }
  const spec = FOUNDER_TRANSITION_MATRIX[action as FounderTransitionAction][
    currentStatus as AuditStatus
  ];
  if (!spec) {
    return {
      allowed: false,
      code: "invalid_transition",
      tip: `${action} is not allowed from status ${currentStatus}.`,
    };
  }
  return { allowed: true, spec };
}

// ---------------------------------------------------------------------------
// Structured, bounded transition result vocabulary (mirrors the RPC jsonb).
// ---------------------------------------------------------------------------
export type TransitionResultCode =
  | "ok"
  | "unauthorized"
  | "audit_not_found"
  | "unsupported_action"
  | "invalid_transition"
  | "stale_status"
  | "note_required"
  | "rpc_error";

export interface TransitionResult {
  ok: boolean;
  code: TransitionResultCode;
  message: string;
  statusBefore?: string | null;
  statusAfter?: string | null;
  eventType?: string | null;
  phase?: string | null;
}

export interface FounderTransitionInput {
  action: FounderTransitionAction;
  auditId: string;
  actorId: string;
  note?: string;
  /** Client-observed status for a presentation pre-check. Never authority. */
  currentStatus?: string;
}

/** Minimal structural RPC boundary so tests can inject a recording fixture. */
export type TransitionRpcCall = (args: {
  p_audit_id: string;
  p_action: string;
  p_actor_id: string;
  p_note: string;
}) => Promise<{ data: unknown; error: { message: string } | null }>;

function normalizeRpcResult(data: unknown): TransitionResult {
  if (typeof data !== "object" || data === null) {
    return { ok: false, code: "rpc_error", message: "Transition RPC returned no result." };
  }
  const row = data as Record<string, unknown>;
  const ok = row.ok === true;
  const code = (row.code as TransitionResultCode) ?? (ok ? "ok" : "rpc_error");
  return {
    ok,
    code,
    message: typeof row.message === "string" ? row.message : "",
    statusBefore: row.status_before == null ? null : String(row.status_before),
    statusAfter: row.status_after == null ? null : String(row.status_after),
    eventType: row.event_type == null ? null : String(row.event_type),
    phase: row.phase == null ? null : String(row.phase),
  };
}

/**
 * Execute one founder transition through the canonical compare-and-transition
 * path. Pre-flight matrix/note checks are presentation-only conveniences; the
 * RPC (the injected `rpc` call) is the authority and performs the atomic
 * status+event write. Every rejection returns a bounded structured result and
 * performs zero writes.
 */
export async function executeFounderTransition(
  rpc: TransitionRpcCall,
  input: FounderTransitionInput,
): Promise<TransitionResult> {
  const note = boundFounderNote(input.note ?? "");
  // Block always requires a clear note, independent of client-observed status.
  if (input.action === "block" && note.length < BLOCK_NOTE_MIN_LENGTH) {
    return {
      ok: false,
      code: "note_required",
      message: "Blocking requires a clear note.",
      statusBefore: input.currentStatus ?? null,
      statusAfter: null,
    };
  }

  // Presentation pre-check only when the caller knows the client-observed
  // status. It is never authority: the RPC re-validates every transition
  // against the locked row, and unknown-status callers (server actions with
  // only an audit id) are decided entirely by the database.
  if (input.currentStatus !== undefined) {
    const decision = canTransition(input.action, input.currentStatus);
    if (!decision.allowed) {
      return {
        ok: false,
        code:
          decision.code === "unsupported_action" ? "unsupported_action" : "invalid_transition",
        message: decision.tip ?? "Transition rejected.",
        statusBefore: input.currentStatus,
        statusAfter: null,
      };
    }
  }

  const { data, error } = await rpc({
    p_audit_id: input.auditId,
    p_action: input.action,
    p_actor_id: input.actorId,
    p_note: note,
  });

  if (error) {
    return {
      ok: false,
      code: "rpc_error",
      message: error.message,
      statusBefore: input.currentStatus ?? null,
      statusAfter: null,
    };
  }
  return normalizeRpcResult(data);
}
