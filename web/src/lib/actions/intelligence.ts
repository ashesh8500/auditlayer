/**
 * Server-side intelligence adapters wired to kernel service-role RPCs.
 * Fails closed when admin Supabase is not configured — no stub success paths.
 */

"use server";

import { revalidatePath } from "next/cache";

import { workspaceIntentBlocker } from "@/lib/workspace/intake";
import { loadAuditAllowance } from "@/lib/allowance";
import { bumpResourceRevision } from "@/lib/resources/mutation-revision";
import { requireProfile } from "@/lib/auth";
import {
  detectPlatform,
  evaluateIntake,
  type Goal,
  type Platform,
  type ReportType,
} from "@/lib/domain";
import { isSupabaseAdminConfigured } from "@/lib/env";
import {
  planRecommendationDecision,
  recommendationDecisionPlanError,
  recommendationSubjectIdFromRow,
  rpcLookupEntitledAuditBatchRetry,
  rpcRecordDecision,
  rpcRecordLivingBriefVersion,
  rpcResolveContextUpdateProposal,
  rpcSubmitEntitledAuditBatch,
  stubPrepareAndSubmitBatch,
  type DecisionLedgerRow,
  type EntitledBatchAuditInput,
  type PrepareBatchOutcome,
  type RecommendationDecisionValue,
} from "@/lib/intelligence/api";
import { buildBatchFingerprint } from "@/lib/intelligence/batch-idempotency";
import { canonicalizeWebsiteLocator, channelDedupeKey } from "@/lib/intelligence/channel-locator";
import { contentToKernelPayload } from "@/lib/intelligence/brief-project";
import {
  listBriefVersionsForSubject,
  listChannelsForSubject,
} from "@/lib/intelligence/subjects";
import type {
  BatchSubmission,
  ChannelPlatform,
  ChannelSummary,
  LivingBriefContent,
  LivingBriefVersion,
  SubjectType,
} from "@/lib/intelligence/types";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function prepareAndSubmitIntelligenceBatch(input: {
  submission: BatchSubmission;
  /** Explicit opt-in only; never infer a credit contract from an old plan. */
  workspaceIntent?: unknown;
  channelLocators: string[];
  /** Required when submission.subjectId is a client draft (`new-…`). */
  newSubjectName?: string;
  newSubjectType?: SubjectType;
  channelMeta?: Array<{
    locator: string;
    channelType: ChannelPlatform;
    channelId?: string;
  }>;
}): Promise<PrepareBatchOutcome> {
  const stub = stubPrepareAndSubmitBatch(
    input.submission,
    input.channelLocators,
  );
  if (!stub.ok) return stub;

  if (!isSupabaseAdminConfigured()) {
    return {
      ok: false,
      mode: "live",
      error: "Audit submission is not configured on this environment.",
    };
  }

  const profile = await requireProfile();
  if (Object.prototype.hasOwnProperty.call(input, "workspaceIntent")) {
    return { ok: false, mode: "live", error: workspaceIntentBlocker(input.workspaceIntent, profile.id) };
  }
  const admin = createAdminClient();

  try {
    const existingSubjectId = UUID_RE.test(input.submission.subjectId)
      ? input.submission.subjectId
      : null;
    const subjectId: string | null = existingSubjectId;
    let subjectIdentity: string;
    let subjectDraft: {
      name: string;
      subjectType: string;
      identity: Record<string, string>;
      goals: string[];
    } | null = null;

    if (!existingSubjectId) {
      const name = (input.newSubjectName || "").trim();
      if (!name) {
        return {
          ok: false,
          mode: "live",
          error: "Name the new subject before submitting.",
        };
      }
      const subjectType = input.newSubjectType ?? "creator";
      subjectIdentity = `draft:${subjectType}:${name.toLowerCase()}`;
      subjectDraft = {
        name,
        subjectType,
        identity: { name, subject_type: subjectType },
        goals: input.submission.changeNotes
          ? [input.submission.changeNotes.trim()]
          : [],
      };
    } else {
      subjectIdentity = `subject:${existingSubjectId}`;
    }

    const changeNotes = input.submission.changeNotes.trim();
    const auditIntents = input.submission.requests.map((request, index) => {
      const meta = input.channelMeta?.[index];
      const channelLocator =
        meta?.locator || input.channelLocators[index] || request.channelId;
      const channelType = meta?.channelType ?? null;
      const platform =
        channelType === "website"
          ? "unknown"
          : channelType || detectPlatform(channelLocator);
      return {
        channelId: request.channelId,
        channelType,
        channelLocator,
        platform,
        reportType: request.reportType,
        forceRefresh: request.forceRefresh,
      };
    });
    const idempotencyKey = buildBatchFingerprint({
      subjectIdentity,
      briefVersionId: input.submission.briefVersionId,
      changeNotes,
      audits: auditIntents,
    });
    const committedRetry = await rpcLookupEntitledAuditBatchRetry(admin, {
      userId: profile.id,
      idempotencyKey,
    });
    if (committedRetry) {
      await bumpResourceRevision("reports");
      await bumpResourceRevision("subjects");
      return {
        ok: true,
        mode: "live",
        ...committedRetry,
      };
    }

    if (existingSubjectId) {

      // Customer product routes are owner-scoped even for founder/admin profiles.
      // The RPC repeats this check while locking the subject through commit.
      const { data: ownedSubject, error: subjectError } = await admin
        .from("subjects")
        .select("id")
        .eq("id", existingSubjectId)
        .eq("user_id", profile.id)
        .maybeSingle();
      if (subjectError || !ownedSubject) {
        return { ok: false, mode: "live", error: "Subject not found." };
      }
    }

    const allowance = await loadAuditAllowance(admin, profile.id);
    const plan = allowance.effective_plan;
    const allowed = allowance.allowed_report_types;
    if (existingSubjectId) {
      const channels = await listChannelsForSubject(existingSubjectId);
      for (const intent of auditIntents) {
        const channel = channels.find((entry) => entry.id === intent.channelId) ?? channels.find((entry) =>
          intent.channelType === entry.platform && channelDedupeKey(entry.platform, entry.url || entry.handle) === channelDedupeKey(entry.platform, intent.channelLocator));
        if (!channel && !UUID_RE.test(intent.channelId)) continue; // new manually entered target
        if (!channel || channel.reconnectRequired || channel.ownershipStatus === "observed") {
          return { ok: false, mode: "live", error: "This channel is unavailable. Reconnect or manage it before submitting." };
        }
        // Resolve existing channel identity from the authorized DB row, not browser metadata.
        intent.channelLocator = channel.url || channel.handle;
        intent.channelType = channel.platform;
        intent.platform = channel.platform === "website" ? "unknown" : channel.platform;
      }
    }
    if (allowance.remaining !== null && input.submission.requests.length > allowance.remaining) {
      return { ok: false, mode: "live", error: allowance.window_valid
        ? "Your current access has reached its audit limit. Review your plan or wait for your next billing period."
        : "Your billing period is being reconciled. Refresh shortly or contact support." };
    }

    const plannedAudits: EntitledBatchAuditInput[] = [];
    const goal: Goal = "growth";

    for (let i = 0; i < input.submission.requests.length; i += 1) {
      const request = input.submission.requests[i]!;
      const intent = auditIntents[i]!;
      const locator = intent.channelLocator;
      const reportType = request.reportType as ReportType;
      if (!allowed.includes(reportType)) {
        return {
          ok: false,
          mode: "live",
          error: `Your ${plan} plan doesn't include ${reportType} reports.`,
        };
      }

      const channelType = intent.channelType;
      const platform = intent.platform as Platform;

      // An explicit website is not a social handle. Keep its host/path intact;
      // the worker still enforces DNS/private-network/SSRF restrictions.
      const website = channelType === "website" ? canonicalizeWebsiteLocator(locator) : null;
      if (website && (!/^https:\/\/[^/]+/.test(website) || !new URL(website).hostname.includes("."))) {
        return { ok: false, mode: "live", error: "Enter a valid public website address." };
      }
      const decision = website ? {
        accepted: true, normalizedHandle: website, platform: "unknown" as Platform,
        status: "queued", limitations: [] as string[], milestoneLabel: null,
        reasons: [] as string[],
      } : evaluateIntake(
        {
          handle: locator,
          goal,
          context: changeNotes,
          platform,
          plan,
        },
        0, // Quota is owned by audit_allowance + locked atomic SQL, not calibration.
      );
      if (!decision.accepted) {
        return {
          ok: false,
          mode: "live",
          error: decision.reasons[0] ?? "Audit was not accepted.",
        };
      }

      const normalizedHandle = channelType === "website"
        ? canonicalizeWebsiteLocator(locator)
        : decision.normalizedHandle || locator;
      const locatorForLink = channelType
        ? channelType === "website"
          ? canonicalizeWebsiteLocator(normalizedHandle)
          : normalizedHandle
        : null;
      plannedAudits.push({
        channelType: channelType ?? null,
        channelLocator: locatorForLink,
        handle: normalizedHandle,
        platform: channelType === "website" ? "unknown" : decision.platform,
        goal,
        reportType,
        context: changeNotes,
        status: channelType === "website" ? "queued" : decision.status,
        briefVersionId: input.submission.briefVersionId || null,
        limitations: decision.limitations,
        milestoneLabel: decision.milestoneLabel,
        forceRefresh: request.forceRefresh,
      });
    }

    const {
      batchId,
      auditIds,
      subjectId: persistedSubjectId,
    } = await rpcSubmitEntitledAuditBatch(admin, {
      userId: profile.id,
      subjectId,
      subjectDraft,
      idempotencyKey,
      audits: plannedAudits,
    });

    await bumpResourceRevision("reports");
    await bumpResourceRevision("subjects");
    revalidatePath("/subjects");
    revalidatePath("/dashboard");
    return {
      ok: true,
      mode: "live",
      batchId,
      auditIds,
      subjectId: persistedSubjectId,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Batch submit failed unexpectedly.";
    if (message.includes("billing_period_unreconciled")) {
      return { ok: false, mode: "live", error: "Your billing period is being reconciled. Refresh shortly or contact support." };
    }
    if (message.includes("audit_limit_reached")) {
      return {
        ok: false,
        mode: "live",
        error: "Your current access has reached its audit limit.",
      };
    }
    return {
      ok: false,
      mode: "live",
      error: "We couldn't create that batch.",
    };
  }
}

export async function resolveBriefProposalAction(input: {
  proposalId: string;
  status: "accepted" | "rejected";
}): Promise<{ ok: true; mode: "live"; subjectId: string; refresh: true } | { ok: false; error: string }> {
  if (!UUID_RE.test(input.proposalId)) {
    return { ok: false, error: "Invalid proposal." };
  }
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, error: "Could not save that decision right now." };
  }

  try {
    const profile = await requireProfile();
    const admin = createAdminClient();
    const { data: proposal, error: proposalError } = await admin.from("context_update_proposals")
      .select("subject_id").eq("id", input.proposalId).maybeSingle();
    if (proposalError || !proposal) return { ok: false, error: "Proposal not found." };
    const { data: owner } = await admin.from("subjects").select("id")
      .eq("id", proposal.subject_id).eq("user_id", profile.id).maybeSingle();
    if (!owner) return { ok: false, error: "Proposal not found." };
    await rpcResolveContextUpdateProposal(admin, {
      proposalId: input.proposalId,
      status: input.status,
      userId: profile.id,
    });
    const { data: resolved, error: readError } = await admin.from("context_update_proposals")
      .select("status").eq("id", input.proposalId).maybeSingle();
    if (readError || resolved?.status !== input.status) throw new Error("Decision could not be verified.");
    await bumpResourceRevision("subjects");
    revalidatePath(`/subjects/${proposal.subject_id}`);
    revalidatePath("/subjects");
    revalidatePath("/audits/new");
    return { ok: true, mode: "live", subjectId: proposal.subject_id, refresh: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not resolve proposal.",
    };
  }
}

