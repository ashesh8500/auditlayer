/**
 * Section-scoped refinement guardrails, mirrored from the legacy
 * `legacy/src/auditlayer/service.py` (`ALLOWED_REFINEMENT_SECTIONS`,
 * `BLOCKED_REFINEMENT_TERMS`). Refinement requests are deliberately NOT a
 * general-purpose chat: input is anchored to allowed report sections only and
 * validated server-side before a `refinements` row is inserted via the
 * service-role client for the worker to process.
 */

export const ALLOWED_REFINEMENT_SECTIONS = [
  "Data Quality Notes",
  "The Six Audit Outputs",
  "Executive Summary",
  "Brand Snapshot",
  "Platform-by-Platform Audit",
  "Strengths",
  "Weaknesses",
  "Root Cause Analysis",
  "Peer Comparison",
  "Growth Bottlenecks",
  "Content Gaps",
  "Audience Psychology Patterns",
  "Viral Opportunities",
  "Engagement Growth Strategy",
  "Performance Score",
  "Road to Milestone",
  "High-Impact Recommendations",
  "Content Ideas",
  "How Often Should You Re-Audit?",
] as const;

export type RefinementSection = (typeof ALLOWED_REFINEMENT_SECTIONS)[number];

const ALLOWED_SET = new Set<string>(ALLOWED_REFINEMENT_SECTIONS);

export const BLOCKED_REFINEMENT_TERMS = [
  "system prompt",
  "developer message",
  "token budget",
  "backend",
  "config",
  "api key",
  "execute",
  "shell",
  "pricing",
  "stripe",
  "all reports",
  "other users",
] as const;

export interface RefinementValidation {
  ok: boolean;
  error?: string;
  section?: string;
  instruction?: string;
}

export function validateRefinement(
  section: string,
  instruction: string,
): RefinementValidation {
  const normalizedSection = section.trim();
  if (!ALLOWED_SET.has(normalizedSection)) {
    return { ok: false, error: "Refinement section is not allowed." };
  }
  const normalizedInstruction = instruction.trim();
  if (normalizedInstruction.length < 8) {
    return { ok: false, error: "Refinement instruction is too short." };
  }
  const lowered = normalizedInstruction.toLowerCase();
  if (BLOCKED_REFINEMENT_TERMS.some((term) => lowered.includes(term))) {
    return {
      ok: false,
      error: "Refinement request is outside section-scoped report editing.",
    };
  }
  return {
    ok: true,
    section: normalizedSection,
    instruction: normalizedInstruction,
  };
}
