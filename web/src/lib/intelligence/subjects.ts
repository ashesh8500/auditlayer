import "server-only";
import { readSubjectHistory, readSubjectPages } from "./subject-reads";

import { isLiveInstagramConnection } from "@/lib/account-ownership";
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
import { dedupeChannels, channelDedupeKey } from "@/lib/intelligence/channel-locator";
import {
  projectBriefField,
  projectLivingBriefContent,
} from "@/lib/intelligence/brief-project";
import {
  projectLatestDecision,
  type DecisionLedgerRow,
} from "@/lib/intelligence/api";

export type SubjectListSource = "live";

export type BrandContextVersion = LivingBriefVersion & { confirmed?: boolean; authorLabel?: string };

export type SubjectHomeBundle = {
  subject: SubjectSummary;
  channels: ChannelSummary[];
  briefVersions: BrandContextVersion[];
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
  if (!isSupabaseConfigured()) throw new Error("Subject data could not be loaded. Please retry.");
  const profile = await requireProfile();
  const supabase = await createClient();
  const data = await readSubjectPages((a, b) => supabase.from("subjects")
    .select("id, name, subject_type, created_at").eq("user_id", profile.id)
    .order("created_at", { ascending: false }).order("id").range(a, b));
  const active = data.filter(row => !String(row.name).startsWith("Archived · "));
  const subjects: SubjectSummary[] = [];
  // Bounded groups avoid oversized URL filters; all child reads must succeed.
  for (let i = 0; i < active.length; i += 100) {
    const group = active.slice(i, i + 100);
    const channelRows = await readSubjectPages((a, b) => supabase.from("subject_channels")
      .select("id, subject_id, channel_type, locator").in("subject_id", group.map(r => r.id))
      .order("id").range(a, b));
    const counts = new Map<string, Set<string>>();
    for (const channel of channelRows) {
      const keys = counts.get(channel.subject_id) ?? new Set<string>();
      const key = channelDedupeKey(channel.channel_type as ChannelPlatform, channel.locator ?? "");
      if (!key.endsWith(":")) keys.add(key);
      counts.set(channel.subject_id, keys);
    }
    for (const row of group) subjects.push({
      id: row.id, name: row.name, type: row.subject_type as SubjectType,
      avatarUrl: null, channelCount: counts.get(row.id)?.size ?? 0,
      // History timestamps live on detail; do not mislabel batch-only activity as complete history.
      lastAuditAt: null,
    });
  }
  return { subjects, source: "live" };
}

export async function listChannelsForSubject(
  subjectId: string,
): Promise<ChannelSummary[]> {
  if (!isSupabaseConfigured()) throw new Error("Subject data could not be loaded. Please retry.");
    const profile = await requireProfile();
    const supabase = await createClient();
    const owned = await supabase.from("subjects").select("id").eq("id", subjectId).eq("user_id", profile.id).maybeSingle();
    if (owned.error) throw new Error("Subject data could not be loaded. Please retry.");
    if (!owned.data) return [];
    const data = await readSubjectPages((a, b) => supabase
      .from("subject_channels")
      .select(
        "id, subject_id, channel_type, locator, managed, account_id, accounts(id, user_id, ownership_status, ig_connection_id, display_name, instagram_connections(user_id,is_active,long_lived_expires_at,connection_status))",
      )
      .eq("subject_id", subjectId)
      .order("created_at", { ascending: true }).order("id").range(a, b));
    const mapped = data.map((row) => {
      const platform = row.channel_type as ChannelPlatform;
      const isWebsite = platform === "website";
      const locator = row.locator || "";
      const accountRaw = (
        row as {
          accounts?: {
            user_id?: string;
            ownership_status?: string | null;
            ig_connection_id?: string | null;
            display_name?: string | null;
            instagram_connections?: {
              user_id?: string;
              is_active: boolean;
              long_lived_expires_at: string | null;
              connection_status: "connected" | "reconnect_required";
            } | null;
          } | null;
        }
      ).accounts;
      const candidate = Array.isArray(accountRaw) ? accountRaw[0] : accountRaw;
      const account = candidate?.user_id === profile.id ? candidate : null;
      const linked = Boolean(
        account?.ig_connection_id || account?.ownership_status === "connected",
      );
      const connected = linked && account?.instagram_connections?.user_id === profile.id && isLiveInstagramConnection(account.instagram_connections);
      const reconnectRequired = platform === "instagram" && (linked || Boolean(row.managed)) && !connected;
      const ownershipStatus: ChannelOwnershipStatus = linked
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
        reconnectRequired,
        subjectId: row.subject_id,
      };
    });
    return dedupeChannels(mapped);
}

