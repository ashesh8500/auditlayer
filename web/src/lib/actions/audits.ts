"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";
import {
  auditLimitForProfile,
  effectivePlanForProfile,
  evaluateIntake,
  USAGE_STATUSES,
  type Goal,
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
    context: formData.get("context") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message };
  }

  const admin = createAdminClient();

  // Enforce the plan's audit allowance server-side (PLAN_LIMITS).
  const { count } = await admin
    .from("audits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .in("status", USAGE_STATUSES);

  const usage = count ?? 0;
  const limit = auditLimitForProfile(profile);
  if (usage >= limit) {
    return {
      status: "error",
      limitReached: true,
      message:
        profile.plan === "free"
          ? "You've used your free audit. Upgrade to run more."
          : `Your ${profile.plan} plan allows ${limit} audits. Upgrade for more capacity.`,
    };
  }

  const decision = evaluateIntake(
    {
      handle: parsed.data.handle,
      goal: parsed.data.goal as Goal,
      context: parsed.data.context,
      plan: effectivePlanForProfile(profile),
    },
    usage,
  );

  const { data: audit, error } = await admin
    .from("audits")
    .insert({
      user_id: profile.id,
      handle: decision.normalizedHandle,
      platform: decision.platform,
      goal: parsed.data.goal,
      context: parsed.data.context,
      status: decision.status,
      limitations: decision.limitations,
      milestone_label: decision.milestoneLabel,
    })
    .select("id")
    .single();

  if (error || !audit) {
    return {
      status: "error",
      message: "We couldn't create that audit. Please try again.",
    };
  }

  await admin.from("audit_events").insert({
    audit_id: audit.id,
    actor: "client",
    event_type: "audit_submitted",
    phase: "intake",
    detail: `status=${decision.status}; platform=${decision.platform}`,
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
