"use server";

import { revalidatePath } from "next/cache";
import { bumpResourceRevision } from "@/lib/resources/mutation-revision";

import { workspaceIntentBlocker } from "@/lib/workspace/intake";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";
import { editableReportSections, validateRefinement } from "@/lib/refinement";

export interface RefinementState {
  status: "idle" | "queued" | "error";
  message?: string;
  refinementId?: string;
}

/**
 * Section-scoped refinement enqueue. Verifies ownership + report readiness,
 * validates against headings from the authorized immutable artifact, then
 * enqueues transactionally with a version fence via service role. The browser
 * has SELECT only. The Python worker processes the queue.
 */
export async function requestRefinement(
  _prev: RefinementState,
  formData: FormData,
): Promise<RefinementState> {
  const profile = await requireProfile();
  if (formData.has("workspaceIntent")) {
    let intent: unknown;
    try { intent=JSON.parse(String(formData.get("workspaceIntent"))); }
    catch { return { status: "error", message: "Invalid workspace quote or consent." }; }
    return { status: "error", message: workspaceIntentBlocker(intent, profile.id) };
  }

  if (!isSupabaseAdminConfigured()) {
    return { status: "error", message: "Refinements aren't configured yet." };
  }

  const auditId = String(formData.get("auditId") ?? "");
  const section = String(formData.get("section") ?? "");
  const instruction = String(formData.get("instruction") ?? "");

  // Ownership + readiness via the user's RLS-scoped client.
  const supabase = await createClient();
  const { data: audit } = await supabase
    .from("audits")
    .select("id, user_id, status, report_path, report_version")
    .eq("id", auditId)
    .maybeSingle();

  if (!audit) {
    return { status: "error", message: "Audit not found." };
  }
  if (audit.user_id !== profile.id) {
    return { status: "error", message: "You can't refine this audit." };
  }
  if (audit.status !== "ready" || !audit.report_path) {
    return { status: "error", message: "Only ready reports can be refined." };
  }

  const admin = createAdminClient();
  const { data: file, error: downloadError } = await admin.storage.from("reports").download(audit.report_path);
  if (downloadError || !file) return { status: "error", message: "The report file is unavailable." };
  const check = validateRefinement(section, instruction, editableReportSections(await file.text()));
  if (!check.ok) return { status: "error", message: check.error };
  // Recheck identity/version under the audit lock after reading the artifact.
  const { data: refinementId, error } = await (admin as unknown as {
    rpc(name: "enqueue_report_refinement", args: { p_audit_id: string; p_user_id: string; p_report_version: number; p_section: string; p_instruction: string }): Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc("enqueue_report_refinement", {
    p_audit_id: auditId, p_user_id: profile.id,
    p_report_version: audit.report_version, p_section: check.section!,
    p_instruction: check.instruction!,
  }) as { data: string | null; error: { message: string } | null };

  if (error || typeof refinementId !== "string") {
    return { status: "error", message: "Couldn't queue that refinement." };
  }

  const { data: queued, error: readError } = await admin.from("refinements")
    .select("id").eq("id", refinementId).eq("audit_id", auditId).maybeSingle();
  if (readError || !queued) return { status: "error", message: "Couldn't confirm the refinement. Refresh before retrying." };

  await bumpResourceRevision("reports");
  revalidatePath(`/audits/${auditId}`);
  return {
    status: "queued",
    refinementId: String(refinementId),
    message: "Refinement queued. We'll update the report shortly.",
  };
}