export async function listBriefVersionsForSubject(
  subjectId: string,
  subjectType: SubjectType,
): Promise<BrandContextVersion[]> {
  if (!isSupabaseConfigured()) throw new Error("Subject data could not be loaded. Please retry.");
    const profile = await requireProfile();
    const supabase = await createClient();
    const owned = await supabase.from("subjects").select("id").eq("id", subjectId).eq("user_id", profile.id).maybeSingle();
    if (owned.error) throw new Error("Subject data could not be loaded. Please retry.");
    if (!owned.data) return [];
    const briefs = await readSubjectPages((a, b) => supabase
      .from("living_brief_versions")
      .select(
        "id, subject_id, version, identity, audience, positioning, offers, goals, constraints, experiments, decisions, confirmed, created_by, created_at",
      )
      .eq("subject_id", subjectId)
      .order("version", { ascending: false }).order("id").range(a, b));
    return briefs.map((row) => ({
      id: row.id,
      subjectId: row.subject_id,
      version: row.version,
      content: projectLivingBriefContent(subjectType, row),
      source: "user" as const, // Compatibility field; author/confirmation below are authoritative for UI.
      confirmed: row.confirmed,
      authorLabel: row.created_by === profile.id ? "You" : "Unknown",
      parentVersionId: null,
      changeSummary: null,
      createdAt: row.created_at,
    }));
}

export async function getSubjectHomeBundle(
  subjectId: string,
): Promise<SubjectHomeBundle | null> {
  if (!isSupabaseConfigured()) throw new Error("Subject data could not be loaded. Please retry.");

    const profile = await requireProfile();
    const supabase = await createClient();
    const { data: row, error } = await supabase
      .from("subjects")
      .select("id, name, subject_type, created_at")
      .eq("id", subjectId)
      .eq("user_id", profile.id)
      .maybeSingle();
    if (error) throw new Error("Subject data could not be loaded. Please retry.");
    if (!row) return null;
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
      readSubjectHistory(supabase, profile.id, subjectId),
    ]);

    if (proposalResult.error || runsResult.error) throw new Error("Subject data could not be loaded. Please retry.");

    const subject: SubjectSummary = {
      id: row.id,
      name: row.name,
      type: row.subject_type as SubjectType,
      avatarUrl: null,
      channelCount: channels.length,
      lastAuditAt: batchResult[0]?.createdAt ?? null,
    };

    const proposals: LivingBriefProposal[] = (proposalResult.data ?? []).map(
      (proposal) => ({
        id: proposal.id,
        subjectId: proposal.subject_id,
        parentVersionId: briefVersions.find(v => v.version === proposal.base_version)?.id ?? "",
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
        : Promise.resolve({ data: null, error: null }),
      runIds.length > 0
        ? supabase
            .from("recommendations")
            .select(
              "id, recommendation_ref, content, status, evidence_ids, created_at, intelligence_run_id",
            )
            .in("intelligence_run_id", runIds)
            .order("created_at", { ascending: false })
            .limit(30)
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (scoreResult.error || recResult.error) throw new Error("Subject data could not be loaded. Please retry.");

    // Latest durable customer decision per recommendation (decisions ledger).
    // RLS scopes reads to the acting user's own decisions; the projection is
    // deterministic (newest created_at wins, id tie-break).
    const recRows = recResult.data ?? [];
    const recIds = recRows.map((row) => row.id);
    let decisionRows: DecisionLedgerRow[] = [];
    if (recIds.length > 0) {
      const { data: dRows, error: decisionError } = await supabase
        .from("decisions")
        .select("id, target_id, decision, note, user_id, created_at")
        .eq("target_type", "recommendation")
        .in("target_id", recIds);
      if (decisionError) throw new Error("Subject data could not be loaded. Please retry.");
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

    const reports = batchResult;

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
}