export async function saveLivingBriefVersionAction(input: {
  subjectId: string;
  content: LivingBriefContent;
}): Promise<
  | { ok: true; versionId: string; version: number }
  | { ok: false; error: string }
> {
  if (!UUID_RE.test(input.subjectId)) {
    return { ok: false, error: "Invalid subject." };
  }
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, error: "Could not save the Living Brief right now." };
  }

  const identity = input.content.identity?.trim() ?? "";
  const audience = input.content.audience?.trim() ?? "";
  if (identity.length < 8 && audience.length < 8) {
    return {
      ok: false,
      error: "Add at least who you are or who you serve before saving.",
    };
  }

  try {
    const profile = await requireProfile();
    const admin = createAdminClient();

    const { data: subject, error: subjectError } = await admin
      .from("subjects")
      .select("id, user_id")
      .eq("id", input.subjectId)
      .maybeSingle();
    if (subjectError || !subject || subject.user_id !== profile.id) {
      return { ok: false, error: "Subject not found." };
    }

    const { data: latest } = await admin
      .from("living_brief_versions")
      .select("version")
      .eq("subject_id", input.subjectId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (latest?.version ?? 0) + 1;
    const payload = contentToKernelPayload(input.content);

    const versionId = await rpcRecordLivingBriefVersion(admin, {
      subjectId: input.subjectId,
      version: nextVersion,
      createdBy: profile.id,
      identity: payload.identity,
      audience: payload.audience,
      positioning: payload.positioning,
      offers: payload.offers,
      goals: payload.goals,
      constraints: payload.constraints,
      experiments: payload.experiments,
      decisions: payload.decisions,
      confirmed: true,
    });

    revalidatePath(`/subjects/${input.subjectId}`);
    revalidatePath("/subjects");
    revalidatePath("/audits/new");
    await bumpResourceRevision("subjects");

    return { ok: true, versionId, version: nextVersion };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not save Living Brief.",
    };
  }
}

