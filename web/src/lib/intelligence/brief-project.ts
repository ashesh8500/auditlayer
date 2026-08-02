/**
 * Project kernel JSONB Living Brief columns into product narrative strings.
 * Never surfaces raw JSON to the customer UI.
 */

import type { LivingBriefContent, SubjectType } from "./types";

export function emptyBriefContent(type: SubjectType): LivingBriefContent {
  return {
    subjectType: type,
    identity: "",
    vision: "",
    audience: "",
    offers: "",
    voice: "",
    positioning: "",
    goals: "",
    successCriteria: "",
    constraints: "",
    activeExperiments: "",
    plannedChanges: "",
  };
}

/**
 * Convert a jsonb cell into readable prose for B2C surfaces.
 */
export function projectBriefField(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => projectBriefField(item, ""))
      .filter(Boolean);
    return parts.length ? parts.join("\n") : fallback;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.summary === "string" && obj.summary.trim()) {
      return obj.summary.trim();
    }
    if (typeof obj.text === "string" && obj.text.trim()) {
      return obj.text.trim();
    }
    if (typeof obj.value === "string" && obj.value.trim()) {
      return obj.value.trim();
    }

    // Common identity-shaped objects from seeds / Hermes
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    const role = typeof obj.role === "string" ? obj.role.trim() : "";
    const niche = typeof obj.niche === "string" ? obj.niche.trim() : "";
    const category =
      typeof obj.category === "string" ? obj.category.trim() : "";
    const description =
      typeof obj.description === "string" ? obj.description.trim() : "";

    const lead = [name, role || category].filter(Boolean).join(" — ");
    const detail = [niche, description].filter(Boolean).join(". ");
    const composed = [lead, detail].filter(Boolean).join(". ");
    if (composed) return composed;

    // Last resort: readable key/value lines, still not JSON dump
    const lines = Object.entries(obj)
      .filter(([, v]) => v != null && String(v).trim() !== "")
      .map(([k, v]) => {
        const label = k.replace(/_/g, " ");
        const body = projectBriefField(v, "");
        return body ? `${label}: ${body}` : "";
      })
      .filter(Boolean);
    return lines.length ? lines.join("\n") : fallback;
  }

  return fallback;
}

export function projectLivingBriefContent(
  type: SubjectType,
  row: {
    identity?: unknown;
    audience?: unknown;
    positioning?: unknown;
    offers?: unknown;
    goals?: unknown;
    constraints?: unknown;
    experiments?: unknown;
    decisions?: unknown;
  },
): LivingBriefContent {
  const identityObj =
    row.identity && typeof row.identity === "object" && !Array.isArray(row.identity)
      ? (row.identity as Record<string, unknown>)
      : null;

  return {
    subjectType: type,
    identity: projectBriefField(row.identity),
    vision: projectBriefField(identityObj?.vision ?? ""),
    audience: projectBriefField(row.audience),
    offers: projectBriefField(row.offers),
    voice: projectBriefField(identityObj?.voice ?? ""),
    positioning: projectBriefField(row.positioning),
    goals: projectBriefField(row.goals),
    successCriteria: projectBriefField(
      identityObj?.success_criteria ?? identityObj?.successCriteria ?? "",
    ),
    constraints: projectBriefField(row.constraints),
    activeExperiments: projectBriefField(row.experiments),
    plannedChanges: projectBriefField(
      identityObj?.planned_changes ??
        identityObj?.plannedChanges ??
        row.decisions ??
        "",
    ),
  };
}
