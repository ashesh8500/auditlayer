"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";
import {
  effectivePlanForProfile,
  evaluateIntake,
  USAGE_STATUSES,
  allowedReportTypesForProfile,
  type Goal,
  type ReportType,
} from "@/lib/domain";

export interface CreateAuditState {
  status: "idle" | "error";
  message?: string;
  limitReached?: boolean;
}

const intakeSchema = z.object({
  handle: z
    .string()
    .trim()
    .min(2, { error: "Enter a public handle or profile URL." })
    .max(300),
  goal: z.enum(["growth", "monetization", "rebrand", "launch_readiness"]),
  report_type: z.enum(["pulse", "standard", "extended", "enterprise", "blueprint"]).default("standard"),
  context: z.string().trim().max(2000).optional().default(""),
});

export async function createAudit(
  _prev: CreateAuditState,
  formData: FormData,
): Promise<CreateAuditState> {
  const profile = await requireProfile();

  if (!isSupabaseAdminConfigured()) {
    return {
      status: "error",
      message: "Audit submission isn't configured yet. Please try again later.",
    };
  }

  const parsed = intakeSchema.safeParse({
    handle: formData.get("handle"),
    goal: formData.get("goal"),
    report_type: formData.get("report_type") ?? "standard",
    context: formData.get("context") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message };
  }

  // Validate report_type against plan
  const plan = effectivePlanForProfile(profile as never);
  const allowed = allowedReportTypesForProfile(profile as never);
  const reportType = (parsed.data.report_type || "standard") as ReportType;
  if (!allowed.includes(reportType)) {
    return {
      status: "error",
      message: `Your ${plan} plan doesn't include ${reportType} reports. Upgrade to access this report type.`,
    };
  }

  const admin = createAdminClient();

  const { count } = await admin
    .from("audits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .in("status", USAGE_STATUSES);
  const usage = count ?? 0;
  const giftedAudits = Number(
    (profile as { gifted_audits?: number }).gifted_audits ?? 0,
  );

  const decision = evaluateIntake(
    {
      handle: parsed.data.handle,
      goal: parsed.data.goal as Goal,
      context: parsed.data.context,
      plan: effectivePlanForProfile(profile as never),
    },
    usage,
    undefined,
    giftedAudits,
  );

  const { data: auditResult, error } = await (admin as any).rpc(
    "submit_entitled_audit",
    {
      p_user_id: profile.id,
      p_handle: decision.normalizedHandle,
      p_platform: decision.platform,
      p_goal: parsed.data.goal,
      p_report_type: reportType,
      p_context: parsed.data.context,
      p_status: decision.status,
      p_limitations: decision.limitations,
      p_milestone_label: decision.milestoneLabel,
    },
  );
  const audit = auditResult as {
    id?: string;
    gifted_consumed?: boolean;
  } | null;

  if (error || !audit?.id) {
    console.error("createAudit insert failed", {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    });
    return {
      status: "error",
      limitReached: error?.message?.includes("audit_limit_reached") ?? false,
      message: error?.message?.includes("audit_limit_reached")
        ? "Your current access has reached its audit limit. Upgrade or ask a founder for access."
        : "We couldn't create that audit. Please try again.",
    };
  }

  await admin.from("audit_events").insert({
    audit_id: audit.id,
    actor: "client",
    event_type: "audit_submitted",
    phase: "intake",
    detail: `status=${decision.status}; platform=${decision.platform}; gifted_consumed=${Boolean(audit.gifted_consumed)}`,
  });

  if (decision.limitations.length > 0) {
    await admin.from("audit_events").insert({
      audit_id: audit.id,
      actor: "system",
      event_type: "limitations_recorded",
      phase: "intake",
      detail: decision.limitations.join(" | "),
    });
  }

  if (decision.status === "queued") {
    await admin.from("audit_events").insert({
      audit_id: audit.id,
      actor: "system",
      event_type: "audit_queued",
      phase: "queued",
      detail: "Accepted and waiting for the worker.",
    });
  }

  redirect(`/audits/${audit.id}`);
}
