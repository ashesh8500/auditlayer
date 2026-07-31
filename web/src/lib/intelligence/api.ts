/**
 * Assumed kernel API contracts for the product layer.
 *
 * Kernel owns the migrations/RPCs (service-role). Until types regenerate and
 * migrations land on this branch, product code talks through these typed
 * adapters. Callers may pass a real Supabase RPC client or use the fixture
 * stub mode for UI/typecheck without live schema.
 *
 * Assumed tables (kernel):
 *   subjects, subject_channels, living_brief_versions,
 *   context_update_proposals, audit_batches, batch_audits,
 *   intelligence_runs, evidence, evidence_snapshots, scores,
 *   findings, recommendations, decisions
 *
 * Assumed service-role RPCs (kernel):
 *   create_subject(p_user_id, p_name, p_subject_type) → uuid
 *   link_subject_channel(p_subject_id, p_channel_type, p_locator, p_managed, p_account_id) → uuid
 *   record_living_brief_version(...) → uuid
 *   resolve_context_update_proposal(p_proposal_id, p_status, p_decided_by) → void
 *   submit_audit_batch(p_user_id, p_subject_id, p_idempotency_key, p_audit_ids) → uuid
 *
 * Product-facing submit path (assumed app RPC / server action):
 *   prepare_and_submit_batch — creates audits for selected channels, then
 *   calls submit_audit_batch atomically. Returns { batchId, auditIds }.
 *
 * Customer progress (assumed allowlisted read model / API):
 *   GET /api/audits/:id/progress → CustomerAuditStatus only
 *   (today CustomerWaitState polls /live and projects client-side)
 */

import type {
  BatchSubmission,
  ChannelPlatform,
  SubjectType,
} from "./types";

export type KernelRpcName =
  | "create_subject"
  | "link_subject_channel"
  | "record_living_brief_version"
  | "resolve_context_update_proposal"
  | "submit_audit_batch";

export interface CreateSubjectInput {
  userId: string;
  name: string;
  subjectType: SubjectType;
}

export interface LinkChannelInput {
  subjectId: string;
  channelType: ChannelPlatform;
  locator: string;
  managed?: boolean;
  accountId?: string | null;
}

export interface ResolveProposalInput {
  proposalId: string;
  status: "accepted" | "rejected";
  decidedBy: string;
}

export interface SubmitBatchInput {
  userId: string;
  subjectId: string;
  idempotencyKey: string;
  /** Existing audit row IDs to link; product server action creates these first. */
  auditIds: string[];
}

export interface PrepareBatchResult {
  ok: true;
  mode: "live" | "stub";
  batchId: string;
  auditIds: string[];
  subjectId: string;
}

export interface PrepareBatchError {
  ok: false;
  mode: "live" | "stub";
  error: string;
}

export type PrepareBatchOutcome = PrepareBatchResult | PrepareBatchError;

/**
 * Build a stable idempotency key for a batch submission.
 * Same subject + channels + brief + notes → same key within a short window
 * so retries do not double-enqueue.
 */
export function buildBatchIdempotencyKey(
  submission: BatchSubmission,
  channelLocators: string[],
): string {
  const channels = [...channelLocators].sort().join("|");
  const types = submission.requests
    .map((r) => r.reportType)
    .sort()
    .join(",");
  const notes = submission.changeNotes.trim().toLowerCase().slice(0, 80);
  return [
    "alm-batch",
    submission.subjectId,
    submission.briefVersionId || "none",
    channels,
    types,
    notes,
  ].join(":");
}

/**
 * Fixture/stub submit used when kernel tables/RPCs are unavailable.
 * Does not invent live scanning — returns a deterministic stub payload.
 */
export function stubPrepareAndSubmitBatch(
  submission: BatchSubmission,
  channelLocators: string[],
): PrepareBatchOutcome {
  if (submission.requests.length === 0) {
    return {
      ok: false,
      mode: "stub",
      error: "Select at least one channel to audit.",
    };
  }
  if (!submission.subjectId) {
    return {
      ok: false,
      mode: "stub",
      error: "Choose or create a subject before submitting.",
    };
  }

  const key = buildBatchIdempotencyKey(submission, channelLocators);
  const auditIds = submission.requests.map(
    (_, i) => `stub-audit-${hashShort(`${key}:${i}`)}`,
  );

  return {
    ok: true,
    mode: "stub",
    batchId: `stub-batch-${hashShort(key)}`,
    auditIds,
    subjectId: submission.subjectId,
  };
}

function hashShort(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Documented RPC argument shapes for release-gate type wiring. */
export const ASSUMED_RPC_SHAPES = {
  create_subject: {
    args: ["p_user_id", "p_name", "p_subject_type"],
    returns: "uuid",
    grant: "service_role",
  },
  link_subject_channel: {
    args: [
      "p_subject_id",
      "p_channel_type",
      "p_locator",
      "p_managed",
      "p_account_id",
    ],
    returns: "uuid",
    grant: "service_role",
  },
  submit_audit_batch: {
    args: ["p_user_id", "p_subject_id", "p_idempotency_key", "p_audit_ids"],
    returns: "uuid",
    grant: "service_role",
  },
  resolve_context_update_proposal: {
    args: ["p_proposal_id", "p_status", "p_decided_by"],
    returns: "void",
    grant: "service_role",
  },
} as const;
