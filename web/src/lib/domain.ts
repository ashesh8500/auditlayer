/**
 * Domain calibration mirrored from the legacy worker source of truth
 * (`legacy/src/auditlayer/domain.py`). The Python Hermes worker remains the
 * authoritative owner of the audit decision; this TypeScript port powers:
 *   - lightweight, read-only client-side intake hints (handle normalization,
 *     platform detection, credential prompts), and
 *   - the server-side intake decision used when creating an `audits` row.
 *
 * Keep these in lock-step with the contract enums in
 * `docs/architecture-contract.md`.
 */

export type AuditStatus =
  | "draft"
  | "queued"
  | "running"
  | "ready"
  | "needs_review"
  | "blocked"
  | "failed";

export type Plan = "free" | "starter" | "pro" | "enterprise";

export type AccountType = "standard" | "trial" | "comp";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  standard: "Standard",
  trial: "Trial",
  comp: "Complimentary",
};

export type Goal = "growth" | "monetization" | "rebrand" | "launch_readiness";

export type ReportType = "pulse" | "standard" | "extended" | "enterprise" | "blueprint";

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  pulse: "Pulse — Free snapshot",
  standard: "Standard — Full report",
  extended: "Extended — Deep dive",
  enterprise: "Enterprise — Custom",
  blueprint: "Blueprint — Pre-launch foundation",
};

export const REPORT_TYPE_SECTIONS: Record<ReportType, number> = {
  pulse: 3,
  standard: 15,
  extended: 20,
  enterprise: 0,
  blueprint: 15,
};

/** Which report types each plan can access. */
export function allowedReportTypes(plan: Plan): ReportType[] {
  switch (plan) {
    case "free": return ["pulse"];
    case "starter": return ["pulse", "standard"];
    case "pro": return ["pulse", "standard", "extended", "blueprint"];
    case "enterprise": return ["pulse", "standard", "extended", "enterprise", "blueprint"];
  }
}

export type Platform =
  | "instagram"
  | "tiktok"
  | "youtube"
  | "x"
  | "linkedin"
  | "unknown";

export const PLAN_LIMITS: Record<Plan, number> = {
  free: 1,
  starter: 5,
  pro: 15,
  enterprise: 10_000,
};

/** Founders/admins bypass paid-plan caps for testing and operations. */
export function isAdminUnlimited(role: string | null | undefined): boolean {
  return role === "admin";
}

/** Effective audit cap for a profile (admins → enterprise allowance, gifted → unlimited). */
export function auditLimitForProfile(profile: {
  plan: Plan;
  role: string;
  gifted_audits?: number;
}): number {
  if (isAdminUnlimited(profile.role)) return PLAN_LIMITS.enterprise;
  if (profile.gifted_audits && profile.gifted_audits > 0) return Infinity;
  return PLAN_LIMITS[profile.plan];
}

/** Plan passed to intake calibration (admins treated as enterprise). */
export function effectivePlanForProfile(profile: {
  plan: Plan;
  role: string;
  trial_plan?: Plan | null;
  trial_expires_at?: string | null;
}): Plan {
  if (isAdminUnlimited(profile.role)) return "enterprise";
  if (
    profile.trial_plan &&
    profile.trial_expires_at &&
    new Date(profile.trial_expires_at).getTime() > Date.now()
  ) {
    return profile.trial_plan;
  }
  return profile.plan;
}

/** Effective report entitlements, including a still-active founder trial offer. */
export function allowedReportTypesForProfile(profile: {
  plan: Plan;
  role: string;
  trial_plan?: Plan | null;
  trial_report_types?: ReportType[] | null;
  trial_expires_at?: string | null;
}): ReportType[] {
  const base = allowedReportTypes(effectivePlanForProfile(profile));
  const trialActive = Boolean(
    profile.trial_expires_at &&
    new Date(profile.trial_expires_at).getTime() > Date.now(),
  );
  return Array.from(new Set([
    ...base,
    ...(trialActive ? profile.trial_report_types ?? [] : []),
  ]));
}

export const GOALS: { value: Goal; label: string; blurb: string }[] = [
  {
    value: "growth",
    label: "GROWTH",
    blurb: "Scale your audience, increase reach, and hit the next follower milestone.",
  },
  {
    value: "monetization",
    label: "MONETIZATION",
    blurb: "Turn your existing audience into revenue — affiliates, products, services.",
  },
  {
    value: "rebrand",
    label: "REBRAND",
    blurb: "Reposition your brand, sharpen your niche, refresh your message.",
  },
  {
    value: "launch_readiness",
    label: "LAUNCH READINESS",
    blurb: "Audit-ready for a product, course, or campaign launch.",
  },
];

export const INSTAGRAM_LIMITATION =
  "Instagram limits what unauthenticated collection can read from profiles (login-walled as of May 2026). " +
  "The audit uses indexed public content, any context you provide, and comparable accounts; " +
  "gaps in live metrics are noted in the report rather than guessed.";

const PLATFORM_DOMAINS = new Set([
  "instagram.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "x.com",
]);

