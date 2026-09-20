export const REPORT_PRESENTATION_REVISION = "mobile-reader-20260919-v1";
export type ReportIdentity = { ownerId: string; reportId: string; version: number; contentHash: string; presentationRevision: string };
export type ReaderVersion = { version: number; createdAt: string; changeType: string; changedSection: string | null };
export type ReportDTO = ReportIdentity & { html: string; handle: string; fetchedAt: string;
  latestVersion?: number; versions?: ReaderVersion[]; createdAt?: string | null;
  contextVersion?: number | null; evidenceSnapshotId?: string | null; methodology?: string | null;
};
export const reportVersionKey = (v: ReportIdentity) => ["workspace", v.ownerId, "report-version", v.reportId, v.version, v.contentHash, v.presentationRevision] as const;
