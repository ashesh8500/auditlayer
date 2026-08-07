/**
 * Server-side intelligence adapters wired to kernel service-role RPCs.
 * Fails closed when admin Supabase is not configured — no stub success paths.
 */

"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import {
  allowedReportTypesForProfile,
  detectPlatform,
  effectivePlanForProfile,
  evaluateIntake,
  USAGE_STATUSES,
  type Goal,
  type Platform,
  type ReportType,
} from "@/lib/domain";
import { isSupabaseAdminConfigured } from "@/lib/env";
import {
  buildBatchIdempotencyKey,
  planRecommendationDecision,
  recommendationDecisionPlanError,
  recommendationSubjectIdFromRow,
  rpcCreateSubject,
  rpcLinkSubjectChannel,
  rpcRecordDecision,
  rpcRecordLivingBriefVersion,
  rpcResolveContextUpdateProposal,
  rpcSubmitAuditBatch,
  stubPrepareAndSubmitBatch,
  type DecisionLedgerRow,
  type PrepareBatchOutcome,
  type RecommendationDecisionValue,
} from "@/lib/intelligence/api";
import { canonicalizeWebsiteLocator } from "@/lib/intelligence/channel-locator";
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
  const admin = createAdminClient();
  const plan = effectivePlanForProfile(profile as never);
  const allowed = allowedReportTypesForProfile(profile as never);

  try {
    let subjectId = input.submission.subjectId;
    if (!UUID_RE.test(subjectId)) {
      const name = (input.newSubjectName || "").trim();
      if (!name) {
        return {
          ok: false,
          mode: "live",
          error: "Name the new subject before submitting.",
        };
      }
      subjectId = await rpcCreateSubject(admin, {
        userId: profile.id,
        name,
        subjectType: input.newSubjectType ?? "creator",
      });
      await rpcRecordLivingBriefVersion(admin, {
        subjectId,
        version: 1,
        createdBy: profile.id,
        identity: { name, subject_type: input.newSubjectType ?? "creator" },
        goals: input.submission.changeNotes
          ? [input.submission.changeNotes.trim()]
          : [],
        confirmed: true,
      });
    }

    const { count } = await admin
      .from("audits")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .in("status", USAGE_STATUSES);
    const usage = count ?? 0;
    const giftedAudits = Number(
      (profile as { gifted_audits?: number }).gifted_audits ?? 0,
    );

    const auditIds: string[] = [];
    const goal: Goal = "growth";
    const changeNotes = input.submission.changeNotes.trim();

    for (let i = 0; i < input.submission.requests.length; i += 1) {
      const request = input.submission.requests[i]!;
      const meta = input.channelMeta?.[i];
      const locator =
        meta?.locator ||
        input.channelLocators[i] ||
        request.channelId;
      const reportType = request.reportType as ReportType;
      if (!allowed.includes(reportType)) {
        return {
          ok: false,
          mode: "live",
          error: `Your ${plan} plan doesn't include ${reportType} reports.`,
        };
      }

      const channelType = meta?.channelType;
      let platform: Platform;
      if (channelType === "website") {
        platform = "unknown";
      } else if (channelType) {
        platform = channelType as Platform;
      } else {
        platform = detectPlatform(locator);
      }

      const decision = evaluateIntake(
        {
          handle: locator,
          goal,
          context: changeNotes,
          platform,
          plan,
        },
        usage + auditIds.length,
        null,
        Math.max(0, giftedAudits - auditIds.length),
      );
      if (!decision.accepted) {
        return {
          ok: false,
          mode: "live",
          error: decision.reasons[0] ?? "Audit was not accepted.",
        };
      }

      if (UUID_RE.test(subjectId) && channelType) {
        const locatorForLink =
          channelType === "website"
            ? canonicalizeWebsiteLocator(decision.normalizedHandle || locator)
            : decision.normalizedHandle || locator;
        await rpcLinkSubjectChannel(admin, {
          subjectId,
          channelType,
          locator: locatorForLink,
          managed: true,
        });
      }

      const { data: audit, error } = await admin.rpc("submit_entitled_audit", {
        p_user_id: profile.id,
        p_handle: decision.normalizedHandle || locator,
        p_platform: decision.platform,
        p_goal: goal,
        p_report_type: reportType,
        p_context: changeNotes,
        p_status: decision.status,
        p_limitations: decision.limitations,
        p_milestone_label: decision.milestoneLabel,
      });
      const row = audit as { id?: string } | null;
      if (error || !row?.id) {
        return {
          ok: false,
          mode: "live",
          error: error?.message?.includes("audit_limit_reached")
            ? "Your current access has reached its audit limit."
            : "We couldn't create an audit for that channel.",
        };
      }
      auditIds.push(row.id);

      await admin.from("audit_events").insert({
        audit_id: row.id,
        actor: "client",
        event_type: "audit_submitted",
        phase: "intake",
        detail: `batch_subject=${subjectId}; platform=${decision.platform}`,
      });
    }

    const idempotencyKey = buildBatchIdempotencyKey(
      { ...input.submission, subjectId },
      input.channelLocators,
    );
    const batchId = await rpcSubmitAuditBatch(admin, {
      userId: profile.id,
      subjectId,
      idempotencyKey,
      auditIds,
    });

    return {
      ok: true,
      mode: "live",
      batchId,
      auditIds,
      subjectId,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Batch submit failed unexpectedly.";
    return { ok: false, mode: "live", error: message };
  }
}

export async function resolveBriefProposalAction(input: {
  proposalId: string;
  status: "accepted" | "rejected";
}): Promise<{ ok: true; mode: "live" } | { ok: false; error: string }> {
  if (!UUID_RE.test(input.proposalId)) {
    return { ok: false, error: "Invalid proposal." };
  }
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, error: "Could not save that decision right now." };
  }

  try {
    const profile = await requireProfile();
    const admin = createAdminClient();
    await rpcResolveContextUpdateProposal(admin, {
      proposalId: input.proposalId,
      status: input.status,
      userId: profile.id,
    });
    return { ok: true, mode: "live" };
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
    await requireProfile();
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data: subject } = await supabase
      .from("subjects")
      .select("id, subject_type")
      .eq("id", input.subjectId)
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
 * One owner/admin-checked action → one authoritative `record_decision` call
 * for valid submissions. Duplicate, stale, unsupported (superseded/garbage),
 * missing-note (modified without a refinement note), malformed, and
 * unauthorized submissions produce zero writes. The RPC itself validates
 * recommendation→subject linkage as the authoritative backstop.
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
        // Idempotent retry of an already-recorded decision: zero writes.
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
    revalidatePath(`/subjects/${input.subjectId}`);
    revalidatePath("/subjects");

    return { ok: true, decisionId, decision: plan.call.decision };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Could not record that decision.",
    };
  }
}
