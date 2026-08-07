import "server-only";

import { requireProfile } from "@/lib/auth";
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
  ScoreEvidence,
  RecommendationSummary,
  ReportArchiveItem,
  SinceLastAuditItem,
} from "@/lib/intelligence/types";
import { dedupeChannels } from "@/lib/intelligence/channel-locator";
import {
  projectBriefField,
  projectLivingBriefContent,
} from "@/lib/intelligence/brief-project";
import {
  projectLatestDecision,
  type DecisionLedgerRow,
} from "@/lib/intelligence/api";

export type SubjectListSource = "live";

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

export async function listSubjectsForUser(): Promise<{
  subjects: SubjectSummary[];
  source: SubjectListSource;
}> {
  if (!isSupabaseConfigured()) {
    return { subjects: [], source: "live" };
  }

  try {
    const profile = await requireProfile();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("subjects")
      .select("id, name, subject_type, created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false });

    if (error || !data) {
      return { subjects: [], source: "live" };
    }

    if (data.length === 0) {
      return { subjects: [], source: "live" };
    }

    const active = data.filter(
      (row) => !String(row.name).startsWith("Archived · "),
    );

    if (active.length === 0) {
      return { subjects: [], source: "live" };
    }

    const ids = active.map((row) => row.id);

    // One channels query + one batches query — avoid per-subject waterfalls.
    const [{ data: channelRows }, { data: batchRows }] = await Promise.all([
      supabase
        .from("subject_channels")
        .select("id, subject_id, channel_type, locator, managed, account_id")
        .in("subject_id", ids),
      supabase
        .from("audit_batches")
        .select("subject_id, created_at")
        .in("subject_id", ids)
        .order("created_at", { ascending: false }),
    ]);

    const channelCountBySubject = new Map<string, number>();
    const seenChannelKeys = new Set<string>();
    for (const row of channelRows ?? []) {
      const key = `${row.subject_id}:${row.channel_type}:${String(row.locator ?? "")
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/+$/, "")
        .replace(/^@/, "")}`;
      if (seenChannelKeys.has(key)) continue;
      seenChannelKeys.add(key);
      channelCountBySubject.set(
        row.subject_id,
        (channelCountBySubject.get(row.subject_id) ?? 0) + 1,
      );
    }

    const lastAuditBySubject = new Map<string, string>();
    for (const row of batchRows ?? []) {
      if (!lastAuditBySubject.has(row.subject_id)) {
        lastAuditBySubject.set(row.subject_id, row.created_at);
      }
    }

    const subjects: SubjectSummary[] = active.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.subject_type as SubjectType,
      avatarUrl: null,
      channelCount: channelCountBySubject.get(row.id) ?? 0,
      lastAuditAt: lastAuditBySubject.get(row.id) ?? null,
    }));

    return { subjects, source: "live" };
  } catch {
    return { subjects: [], source: "live" };
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
      .select(
        "id, subject_id, channel_type, locator, managed, account_id, accounts(id, ownership_status, ig_connection_id, display_name)",
      )
      .eq("subject_id", subjectId)
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    const mapped = data.map((row) => {
      const platform = row.channel_type as ChannelPlatform;
      const isWebsite = platform === "website";
      const locator = row.locator || "";
      const accountRaw = (
        row as {
          accounts?: {
            ownership_status?: string | null;
            ig_connection_id?: string | null;
            display_name?: string | null;
          } | null;
        }
      ).accounts;
      const account = Array.isArray(accountRaw) ? accountRaw[0] : accountRaw;
      const connected = Boolean(
        account?.ig_connection_id || account?.ownership_status === "connected",
      );
      const ownershipStatus: ChannelOwnershipStatus = connected
        ? "connected"
        : row.managed
          ? "managed"
          : "observed";
      return {
        id: row.id,
        platform,
        handle: isWebsite ? "" : locator.replace(/^@/, ""),
        url: isWebsite ? locator : null,
        ownershipStatus,
        displayName: isWebsite
          ? locator.replace(/^https?:\/\//, "")
          : account?.display_name || locator.replace(/^@/, ""),
        avatarUrl: null,
        connected,
        subjectId: row.subject_id,
      };
    });
    return dedupeChannels(mapped);
  } catch {
    return [];
  }
}

