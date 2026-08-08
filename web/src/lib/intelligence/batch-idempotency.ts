import { createHash } from "node:crypto";

export interface BatchAuditIntent {
  channelId: string;
  channelType: string | null;
  channelLocator: string;
  platform: string;
  reportType: string;
  forceRefresh: boolean;
}

interface BatchFingerprintInput {
  subjectIdentity: string;
  briefVersionId: string;
  changeNotes: string;
  audits: BatchAuditIntent[];
}

/**
 * Fingerprint the complete batch payload independently of request ordering.
 * The database applies the rolling retry window; this key only identifies
 * semantically identical submissions.
 */
export function buildBatchFingerprint(input: BatchFingerprintInput): string {
  const audits = input.audits
    .map((audit) => ({
      channelType: audit.channelType,
      channelLocator: audit.channelLocator,
      channelId: audit.channelId,
      platform: audit.platform,
      reportType: audit.reportType,
      forceRefresh: audit.forceRefresh,
    }))
    .map((audit) => JSON.stringify(audit))
    .sort();

  const canonical = JSON.stringify({
    version: 4,
    subjectIdentity: input.subjectIdentity,
    briefVersionId: input.briefVersionId,
    changeNotes: input.changeNotes,
    audits,
  });
  const digest = createHash("sha256").update(canonical).digest("hex");
  return `alm-batch-v4:${digest}`;
}
