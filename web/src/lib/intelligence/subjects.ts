import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type {
  SubjectSummary,
  SubjectType,
  ChannelSummary,
  ChannelPlatform,
  ChannelOwnershipStatus,
  LivingBriefVersion,
  LivingBriefProposal,
  LivingBriefContent,
  ScoreEvidence,
  RecommendationSummary,
  ReportArchiveItem,
  SinceLastAuditItem,
} from "@/lib/intelligence/types";
import { fixtureSubjects } from "@/lib/intelligence/fixtures";

export type SubjectListSource = "live" | "fixture";

export type SubjectHomeBundle = {
  subject: SubjectSummary;
  channels: ChannelSummary[];
  briefVersions: LivingBriefVersion[];
  proposals: LivingBriefProposal[];
  scores: ScoreEvidence[];
  recommendations: RecommendationSummary[];
  sinceLast: SinceLastAuditItem[];
  reports: ReportArchiveItem[];
  source: SubjectListSource;
};

function emptyBriefContent(type: SubjectType): LivingBriefContent {
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

function jsonbText(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.summary === "string") return obj.summary;
    if (typeof obj.text === "string") return obj.text;
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }
  return String(value);
}

export async function listSubjectsForUser(): Promise<{
  subjects: SubjectSummary[];
  source: SubjectListSource;
}> {
  if (!isSupabaseConfigured()) {
    return { subjects: fixtureSubjects(), source: "fixture" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("subjects")
      .select("id, name, subject_type, created_at")
      .order("created_at", { ascending: false });

    if (error || !data) {
      return { subjects: fixtureSubjects(), source: "fixture" };
    }

    if (data.length === 0) {
      return { subjects: [], source: "live" };
    }

    const subjects: SubjectSummary[] = await Promise.all(
      data.map(async (row) => {
        const { count } = await supabase
          .from("subject_channels")
          .select("id", { count: "exact", head: true })
          .eq("subject_id", row.id);
        const { data: batches } = await supabase
          .from("audit_batches")
          .select("id, created_at")
          .eq("subject_id", row.id)
          .order("created_at", { ascending: false })
          .limit(1);
        return {
          id: row.id,
          name: row.name,
          type: row.subject_type as SubjectType,
          avatarUrl: null,
          channelCount: count ?? 0,
          lastAuditAt: batches?.[0]?.created_at ?? null,
        };
      }),
    );

    return { subjects, source: "live" };
  } catch {
    return { subjects: fixtureSubjects(), source: "fixture" };
  }
}

export async function listChannelsForSubject(
  subjectId: string,
): Promise<ChannelSummary[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("subject_channels")
      .select("id, subject_id, channel_type, locator, managed")
      .eq("subject_id", subjectId)
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return data.map((row) => {
      const platform = row.channel_type as ChannelPlatform;
      const isWebsite = platform === "website";
      const locator = row.locator || "";
      return {
        id: row.id,
        platform,
        handle: isWebsite ? "" : locator.replace(/^@/, ""),
        url: isWebsite ? locator : null,
        ownershipStatus: (row.managed
          ? "managed"
          : "observed") as ChannelOwnershipStatus,
        displayName: isWebsite
          ? locator.replace(/^https?:\/\//, "")
          : locator.replace(/^@/, ""),
        avatarUrl: null,
        connected: Boolean(row.managed),
        subjectId: row.subject_id,
      };
    });
  } catch {
    return [];
  }
}

export async function getSubjectHomeBundle(
  subjectId: string,
): Promise<SubjectHomeBundle | null> {
  const { subjects, source } = await listSubjectsForUser();
  const subject = subjects.find((s) => s.id === subjectId);
  if (!subject) return null;

  if (source === "fixture") {
    return null;
  }

  const channels = await listChannelsForSubject(subjectId);
  const supabase = await createClient();

  const { data: briefs } = await supabase
    .from("living_brief_versions")
    .select(
      "id, subject_id, version, identity, audience, positioning, offers, goals, constraints, experiments, decisions, confirmed, created_at",
    )
    .eq("subject_id", subjectId)
    .order("version", { ascending: false });

  const briefVersions: LivingBriefVersion[] = (briefs ?? []).map((row) => ({
    id: row.id,
    subjectId: row.subject_id,
    version: row.version,
    content: {
      ...emptyBriefContent(subject.type),
      identity: jsonbText(row.identity),
      audience: jsonbText(row.audience),
      positioning: jsonbText(row.positioning),
      offers: jsonbText(row.offers),
      goals: jsonbText(row.goals),
      constraints: jsonbText(row.constraints),
      activeExperiments: jsonbText(row.experiments),
    },
    source: row.confirmed ? "user" : "user",
    parentVersionId: null,
    changeSummary: null,
    createdAt: row.created_at,
  }));

  const { data: proposalRows } = await supabase
    .from("context_update_proposals")
    .select(
      "id, subject_id, base_version, path, operation, proposed_value, evidence_ids, reason, status, created_at",
    )
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false })
    .limit(20);

  const proposals: LivingBriefProposal[] = (proposalRows ?? []).map((row) => ({
    id: row.id,
    subjectId: row.subject_id,
    parentVersionId: briefVersions[0]?.id ?? "",
    baseVersion: row.base_version,
    path: row.path,
    operation: row.operation as LivingBriefProposal["operation"],
    proposedValue: jsonbText(row.proposed_value),
    evidenceIds: Array.isArray(row.evidence_ids)
      ? (row.evidence_ids as string[])
      : [],
    changeExplanation: row.reason || "",
    status: row.status as LivingBriefProposal["status"],
    createdAt: row.created_at,
  }));

  const { data: runs } = await supabase
    .from("intelligence_runs")
    .select("id, created_at, status")
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false })
    .limit(5);

  const changeKindMap: Record<
    string,
    NonNullable<ScoreEvidence["changeReason"]>
  > = {
    evidence: "evidence_changed",
    brief_lens: "brief_changed",
    methodology: "methodology_changed",
    prior_correction: "prior_error_corrected",
  };

  const latestRunId = runs?.[0]?.id;
  let scores: ScoreEvidence[] = [];
  if (latestRunId) {
    const { data: scoreRows } = await supabase
      .from("scores")
      .select(
        "dimension, value, evidence_ids, methodology_version, previous_value, change_kind",
      )
      .eq("intelligence_run_id", latestRunId);
    scores = (scoreRows ?? []).map((row) => ({
      dimensionId: row.dimension,
      dimensionLabel: row.dimension.replace(/_/g, " "),
      evidenceIds: Array.isArray(row.evidence_ids)
        ? (row.evidence_ids as string[])
        : [],
      score: row.value == null ? null : Number(row.value),
      maxScore: 100,
      rationale: row.methodology_version
        ? `Methodology ${row.methodology_version}`
        : "",
      changeReason: row.change_kind
        ? (changeKindMap[row.change_kind] ?? "new")
        : row.previous_value == null
          ? "new"
          : null,
      previousScore:
        row.previous_value == null ? null : Number(row.previous_value),
    }));
  }

  const runIds = (runs ?? []).map((r) => r.id);
  let recommendations: RecommendationSummary[] = [];
  if (runIds.length > 0) {
    const { data: recRows } = await supabase
      .from("recommendations")
      .select(
        "id, recommendation_ref, content, status, evidence_ids, created_at, intelligence_run_id",
      )
      .in("intelligence_run_id", runIds)
      .order("created_at", { ascending: false })
      .limit(30);

    recommendations = (recRows ?? []).map((row) => {
      const content =
        row.content && typeof row.content === "object"
          ? (row.content as Record<string, unknown>)
          : {};
      const text =
        typeof content.text === "string"
          ? content.text
          : typeof content.title === "string"
            ? content.title
            : row.recommendation_ref;
      return {
        id: row.id,
        subjectId,
        auditId: "",
        text,
        status: row.status as RecommendationSummary["status"],
        evidenceIds: Array.isArray(row.evidence_ids)
          ? (row.evidence_ids as string[])
          : [],
        createdAt: row.created_at,
        updatedAt: row.created_at,
      };
    });
  }

  const { data: batchLinks } = await supabase
    .from("audit_batches")
    .select("id, created_at, batch_audits(audit_id, audits(id, handle, report_version, prompt_version, status, created_at))")
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false })
    .limit(10);

  const reports: ReportArchiveItem[] = [];
  for (const batch of batchLinks ?? []) {
    const links = (batch as { batch_audits?: unknown }).batch_audits;
    const arr = Array.isArray(links) ? links : links ? [links] : [];
    for (const link of arr) {
      const audit = (link as { audits?: Record<string, unknown> }).audits;
      if (!audit || audit.status !== "ready") continue;
      reports.push({
        id: String(audit.id),
        auditId: String(audit.id),
        channelLabel: `@${String(audit.handle ?? "unknown")}`,
        reportVersion: Number(audit.report_version ?? 1),
        promptVersion: audit.prompt_version
          ? String(audit.prompt_version)
          : null,
        createdAt: String(audit.created_at ?? batch.created_at),
        href: `/audits/${audit.id}`,
      });
    }
  }

  const sinceLast: SinceLastAuditItem[] = (runs ?? []).slice(0, 3).map((run) => ({
    id: run.id,
    kind: "evidence",
    title: `Intelligence run ${run.status}`,
    detail: "Pinned evidence snapshot and score ledger for this subject.",
    at: run.created_at,
  }));

  return {
    subject,
    channels,
    briefVersions,
    proposals,
    scores,
    recommendations,
    sinceLast,
    reports,
    source: "live",
  };
}