export async function listBriefVersionsForSubject(
  subjectId: string,
  subjectType: SubjectType,
): Promise<LivingBriefVersion[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data: briefs, error } = await supabase
      .from("living_brief_versions")
      .select(
        "id, subject_id, version, identity, audience, positioning, offers, goals, constraints, experiments, decisions, confirmed, created_at",
      )
      .eq("subject_id", subjectId)
      .order("version", { ascending: false });
    if (error || !briefs) return [];
    return briefs.map((row) => ({
      id: row.id,
      subjectId: row.subject_id,
      version: row.version,
      content: projectLivingBriefContent(subjectType, row),
      source: row.confirmed ? ("user" as const) : ("user" as const),
      parentVersionId: null,
      changeSummary: null,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}

export async function getSubjectHomeBundle(
  subjectId: string,
): Promise<SubjectHomeBundle | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const profile = await requireProfile();
    const supabase = await createClient();
    const { data: row, error } = await supabase
      .from("subjects")
      .select("id, name, subject_type, created_at")
      .eq("id", subjectId)
      .eq("user_id", profile.id)
      .maybeSingle();
    if (error || !row) return null;
    if (String(row.name).startsWith("Archived · ")) return null;

    const [
      channels,
      briefVersions,
      proposalResult,
      runsResult,
      batchResult,
    ] = await Promise.all([
      listChannelsForSubject(subjectId),
      listBriefVersionsForSubject(subjectId, row.subject_type as SubjectType),
      supabase
        .from("context_update_proposals")
        .select(
          "id, subject_id, base_version, path, operation, proposed_value, evidence_ids, reason, status, created_at",
        )
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("intelligence_runs")
        .select("id, created_at, status")
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("audit_batches")
        .select(
          "id, created_at, batch_audits(audit_id, audits(id, handle, report_version, prompt_version, status, created_at))",
        )
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const subject: SubjectSummary = {
      id: row.id,
      name: row.name,
      type: row.subject_type as SubjectType,
      avatarUrl: null,
      channelCount: channels.length,
      lastAuditAt: batchResult.data?.[0]?.created_at ?? null,
    };

    const proposals: LivingBriefProposal[] = (proposalResult.data ?? []).map(
      (proposal) => ({
        id: proposal.id,
        subjectId: proposal.subject_id,
        parentVersionId: briefVersions[0]?.id ?? "",
        baseVersion: proposal.base_version,
        path: proposal.path,
        operation: proposal.operation as LivingBriefProposal["operation"],
        proposedValue: projectBriefField(proposal.proposed_value),
        evidenceIds: Array.isArray(proposal.evidence_ids)
          ? (proposal.evidence_ids as string[])
          : [],
        changeExplanation: proposal.reason || "",
        status: proposal.status as LivingBriefProposal["status"],
        createdAt: proposal.created_at,
      }),
    );

    const runs = runsResult.data ?? [];
    const changeKindMap: Record<
      string,
      NonNullable<ScoreEvidence["changeReason"]>
    > = {
      evidence: "evidence_changed",
      brief_lens: "brief_changed",
      methodology: "methodology_changed",
      prior_correction: "prior_error_corrected",
    };

    const latestRunId = runs[0]?.id;
    const runIds = runs.map((r) => r.id);

    const [scoreResult, recResult] = await Promise.all([
      latestRunId
        ? supabase
            .from("scores")
            .select(
              "dimension, value, evidence_ids, methodology_version, previous_value, change_kind",
            )
            .eq("intelligence_run_id", latestRunId)
        : Promise.resolve({ data: null }),
      runIds.length > 0
        ? supabase
            .from("recommendations")
            .select(
              "id, recommendation_ref, content, status, evidence_ids, created_at, intelligence_run_id",
            )
            .in("intelligence_run_id", runIds)
            .order("created_at", { ascending: false })
            .limit(30)
        : Promise.resolve({ data: null }),
    ]);

    // Latest durable customer decision per recommendation (decisions ledger).
    // RLS scopes reads to the acting user's own decisions; the projection is
    // deterministic (newest created_at wins, id tie-break).
    const recRows = recResult.data ?? [];
    const recIds = recRows.map((row) => row.id);
    let decisionRows: DecisionLedgerRow[] = [];
    if (recIds.length > 0) {
      const { data: dRows } = await supabase
        .from("decisions")
        .select("id, target_id, decision, note, user_id, created_at")
        .eq("target_type", "recommendation")
        .in("target_id", recIds);
      decisionRows = (dRows ?? []) as DecisionLedgerRow[];
    }
    const decisionMap = projectLatestDecision(decisionRows);

    const scores: ScoreEvidence[] = (scoreResult.data ?? []).map((scoreRow) => ({
      dimensionId: scoreRow.dimension,
      dimensionLabel: scoreRow.dimension.replace(/_/g, " "),
      evidenceIds: Array.isArray(scoreRow.evidence_ids)
        ? (scoreRow.evidence_ids as string[])
        : [],
      score: scoreRow.value == null ? null : Number(scoreRow.value),
      maxScore: 100,
      rationale: scoreRow.methodology_version
        ? `Methodology ${scoreRow.methodology_version}`
        : "",
      changeReason: scoreRow.change_kind
        ? (changeKindMap[scoreRow.change_kind] ?? "new")
        : scoreRow.previous_value == null
          ? "new"
          : null,
      previousScore:
        scoreRow.previous_value == null
          ? null
          : Number(scoreRow.previous_value),
    }));

    const recommendations: RecommendationSummary[] = recRows.map((recRow) => {
      const content =
        recRow.content && typeof recRow.content === "object"
          ? (recRow.content as Record<string, unknown>)
          : {};
      const text =
        typeof content.text === "string"
          ? content.text
          : typeof content.title === "string"
            ? content.title
            : recRow.recommendation_ref;
      return {
        id: recRow.id,
        subjectId,
        auditId: "",
        text,
        status: recRow.status as RecommendationSummary["status"],
        evidenceIds: Array.isArray(recRow.evidence_ids)
          ? (recRow.evidence_ids as string[])
          : [],
        createdAt: recRow.created_at,
        updatedAt: recRow.created_at,
        decision: decisionMap[recRow.id] ?? null,
      };
    });

    const reports: ReportArchiveItem[] = [];
    for (const batch of batchResult.data ?? []) {
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

    const sinceLast: SinceLastAuditItem[] = [];

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
  } catch {
    return null;
  }
}
