"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";
import { validateRefinement } from "@/lib/refinement";

export interface RefinementState {
  status: "idle" | "queued" | "error";
  message?: string;
}

/**
 * Section-scoped refinement enqueue. Verifies ownership + report readiness,
 * runs the same guardrails as the legacy service (allowed sections + blocked
 * terms), then inserts a `refinements` row via the SERVICE-ROLE client (the
 * browser has SELECT only). The Python worker processes the queue.
 */
export async function requestRefinement(
  _prev: RefinementState,
  formData: FormData,
): Promise<RefinementState> {
  const profile = await requireProfile();

  if (!isSupabaseAdminConfigured()) {
    return { status: "error", message: "Refinements aren't configured yet." };
  }

  const auditId = String(formData.get("auditId") ?? "");
  const section = String(formData.get("section") ?? "");
  const instruction = String(formData.get("instruction") ?? "");

  const check = validateRefinement(section, instruction);
  if (!check.ok) {
    return { status: "error", message: check.error };
  }

  // Ownership + readiness via the user's RLS-scoped client.
  const supabase = await createClient();
  const { data: audit } = await supabase
    .from("audits")
    .select("id, user_id, status")
    .eq("id", auditId)
    .maybeSingle();

  if (!audit) {
    return { status: "error", message: "Audit not found." };
  }
  if (audit.user_id !== profile.id && profile.role !== "admin") {
    return { status: "error", message: "You can't refine this audit." };
  }
  if (audit.status !== "ready") {
    return { status: "error", message: "Only ready reports can be refined." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("refinements").insert({
    audit_id: auditId,
    user_id: profile.id,
    section: check.section!,
    instruction: check.instruction!,
    status: "queued",
  });

  if (error) {
    return { status: "error", message: "Couldn't queue that refinement." };
  }

  await admin.from("audit_events").insert({
    audit_id: auditId,
    actor: "client",
    event_type: "refinement_requested",
    phase: "refinement",
    detail: check.section!,
  });

  revalidatePath(`/audits/${auditId}`);
  return {
    status: "queued",
    message: "Refinement queued. We'll update the report shortly.",
  };
}
