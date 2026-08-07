/**
 * Kernel API contracts for the product layer.
 *
 * Kernel owns migrations/RPCs (service-role). Types are regenerated from local
 * migrations on the release branch (`web/src/lib/supabase/types.ts`).
 *
 * Tables: subjects, subject_channels, living_brief_versions,
 * context_update_proposals, audit_batches, batch_audits, intelligence_runs,
 * evidence, evidence_snapshots, scores, findings, recommendations, decisions
 *
 * Service-role RPCs (shipped names):
 *   create_subject(p_user_id, p_name, p_subject_type) → uuid
 *   link_subject_channel(p_subject_id, p_channel_type, p_locator, p_managed, p_account_id) → uuid
 *   record_living_brief_version(...) → uuid
 *   resolve_context_update_proposal(p_proposal_id, p_status, p_user_id) → void
 *   submit_audit_batch(p_user_id, p_subject_id, p_idempotency_key, p_audit_ids) → uuid
 *
 * Customer progress: CustomerWaitState polls /live and projects
 * Preparing/Analyzing/Finalizing/Delayed client-side until an allowlisted
 * progress API ships.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import type {
  BatchSubmission,
  ChannelPlatform,
  RecommendationDecision,
  RecommendationLedgerDecision,
  SubjectType,
} from "./types";

export type KernelRpcName =
  | "create_subject"
  | "link_subject_channel"
  | "record_living_brief_version"
  | "resolve_context_update_proposal"
  | "submit_audit_batch"
  | "record_decision";

export type AdminClient = SupabaseClient<Database>;

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
  /** Kernel arg name is p_user_id (maps to decided_by column). */
  userId: string;
}

export interface SubmitBatchInput {
  userId: string;
  subjectId: string;
  idempotencyKey: string;
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

/** Kernel RPC argument shapes (aligned to shipped SQL). */
export const KERNEL_RPC_SHAPES = {
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
    args: ["p_proposal_id", "p_status", "p_user_id"],
    returns: "void",
    grant: "service_role",
  },
  record_decision: {
    args: [
      "p_subject_id",
      "p_user_id",
      "p_target_type",
      "p_target_id",
      "p_decision",
      "p_note",
    ],
    returns: "uuid",
    grant: "service_role",
  },
} as const;

/** @deprecated Use KERNEL_RPC_SHAPES — kept for existing product tests. */
export const ASSUMED_RPC_SHAPES = KERNEL_RPC_SHAPES;

export async function rpcCreateSubject(
  admin: AdminClient,
  input: CreateSubjectInput,
): Promise<string> {
  const { data, error } = await admin.rpc("create_subject", {
    p_user_id: input.userId,
    p_name: input.name,
    p_subject_type: input.subjectType,
  });
  if (error || !data) {
    throw new Error(error?.message ?? "create_subject failed");
  }
  return String(data);
}

export async function rpcLinkSubjectChannel(
  admin: AdminClient,
  input: LinkChannelInput,
): Promise<string> {
  const { data, error } = await admin.rpc("link_subject_channel", {
    p_subject_id: input.subjectId,
    p_channel_type: input.channelType,
    p_locator: input.locator,
    p_managed: input.managed ?? false,
    p_account_id: input.accountId ?? undefined,
  });
  if (error || !data) {
    throw new Error(error?.message ?? "link_subject_channel failed");
  }
  return String(data);
}

export async function rpcSubmitAuditBatch(
  admin: AdminClient,
  input: SubmitBatchInput,
): Promise<string> {
  const { data, error } = await admin.rpc("submit_audit_batch", {
    p_user_id: input.userId,
    p_subject_id: input.subjectId,
    p_idempotency_key: input.idempotencyKey,
    p_audit_ids: input.auditIds,
  });
  if (error || !data) {
    throw new Error(error?.message ?? "submit_audit_batch failed");
  }
  return String(data);
}