export async function loadSubjectWizardContextAction(input: {
  subjectId: string;
}): Promise<
  | {
      ok: true;
      channels: ChannelSummary[];
      briefs: LivingBriefVersion[];
    }
  | { ok: false; error: string }
> {
  if (!UUID_RE.test(input.subjectId)) {
    return { ok: false, error: "Invalid subject." };
  }
  try {
    const profile = await requireProfile();
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data: subject } = await supabase
      .from("subjects")
      .select("id, subject_type")
      .eq("id", input.subjectId)
      .eq("user_id", profile.id)
      .maybeSingle();
    if (!subject) {
      return { ok: false, error: "Subject not found." };
    }
    const [channels, briefs] = await Promise.all([
      listChannelsForSubject(input.subjectId),
      listBriefVersionsForSubject(
        input.subjectId,
        subject.subject_type as SubjectType,
      ),
    ]);
    return { ok: true, channels, briefs };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Could not load subject channels.",
    };
  }
}

/**
 * Record a customer decision (accept/reject/modify) on a recommendation
 * through the canonical `decisions` ledger.
 *
 * One owner-checked customer action → one authoritative `record_decision` call
 * for valid submissions. Duplicate, stale, unsupported (superseded/garbage),
 * missing-note (modified without a refinement note), malformed, and
 * unauthorized submissions produce zero writes. The RPC itself revalidates and
 * locks subject ownership plus recommendation→subject linkage as the
 * authoritative transactional backstop.
 *
 * The decisions vocabulary is accepted/rejected/modified/superseded (additive
 * migration 20260807150000_decision_vocabulary_modified.sql). `modified`
 * requires a bounded non-empty refinement note. `recommendation_outcomes`
 * requires an observation window (it is the outcomes ledger, not the decision
 * ledger). See web/artifacts/recommendation-decisions-contract.json.
 */
