/**
 * Intelligence types for the ALM longitudinal product surface.
 *
 * These are the product-layer read-model types. Kernel types (subject/brief/evidence
 * rows as stored in Supabase) are owned by the kernel worker. Until kernel types are
 * available, product tests and components use compatible fixtures.
 */

// ---- Subject & Channels ----

export type SubjectType =
  | "person"
  | "creator"
  | "brand"
  | "organization"
  | "project";

export type ChannelPlatform =
  | "instagram"
  | "tiktok"
  | "youtube"
  | "x"
  | "linkedin"
  | "website";

export type ChannelOwnershipStatus =
  | "connected" // API-connected (Instagram OAuth, etc.)
  | "managed"  // Explicitly added to workspace
  | "observed"; // One-off public target — NOT in managed workspace

export interface SubjectSummary {
  id: string;
  name: string;
  type: SubjectType;
  avatarUrl: string | null;
  channelCount: number;
  lastAuditAt: string | null;
}

export interface ChannelSummary {
  id: string;
  platform: ChannelPlatform;
  handle: string; // always populated for non-website; website uses url
  url: string | null; // website channel
  ownershipStatus: ChannelOwnershipStatus;
  displayName: string | null;
  avatarUrl: string | null;
  connected: boolean; // live OAuth connection
  subjectId: string;
}

// ---- Living Brief ----

export interface LivingBriefContent {
  subjectType: SubjectType;
  identity: string;
  vision: string;
  audience: string;
  offers: string;
  voice: string;
  positioning: string;
  goals: string;
  successCriteria: string;
  constraints: string;
  activeExperiments: string;
  plannedChanges: string;
}

export interface LivingBriefVersion {
  id: string;
  subjectId: string;
  version: number;
  content: LivingBriefContent;
  source: "user" | "model_proposal";
  parentVersionId: string | null;
  changeSummary: string | null;
  createdAt: string;
}

export interface LivingBriefProposal {
  id: string;
  subjectId: string;
  /** Base Living Brief version the proposal diffs against */
  parentVersionId: string;
  baseVersion: number;
  path: string;
  operation: "add" | "replace" | "remove";
  proposedValue: string;
  evidenceIds: string[];
  changeExplanation: string;
  status: "proposed" | "accepted" | "rejected" | "superseded" | "pending";
  createdAt: string;
}

/** Chronology of evidence + decisions since the prior intelligence run */
export interface SinceLastAuditItem {
  id: string;
  kind: "evidence" | "decision" | "recommendation" | "brief";
  title: string;
  detail: string;
  at: string;
}

/** Immutable report outputs linked to a pinned run */
export interface ReportArchiveItem {
  id: string;
  auditId: string;
  channelLabel: string;
  reportVersion: number;
  promptVersion: string | null;
  createdAt: string;
  href: string;
}

// ---- Evidence ----

export interface EvidenceItemSummary {
  id: string;
  sourceType: string;
  sourceUrl: string | null;
  observedAt: string;
  expiresAt: string | null;
  confidence: number;
  coverage: number | null;
  summary: string;
}

export interface ScoreEvidence {
  dimensionId: string;
  dimensionLabel: string;
  evidenceIds: string[];
  score: number | null; // null = "Data needed"
  maxScore: number;
  rationale: string;
  changeReason: "evidence_changed" | "brief_changed" | "methodology_changed" | "prior_error_corrected" | "new" | null;
  previousScore: number | null;
}

// ---- Recommendations ----

export type RecommendationStatus =
  | "proposed"
  | "accepted"
  | "rejected"
  | "in_progress"
  | "implemented"
  | "deferred"
  | "superseded"
  | "invalidated";

/**
 * Decision values the `decisions` ledger can authoritatively hold for a
 * recommendation. The customer surface writes accepted/rejected only;
 * superseded may appear from kernel/worker transitions and stays honest in
 * the projection (never mapped to accept/free/success).
 */
export type RecommendationLedgerDecision = "accepted" | "rejected" | "superseded";

/** Latest durable customer decision for a recommendation, projected server-side. */
export interface RecommendationDecision {
  decision: RecommendationLedgerDecision;
  note: string;
  decidedBy: string;
  decidedAt: string;
}

export interface RecommendationSummary {
  id: string;
  subjectId: string;
  auditId: string;
  text: string;
  status: RecommendationStatus;
  evidenceIds: string[];
  createdAt: string;
  updatedAt: string;
  /** Latest authoritative decision from the `decisions` ledger (nullable when none). */
  decision?: RecommendationDecision | null;
}

// ---- Audit Batch & Submission ----

export interface BatchAuditRequest {
  channelId: string;
  reportType: "pulse" | "standard" | "extended" | "blueprint";
  forceRefresh: boolean;
}

export interface BatchSubmission {
  subjectId: string;
  briefVersionId: string;
  changeNotes: string;
  requests: BatchAuditRequest[];
}

export interface BatchReview {
  subjectName: string;
  channelCount: number;
  auditCount: number;
  reportTypes: Record<string, number>; // e.g. { pulse: 1, standard: 1 }
  duplicateChannelNames: string[]; // channels with in-flight audits
  entitlementWarnings: string[]; // plan-limit concerns
}

// ---- Customer-Safe Status ----

export type CustomerAuditPhase =
  | "preparing"
  | "analyzing"
  | "finalizing"
  | "delayed";

export type CustomerAuditTerminal = "ready" | "failed" | "blocked" | "needs_review";

export interface CustomerAuditStatus {
  phase: CustomerAuditPhase;
  terminal: CustomerAuditTerminal | null;
  message: string;
  startedAt: string | null;
  /** Newest meaningful customer-safe progress reference (falls back to startedAt). */
  lastProgressAt: string | null;
  estimatedCompletion: string | null;
}