export async function rpcResolveContextUpdateProposal(
  admin: AdminClient,
  input: ResolveProposalInput,
): Promise<void> {
  const { error } = await admin.rpc("resolve_context_update_proposal", {
    p_proposal_id: input.proposalId,
    p_status: input.status,
    p_user_id: input.userId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function rpcRecordLivingBriefVersion(
  admin: AdminClient,
  input: {
    subjectId: string;
    version: number;
    createdBy: string;
    identity?: Record<string, string>;
    audience?: Record<string, string>;
    positioning?: Record<string, string>;
    offers?: string[];
    goals?: string[];
    constraints?: string[];
    experiments?: string[];
    decisions?: string[];
    confirmed?: boolean;
  },
): Promise<string> {
  const identity = (input.identity ?? {}) as {
    [key: string]: string;
  };
  const { data, error } = await admin.rpc("record_living_brief_version", {
    p_subject_id: input.subjectId,
    p_version: input.version,
    p_schema_version: "1.0",
    p_identity: identity,
    p_audience: (input.audience ?? {}) as { [key: string]: string },
    p_positioning: (input.positioning ?? {}) as { [key: string]: string },
    p_offers: input.offers ?? [],
    p_goals: input.goals ?? [],
    p_constraints: input.constraints ?? [],
    p_experiments: input.experiments ?? [],
    p_decisions: input.decisions ?? [],
    p_created_by: input.createdBy,
    p_confirmed: input.confirmed ?? true,
  });
  if (error || !data) {
    throw new Error(error?.message ?? "record_living_brief_version failed");
  }
  return String(data);
}

// ===========================================================================
// Recommendation decisions — customer-owned decision on a recommendation.
//
// The kernel `decisions` ledger + `record_decision` RPC (service-role only) is
// the authoritative write path. The read model projects the latest durable
// decision per recommendation; the client never mutates authoritative state.
//
// The kernel `decisions.decision` CHECK constraint admits
// accepted/rejected/superseded. The customer surface intentionally exposes
// accepted/rejected only. `modified` is NOT representable without widening
// that kernel ledger (and `recommendation_outcomes` requires an observation
// window and is the outcomes ledger, not the decision ledger) — see
// web/artifacts/recommendation-decisions-contract.json.
// ===========================================================================

/** Decisions a customer can authoritatively record through the existing ledger. */
export type RecommendationDecisionValue = "accepted" | "rejected";

export const RECOMMENDATION_DECISION_VALUES: readonly RecommendationDecisionValue[] =
  ["accepted", "rejected"] as const;

/** Ledger vocabulary values that exist in the schema but are NOT customer-operable here. */
export const UNSUPPORTED_RECOMMENDATION_DECISIONS: readonly string[] = [
  "modified",
  "superseded",
] as const;

export function isSupportedRecommendationDecision(
  value: string,
): value is RecommendationDecisionValue {
  return (RECOMMENDATION_DECISION_VALUES as readonly string[]).includes(value);
}

export interface RecordDecisionInput {
  subjectId: string;
  userId: string;
  targetType: "recommendation";
  targetId: string;
  decision: RecommendationDecisionValue;
  note?: string;
}

/** Minimal `decisions` ledger row shape the product layer reads. */
export interface DecisionLedgerRow {
  id: string;
  target_id: string;
  decision: string;
  note: string | null;
  user_id: string;
  created_at: string;
}

export async function rpcRecordDecision(
  admin: AdminClient,
  input: RecordDecisionInput,
): Promise<string> {
  const { data, error } = await admin.rpc("record_decision", {
    p_subject_id: input.subjectId,
    p_user_id: input.userId,
    p_target_type: input.targetType,
    p_target_id: input.targetId,
    p_decision: input.decision,
    p_note: input.note ?? "",
  });
  if (error || !data) {
    throw new Error(error?.message ?? "record_decision failed");
  }
  return String(data);
}

/**
 * Deterministic latest-decision projection per target (recommendation).
 * Newest `created_at` wins; ties resolve to the lexicographically greatest id
 * so the projection is stable regardless of query ordering.
 */
export function projectLatestDecision(
  rows: readonly DecisionLedgerRow[],
): Record<string, RecommendationDecision> {
  const sorted = [...rows].sort((a, b) => {
    const byTime = b.created_at.localeCompare(a.created_at);
    if (byTime !== 0) return byTime;
    return b.id.localeCompare(a.id);
  });
  const out: Record<string, RecommendationDecision> = {};
  for (const row of sorted) {
    if (out[row.target_id]) continue;
    out[row.target_id] = {
      decision: row.decision as RecommendationLedgerDecision,
      note: row.note ?? "",
      decidedBy: row.user_id,
      decidedAt: row.created_at,
    };
  }
  return out;
}

/** Display state derived from the durable decision + recommendation status. */
export type RecommendationDecisionDisplayState =
  | "actionable" // proposed + no durable decision → decision controls
  | "accepted" // durable accepted decision
  | "rejected_suppressed" // durable rejected — suppressed until new evidence
  | "decided_other"; // superseded/terminal status without an open decision

export function recommendationDecisionDisplayState(rec: {
  status: string;
  decision: RecommendationDecision | null;
}): RecommendationDecisionDisplayState {
  if (rec.decision?.decision === "rejected") return "rejected_suppressed";
  if (rec.decision?.decision === "accepted") return "accepted";
  if (rec.decision) return "decided_other"; // superseded/unknown ledger state
  if (rec.status === "proposed") return "actionable";
  return "decided_other";
}

// ---------------------------------------------------------------------------
// Decision plan — pure fail-closed decision about whether a submission may
// write. The server action executes the plan; a `write` plan is exactly one
// `record_decision` ledger call, every `noop` reason is zero writes.
// ---------------------------------------------------------------------------

export const RECOMMENDATION_DECISION_NOTE_MAX = 500;

const RECOMMENDATION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RecommendationDecisionPlan =
  | { action: "write"; call: RecordDecisionInput }
  | {
      action: "noop";
      reason:
        | "not_configured"
        | "malformed"
        | "subject_not_found"
        | "recommendation_not_found"
        | "wrong_subject"
        | "unauthorized"
        | "unsupported"
        | "duplicate"
        | "stale";
      decisionId?: string;
    };

export interface RecommendationDecisionPlanInput {
  subjectId: string;
  recommendationId: string;
  decision: string;
  note?: string;
  configured: boolean;
  profile: { id: string; role: string | null };
  subject: { id: string; user_id: string } | null;
  /** Subject that owns the recommendation (via its intelligence run), if found. */
  recommendationSubjectId: string | null;
  /** This acting user's prior decision rows for the recommendation (idempotency). */
  existingDecisions: readonly DecisionLedgerRow[];
}

export function planRecommendationDecision(
  input: RecommendationDecisionPlanInput,
): RecommendationDecisionPlan {
  if (!input.configured) return { action: "noop", reason: "not_configured" };
  if (
    !RECOMMENDATION_UUID_RE.test(input.subjectId) ||
    !RECOMMENDATION_UUID_RE.test(input.recommendationId)
  ) {
    return { action: "noop", reason: "malformed" };
  }
  const note = (input.note ?? "").trim();
  if (note.length > RECOMMENDATION_DECISION_NOTE_MAX) {
    return { action: "noop", reason: "malformed" };
  }
  if (!input.subject) return { action: "noop", reason: "subject_not_found" };
  const isOwner = input.profile.id === input.subject.user_id;
  const isAdmin = input.profile.role === "admin";
  if (!isOwner && !isAdmin) return { action: "noop", reason: "unauthorized" };
  if (!input.recommendationSubjectId) {
    return { action: "noop", reason: "recommendation_not_found" };
  }
  if (input.recommendationSubjectId !== input.subjectId) {
    return { action: "noop", reason: "wrong_subject" };
  }
  if (!isSupportedRecommendationDecision(input.decision)) {
    return { action: "noop", reason: "unsupported" };
  }
  const prior = input.existingDecisions.find(
    (d) => d.target_id === input.recommendationId,
  );
  if (prior) {
    if (prior.decision === input.decision) {
      return { action: "noop", reason: "duplicate", decisionId: prior.id };
    }
    return { action: "noop", reason: "stale" };
  }
  return {
    action: "write",
    call: {
      subjectId: input.subjectId,
      userId: input.profile.id,
      targetType: "recommendation",
      targetId: input.recommendationId,
      decision: input.decision,
      note,
    },
  };
}

/** Customer-safe, opaque error copy for a noop plan (never leaks internals). */
export function recommendationDecisionPlanError(
  plan: Extract<RecommendationDecisionPlan, { action: "noop" }>,
  requestedDecision: string,
): string {
  switch (plan.reason) {
    case "not_configured":
      return "Could not save that decision right now.";
    case "malformed":
      return "That request is invalid.";
    case "subject_not_found":
    case "recommendation_not_found":
    case "wrong_subject":
    case "unauthorized":
      return "Recommendation not found.";
    case "unsupported":
      return requestedDecision === "modified"
        ? "Modifying a recommendation isn't supported yet — you can accept or reject it."
        : "That decision isn't supported.";
    case "stale":
      return "This recommendation was already decided.";
    case "duplicate":
      return "This decision was already recorded.";
  }
}

/** Extract the owning subject id from a recommendations nested select row. */
export function recommendationSubjectIdFromRow(row: unknown): string | null {
  const rec = row as {
    intelligence_runs?:
      | { subject_id?: string | null }
      | Array<{ subject_id?: string | null }>
      | null;
  } | null;
  if (!rec) return null;
  const run = Array.isArray(rec.intelligence_runs)
    ? rec.intelligence_runs[0]
    : rec.intelligence_runs;
  return run?.subject_id ?? null;
}
