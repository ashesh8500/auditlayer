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
  SubjectType,
} from "./types";

export type KernelRpcName =
  | "create_subject"
  | "link_subject_channel"
  | "record_living_brief_version"
  | "resolve_context_update_proposal"
  | "submit_audit_batch";

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
    goals?: string[];
    constraints?: string[];
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
    p_audience: {},
    p_positioning: {},
    p_offers: [] as string[],
    p_goals: input.goals ?? [],
    p_constraints: input.constraints ?? [],
    p_experiments: [] as string[],
    p_decisions: [] as string[],
    p_created_by: input.createdBy,
    p_confirmed: input.confirmed ?? true,
  });
  if (error || !data) {
    throw new Error(error?.message ?? "record_living_brief_version failed");
  }
  return String(data);
}