export async function recordRecommendationDecisionAction(input: {
  subjectId: string;
  recommendationId: string;
  decision: string;
  note?: string;
}): Promise<
  | { ok: true; decisionId: string; decision: RecommendationDecisionValue }
  | { ok: false; error: string }
> {
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, error: "Could not save that decision right now." };
  }

  try {
    const profile = await requireProfile();
    const admin = createAdminClient();

    const { data: subject } = await admin
      .from("subjects")
      .select("id, user_id")
      .eq("id", input.subjectId)
      .eq("user_id", profile.id)
      .maybeSingle();

    const { data: rec } = await admin
      .from("recommendations")
      .select("id, intelligence_runs(subject_id)")
      .eq("id", input.recommendationId)
      .maybeSingle();

    const { data: existingRows } = await admin
      .from("decisions")
      .select("id, target_id, decision, note, user_id, created_at")
      .eq("target_type", "recommendation")
      .eq("target_id", input.recommendationId)
      .eq("user_id", profile.id);

    const plan = planRecommendationDecision({
      subjectId: input.subjectId,
      recommendationId: input.recommendationId,
      decision: input.decision,
      note: input.note,
      configured: true,
      profile: { id: profile.id, role: profile.role },
      subject: subject ?? null,
      recommendationSubjectId: recommendationSubjectIdFromRow(rec),
      existingDecisions: (existingRows ?? []) as DecisionLedgerRow[],
    });

    if (plan.action === "noop") {
      if (plan.reason === "duplicate" && plan.decisionId) {
        // Recovered success also invalidates a possibly stale subject view.
        await bumpResourceRevision("subjects");
        // Idempotent retry of an already-recorded decision: zero database writes.
        return {
          ok: true,
          decisionId: plan.decisionId,
          decision: input.decision as RecommendationDecisionValue,
        };
      }
      return {
        ok: false,
        error: recommendationDecisionPlanError(plan),
      };
    }

    const decisionId = await rpcRecordDecision(admin, plan.call);
    await bumpResourceRevision("subjects");
    revalidatePath(`/subjects/${input.subjectId}`);
    revalidatePath("/subjects");

    return { ok: true, decisionId, decision: plan.call.decision };
  } catch {
    return {
      ok: false,
      error: "Could not record that decision.",
    };
  }
}
