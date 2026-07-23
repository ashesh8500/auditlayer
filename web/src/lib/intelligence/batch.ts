/**
 * Batch audit validation and review logic.
 *
 * Validates that a batch submission is atomic, idempotent, and honest
 * before the server accepts it. Duplicates and entitlement concerns are
 * surfaced to the customer before submission.
 */

import type {
  BatchAuditRequest,
  BatchSubmission,
  BatchReview,
  ChannelSummary,
} from "./types";
import type { Plan } from "../domain";
import { allowedReportTypes } from "../domain";

export interface BatchValidationResult {
  valid: boolean;
  errors: string[];
  review: BatchReview;
}

/**
 * Validate a batch of audit requests for a subject.
 * Checks: at least one request, report types allowed by plan, no empty
 * channels, no duplicate channels within the batch.
 */
export function validateBatch(
  submission: BatchSubmission,
  channels: ChannelSummary[],
  plan: Plan,
  inFlightChannelIds: Set<string> = new Set(),
): BatchValidationResult {
  const errors: string[] = [];

  if (submission.requests.length === 0) {
    errors.push("Select at least one channel to audit.");
  }

  const channelById = new Map(channels.map((c) => [c.id, c]));
  const allowedTypes = allowedReportTypes(plan);
  const seenChannelIds = new Set<string>();
  const duplicateChannelNames: string[] = [];
  const entitlementWarnings: string[] = [];
  const reportTypeCounts: Record<string, number> = {};

  for (const req of submission.requests) {
    // Channel must exist
    const channel = channelById.get(req.channelId);
    if (!channel) {
      errors.push(`Channel ${req.channelId} not found for this subject.`);
      continue;
    }

    // No duplicate channels within batch
    if (seenChannelIds.has(req.channelId)) {
      duplicateChannelNames.push(channel.displayName || channel.handle || channel.url || "unknown");
      continue;
    }
    seenChannelIds.add(req.channelId);

    // Check in-flight audits
    if (inFlightChannelIds.has(req.channelId)) {
      duplicateChannelNames.push(channel.displayName || channel.handle || channel.url || "unknown");
    }

    // Report type must be allowed by plan
    if (!allowedTypes.includes(req.reportType)) {
      entitlementWarnings.push(
        `Your ${plan} plan doesn't include ${req.reportType} reports. Upgrade to access this report type.`,
      );
    }

    // Count report types
    reportTypeCounts[req.reportType] = (reportTypeCounts[req.reportType] || 0) + 1;
  }

  // Deduplicate
  const uniqueDupes = Array.from(new Set(duplicateChannelNames));
  const uniqueWarnings = Array.from(new Set(entitlementWarnings));

  const valid = errors.length === 0 && uniqueWarnings.length === 0;

  const review: BatchReview = {
    subjectName: "", // filled by caller
    channelCount: submission.requests.length,
    auditCount: submission.requests.length,
    reportTypes: reportTypeCounts,
    duplicateChannelNames: uniqueDupes,
    entitlementWarnings: uniqueWarnings,
  };

  return { valid, errors, review };
}

/**
 * Check if a channel already has an active audit (queued/running).
 * Until kernel provides the API, we accept a caller-provided set.
 */
export function checkInFlightChannels(
  channelIds: string[],
  inFlightChannelIds: Set<string>,
): string[] {
  return channelIds.filter((id) => inFlightChannelIds.has(id));
}

/**
 * Count total audits in a batch, grouped by report type.
 */
export function summarizeBatchTypes(
  requests: BatchAuditRequest[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const req of requests) {
    counts[req.reportType] = (counts[req.reportType] || 0) + 1;
  }
  return counts;
}

/**
 * Estimate batch duration based on concurrent channel count.
 * Single channel: ~2 min; 2 channels: ~4 min; 3+: ~6 min.
 */
export function estimateBatchDuration(requestCount: number): string {
  if (requestCount <= 1) return "about 2 minutes";
  if (requestCount === 2) return "about 4 minutes";
  return "about 6 minutes";
}
