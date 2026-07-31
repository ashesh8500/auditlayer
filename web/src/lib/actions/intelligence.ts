/**
 * Server-side intelligence adapters.
 *
 * Kernel RPCs are service-role only. Release gate owns regenerated Database
 * types. Until then these actions document the intended call shapes and return
 * honest stub outcomes (no fake scanning / randomized scores).
 */

"use server";

import { stubPrepareAndSubmitBatch } from "@/lib/intelligence/api";
import type { BatchSubmission } from "@/lib/intelligence/types";
import type { PrepareBatchOutcome } from "@/lib/intelligence/api";

export async function prepareAndSubmitIntelligenceBatch(input: {
  submission: BatchSubmission;
  channelLocators: string[];
}): Promise<PrepareBatchOutcome> {
  // Live path (release gate):
  // 1. create_subject / link_subject_channel as needed (service-role)
  // 2. create audit rows for each channel request
  // 3. submit_audit_batch(userId, subjectId, idempotencyKey, auditIds)
  return stubPrepareAndSubmitBatch(input.submission, input.channelLocators);
}

export async function resolveBriefProposalAction(input: {
  proposalId: string;
  status: "accepted" | "rejected";
}): Promise<{ ok: true; mode: "stub" } | { ok: false; error: string }> {
  // Live: resolve_context_update_proposal(proposalId, status, decidedBy)
  void input;
  return { ok: true, mode: "stub" };
}
