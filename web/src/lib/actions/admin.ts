"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";
import type { AuditEventPhase, Json } from "@/lib/supabase/types";

export interface AdminActionState {
  status: "idle" | "ok" | "error";
  message?: string;
}

const ONBOARDING_STATUSES = new Set([
  "lead",
  "login_requested",
  "audit_requested",
  "active",
  "needs_founder_review",
  "paid",
  "report_ready",
  "refinement_requested",
  "blocked",
  "churn_risk",
]);

async function logEvent(
  auditId: string,
  eventType: string,
  phase: AuditEventPhase | null,
  detail: string,
): Promise<void> {
  await createAdminClient()
    .from("audit_events")
    .insert({ audit_id: auditId, actor: "admin", event_type: eventType, phase, detail });
}

/** Approve a needs_review/blocked audit -> queue it for the worker. */
export async function approveAudit(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();
  if (!isSupabaseAdminConfigured())
    return { status: "error", message: "Not configured." };

  const auditId = String(formData.get("auditId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const admin = createAdminClient();

  const { error } = await admin
    .from("audits")
    .update({ status: "queued" })
    .eq("id", auditId);
  if (error) return { status: "error", message: error.message };

  await logEvent(auditId, "audit_approved", "approved", note || "Approved by founder");
  revalidatePath(`/admin/audits/${auditId}`);
  return { status: "ok", message: "Audit approved and queued." };
}

/** Re-queue a failed audit for another generation attempt. */
export async function requeueAudit(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();
  if (!isSupabaseAdminConfigured())
    return { status: "error", message: "Not configured." };

  const auditId = String(formData.get("auditId") ?? "");
  const admin = createAdminClient();
  const { error } = await admin
    .from("audits")
    .update({ status: "queued" })
    .eq("id", auditId);
  if (error) return { status: "error", message: error.message };

  await logEvent(auditId, "audit_requeued", "queued", "Re-queued by founder");
  revalidatePath(`/admin/audits/${auditId}`);
  return { status: "ok", message: "Audit re-queued." };
}

export async function blockAudit(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();
  if (!isSupabaseAdminConfigured())
    return { status: "error", message: "Not configured." };

  const auditId = String(formData.get("auditId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (note.length < 4)
    return { status: "error", message: "Blocking requires a clear note." };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("audits")
    .select("admin_notes")
    .eq("id", auditId)
    .maybeSingle();
  const admin_notes = [existing?.admin_notes, `Blocked: ${note}`]
    .filter(Boolean)
    .join("\n");

  const { error } = await admin
    .from("audits")
    .update({ status: "blocked", admin_notes })
    .eq("id", auditId);
  if (error) return { status: "error", message: error.message };

  await logEvent(auditId, "audit_blocked", "failed", note);
  revalidatePath(`/admin/audits/${auditId}`);
  return { status: "ok", message: "Audit blocked." };
}

export async function addAuditNote(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();
  if (!isSupabaseAdminConfigured())
    return { status: "error", message: "Not configured." };

  const auditId = String(formData.get("auditId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (note.length < 3)
    return { status: "error", message: "Note is too short." };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("audits")
    .select("admin_notes")
    .eq("id", auditId)
    .maybeSingle();
  const admin_notes = [existing?.admin_notes, note].filter(Boolean).join("\n");

  const { error } = await admin
    .from("audits")
    .update({ admin_notes })
    .eq("id", auditId);
  if (error) return { status: "error", message: error.message };

  await logEvent(auditId, "audit_note_added", null, note);
  revalidatePath(`/admin/audits/${auditId}`);
  return { status: "ok", message: "Note added." };
}

export async function updateOnboarding(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();
  if (!isSupabaseAdminConfigured())
    return { status: "error", message: "Not configured." };

  const profileId = String(formData.get("profileId") ?? "");
  const onboarding = String(formData.get("onboarding_status") ?? "").trim();
  if (!ONBOARDING_STATUSES.has(onboarding))
    return { status: "error", message: "Unsupported onboarding status." };

  const { error } = await createAdminClient()
    .from("profiles")
    .update({ onboarding_status: onboarding })
    .eq("id", profileId);
  if (error) return { status: "error", message: error.message };

  revalidatePath("/admin");
  return { status: "ok", message: "Onboarding status updated." };
}

export async function updateSettings(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();
  if (!isSupabaseAdminConfigured())
    return { status: "error", message: "Not configured." };

  const hermes_model = String(formData.get("hermes_model") ?? "").trim();
  const tokenCap = Number(formData.get("token_cap"));
  const costCap = Number(formData.get("cost_cap_usd"));
  const toolsetsRaw = String(formData.get("enabled_toolsets") ?? "");

  if (!hermes_model)
    return { status: "error", message: "Model is required." };
  if (!Number.isFinite(tokenCap) || tokenCap <= 0)
    return { status: "error", message: "Token cap must be a positive number." };
  if (!Number.isFinite(costCap) || costCap < 0)
    return { status: "error", message: "Cost cap must be zero or positive." };

  const enabled_toolsets = toolsetsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean) as unknown as Json;

  const { error } = await createAdminClient()
    .from("app_settings")
    .update({
      hermes_model,
      enabled_toolsets,
      token_cap: Math.round(tokenCap),
      cost_cap_usd: costCap,
    })
    .eq("id", 1);
  if (error) return { status: "error", message: error.message };

  revalidatePath("/admin/settings");
  return { status: "ok", message: "Settings saved." };
}

/**
 * Manual report upload — preserves Narin's hand-built workflow. Stores the HTML
 * in the private `reports` bucket at `<auditId>/report.html`, attaches it to the
 * audit, and marks it ready. Admin-only, via the service-role client.
 */
export async function uploadManualReport(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();
  if (!isSupabaseAdminConfigured())
    return { status: "error", message: "Not configured." };

  const auditId = String(formData.get("auditId") ?? "");
  const file = formData.get("file");
  if (!auditId)
    return { status: "error", message: "Audit id is required." };
  if (!(file instanceof File) || file.size === 0)
    return { status: "error", message: "Attach an HTML report file." };
  if (file.size > 10 * 1024 * 1024)
    return { status: "error", message: "Report exceeds the 10 MB limit." };

  const admin = createAdminClient();
  const path = `${auditId}/report.html`;
  const { error: uploadError } = await admin.storage
    .from("reports")
    .upload(path, file, { contentType: "text/html", upsert: true });
  if (uploadError)
    return { status: "error", message: uploadError.message };

  const { error } = await admin
    .from("audits")
    .update({ status: "ready", report_path: path })
    .eq("id", auditId);
  if (error) return { status: "error", message: error.message };

  await logEvent(auditId, "report_uploaded", "uploaded", path);
  await logEvent(auditId, "report_ready", "succeeded", "Manual report attached.");
  revalidatePath(`/admin/audits/${auditId}`);
  revalidatePath(`/audits/${auditId}`);
  return { status: "ok", message: "Report uploaded and marked ready." };
}