export function normalizeHandle(handle: string): string {
  let cleaned = handle.trim().toLowerCase();
  cleaned = cleaned.replace(/^https:\/\//, "").replace(/^http:\/\//, "");
  cleaned = cleaned.replace(/^www\./, "");
  if (cleaned.includes("/")) {
    const parts = cleaned
      .split("/")
      .filter((part) => part && !PLATFORM_DOMAINS.has(part));
    cleaned = parts.length ? parts[parts.length - 1] : cleaned;
  }
  cleaned = cleaned.replace(/^@/, "");
  cleaned = cleaned.replace(/[^a-z0-9_.-]/g, "");
  return cleaned;
}

export function detectPlatform(handleOrUrl: string): Platform {
  const value = handleOrUrl.toLowerCase();
  if (value.includes("tiktok.com")) return "tiktok";
  if (value.includes("youtube.com") || value.includes("youtu.be"))
    return "youtube";
  if (value.includes("x.com") || value.includes("twitter.com")) return "x";
  if (value.includes("linkedin.com")) return "linkedin";
  if (value.includes("instagram.com")) return "instagram";
  const trimmed = value.trim();
  if (trimmed.startsWith("@")) return "instagram";
  // Bare username — default to Instagram. Accepts dotted handles like
  // 'dr.truptikaji'. Only reject strings that look like domains
  // (short TLD-like suffix: 2–4 chars after the last dot).
  if (/^[a-z0-9_.-]+$/i.test(trimmed)) {
    if (!trimmed.includes(".")) return "instagram";
    const lastSegment = trimmed.split(".").pop()!;
    if (lastSegment.length > 4) return "instagram";
  }
  return "unknown";
}

export function nextMilestone(followers: number | null): string {
  if (followers === null) return "Road to next verified milestone";
  if (followers < 300) return "Road to 2K";
  if (followers < 2_000) return "Road to 10K";
  if (followers < 10_000) return "Road to 20K";
  if (followers < 50_000) return "Road to 100K";
  if (followers < 100_000) return "Road to 250K";
  return "Road to 500K";
}

export interface IntakeInput {
  handle: string;
  goal: Goal;
  context?: string;
  platform?: Platform;
  plan: Plan;
}

export interface IntakeDecision {
  accepted: boolean;
  status: AuditStatus;
  reasons: string[];
  limitations: string[];
  platform: Platform;
  milestoneLabel: string;
  normalizedHandle: string;
}

/**
 * Port of `evaluate_intake`. Used server-side at submission to set the audit's
 * initial status (queued / needs_review / blocked) and limitations.
 */
export function evaluateIntake(
  input: IntakeInput,
  completedAudits = 0,
  followers: number | null = null,
  giftedAudits = 0,
): IntakeDecision {
  const reasons: string[] = [];
  const limitations: string[] = [];
  const handle = normalizeHandle(input.handle);
  const context = (input.context ?? "").trim();
  const platform =
    input.platform && input.platform !== "unknown"
      ? input.platform
      : detectPlatform(input.handle);

  if (!handle) {
    reasons.push("A valid public handle or profile URL is required.");
  }
  if (giftedAudits <= 0 && completedAudits >= PLAN_LIMITS[input.plan]) {
    reasons.push(`The ${input.plan} plan has reached its audit limit.`);
  }

  if (platform === "instagram") {
    limitations.push(INSTAGRAM_LIMITATION);
  }
  if (platform === "unknown") {
    limitations.push(
      "Platform could not be confidently inferred; founder review is required before generation.",
    );
  }
  if (!context && handle) {
    limitations.push(
      "No optional context was provided; the audit infers niche and positioning from public signals.",
    );
  }

  const hardBlock = reasons.some(
    (reason) => reason.startsWith("A valid") || reason.includes("audit limit"),
  );
  // Only gate founder review when we cannot determine the platform (e.g. bare slug with no URL/@).
  const reviewNeeded = platform === "unknown";
  const status: AuditStatus = hardBlock
    ? "blocked"
    : reviewNeeded
      ? "needs_review"
      : "queued";

  return {
    accepted: !hardBlock,
    status,
    reasons,
    limitations,
    platform,
    milestoneLabel: nextMilestone(followers),
    normalizedHandle: handle,
  };
}

/** Lightweight, read-only hints for inline intake UX (client-safe). */
export interface IntakeHints {
  normalizedHandle: string;
  platform: Platform;
  notes: string[];
}

export function intakeHints(handle: string, context: string): IntakeHints {
  const normalizedHandle = normalizeHandle(handle);
  const platform = detectPlatform(handle);
  const notes: string[] = [];
  if (platform === "instagram") {
    notes.push(
      "Instagram limits unauthenticated profile reads; the audit leans on indexed public content, your context, and comparable accounts.",
    );
  }
  if (platform === "unknown" && normalizedHandle) {
    notes.push(
      "We couldn't confidently detect the platform — a founder may review this before generation.",
    );
  }
  if (!context.trim() && normalizedHandle) {
    notes.push(
      "Optional: add niche, brand, competitors, or goals — sharper context improves calibration.",
    );
  }
  return { normalizedHandle, platform, notes };
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X",
  linkedin: "LinkedIn",
  unknown: "Unknown",
};

export const STATUS_LABELS: Record<AuditStatus, string> = {
  draft: "Draft",
  queued: "Queued",
  running: "Generating",
  ready: "Ready",
  needs_review: "Founder review",
  blocked: "Blocked",
  failed: "Failed",
};

/** Statuses that consume a slot against the plan's audit allowance. */
export const USAGE_STATUSES: AuditStatus[] = [
  "queued",
  "running",
  "ready",
  "needs_review",
];

/** Maximum number of automatic retries for failed audits (mirrors worker MAX_RETRIES). */
export const MAX_RETRIES = 3;

/** Human-readable retry status for failed audits. */
export function retryStatusLabel(retryCount: number): string {
  if (retryCount >= MAX_RETRIES) return `Max retries (${MAX_RETRIES}/${MAX_RETRIES}) reached`;
  return `Retry ${retryCount} of ${MAX_RETRIES}`;
}
