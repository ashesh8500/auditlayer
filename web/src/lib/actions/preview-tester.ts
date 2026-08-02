"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import {
  applyPreviewTesterPlan,
  seedPreviewDemoSubjects,
} from "@/lib/auth/preview-seed";
import type { Plan } from "@/lib/domain";
import {
  isPreviewLoginAllowed,
  isPreviewTesterEmail,
  isSupabaseAdminConfigured,
} from "@/lib/env";

export type PreviewTesterActionState = {
  status: "idle" | "ok" | "error";
  message?: string;
};

const PLANS = new Set<Plan>(["free", "starter", "pro", "enterprise"]);

function assertPreviewTester(email: string | null | undefined): string | null {
  if (!isPreviewLoginAllowed()) {
    return "Preview tester controls are disabled outside Preview / local.";
  }
  if (!isPreviewTesterEmail(email)) {
    return "Only the preview tester account can use this setup panel.";
  }
  if (!isSupabaseAdminConfigured()) {
    return "Supabase admin is not configured.";
  }
  return null;
}

export async function setPreviewTesterPlan(
  _prev: PreviewTesterActionState,
  formData: FormData,
): Promise<PreviewTesterActionState> {
  const profile = await requireProfile();
  const blocked = assertPreviewTester(profile.email);
  if (blocked) return { status: "error", message: blocked };

  const plan = String(formData.get("plan") ?? "").trim() as Plan;
  if (!PLANS.has(plan)) {
    return { status: "error", message: "Choose a valid plan." };
  }

  try {
    await applyPreviewTesterPlan(profile.id, plan);
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Could not update plan.",
    };
  }

  revalidatePath("/subjects");
  revalidatePath("/audits/new");
  revalidatePath("/dashboard");
  revalidatePath("/preview-setup");
  return {
    status: "ok",
    message: `Plan set to ${plan}. Standard/extended report types follow this plan.`,
  };
}

export async function reseedPreviewDemoSubjects(
  _prev: PreviewTesterActionState,
  formData: FormData,
): Promise<PreviewTesterActionState> {
  void formData;
  const profile = await requireProfile();
  const blocked = assertPreviewTester(profile.email);
  if (blocked) return { status: "error", message: blocked };

  try {
    const result = await seedPreviewDemoSubjects(profile.id, { force: true });
    revalidatePath("/subjects");
    revalidatePath("/audits/new");
    revalidatePath("/preview-setup");
    return {
      status: "ok",
      message: `Reseeded ${result.subjectIds.length} demo subjects (Narin Fazlalipour + GlowState Wellness).`,
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Reseed failed.",
    };
  }
}
