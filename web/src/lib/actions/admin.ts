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

/** Update a user's plan (admin-only). */
export async function updateUserPlan(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const adminProfile = await requireAdmin();
  if (!isSupabaseAdminConfigured())
    return { status: "error", message: "Not configured." };

  const profileId = String(formData.get("profileId") ?? "");
  const plan = String(formData.get("plan") ?? "").trim() as any;
  const reason = String(formData.get("reason") ?? "").trim();

  if (!profileId || !plan || !reason)
    return { status: "error", message: "Profile, plan, and reason are required." };

  const validPlans = ["free", "starter", "pro", "enterprise"];
  if (!validPlans.includes(plan))
    return { status: "error", message: `Invalid plan: ${plan}.` };

  const admin = createAdminClient();

  // Fetch current plan
  const { data: profileRow, error: fetchError } = await admin
    .from("profiles")
    .select("plan")
    .eq("id", profileId)
    .maybeSingle();

  if (fetchError || !profileRow)
    return { status: "error", message: fetchError?.message || "Profile not found." };

  const fromPlan = profileRow.plan;

  // Update plan
  const { error: updateError } = await admin
    .from("profiles")
    .update({ plan })
    .eq("id", profileId);

  if (updateError)
    return { status: "error", message: updateError.message };

  // Log admin action
  try {
    await (admin as any).from("admin_actions").insert({
      actor_id: adminProfile.id,
      target_user_id: profileId,
      action: "plan_change",
      detail: { from: fromPlan, to: plan, reason },
    });
  } catch (e: any) {
    console.error("admin_actions insert failed (plan_change):", e.message);
  }

  revalidatePath(`/admin/users/${profileId}`);
  return { status: "ok", message: `Plan changed from ${fromPlan} to ${plan}.` };
}

/** Adjust a user's gifted audit count (admin-only). */
export async function adjustGiftedAudits(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const adminProfile = await requireAdmin();
  if (!isSupabaseAdminConfigured())
    return { status: "error", message: "Not configured." };

  const profileId = String(formData.get("profileId") ?? "");
  const amountRaw = String(formData.get("amount") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const amount = parseInt(amountRaw, 10);

  if (!profileId || !reason || isNaN(amount) || amount === 0)
    return { status: "error", message: "Profile, non-zero amount, and reason are required." };

  const admin = createAdminClient();

  // Fetch current gifted_audits
  const { data: profileRow, error: fetchError } = await admin
    .from("profiles")
    .select("gifted_audits")
    .eq("id", profileId)
    .maybeSingle();

  if (fetchError || !profileRow)
    return { status: "error", message: fetchError?.message || "Profile not found." };

  const currentGifted = (profileRow as any).gifted_audits ?? 0;
  const newGifted = Math.max(0, currentGifted + amount);

  // Update gifted_audits
  const { error: updateError } = await admin
    .from("profiles")
    .update({ gifted_audits: newGifted })
    .eq("id", profileId);

  if (updateError)
    return { status: "error", message: updateError.message };

  // Log admin action
  try {
    await (admin as any).from("admin_actions").insert({
      actor_id: adminProfile.id,
      target_user_id: profileId,
      action: "gifted_adjust",
      detail: { from: currentGifted, to: newGifted, adjustment: amount, reason },
    });
  } catch (e: any) {
    console.error("admin_actions insert failed (gifted_adjust):", e.message);
  }

  revalidatePath(`/admin/users/${profileId}`);
  return { status: "ok", message: `Gifted audits adjusted from ${currentGifted} to ${newGifted}.` };
}

/** Set a user's account type (admin-only). */
export async function setAccountType(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const adminProfile = await requireAdmin();
  if (!isSupabaseAdminConfigured())
    return { status: "error", message: "Not configured." };

  const profileId = String(formData.get("profileId") ?? "");
  const accountType = String(formData.get("account_type") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!profileId || !reason)
    return { status: "error", message: "Profile, account type, and reason are required." };

  const validTypes = ["standard", "trial", "comp"];
  if (!validTypes.includes(accountType))
    return { status: "error", message: `Invalid account type: ${accountType}.` };

  const admin = createAdminClient();

  // Fetch current account_type
  const { data: profileRow, error: fetchError } = await admin
    .from("profiles")
    .select("account_type")
    .eq("id", profileId)
    .maybeSingle();

  if (fetchError || !profileRow)
    return { status: "error", message: fetchError?.message || "Profile not found." };

  const fromType = (profileRow as any).account_type ?? "standard";

  // Update account_type
  const { error: updateError } = await admin
    .from("profiles")
    .update({ account_type: accountType })
    .eq("id", profileId);

  if (updateError)
    return { status: "error", message: updateError.message };

  // Log admin action
  try {
    await (admin as any).from("admin_actions").insert({
      actor_id: adminProfile.id,
      target_user_id: profileId,
      action: "account_type_change",
      detail: { from: fromType, to: accountType, reason },
    });
  } catch (e: any) {
    console.error("admin_actions insert failed (account_type_change):", e.message);
  }

  revalidatePath(`/admin/users/${profileId}`);
  return { status: "ok", message: `Account type changed from ${fromType} to ${accountType}.` };
}

/** Create a trial link (admin-only). */
export async function createTrialLink(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState & { token?: string; url?: string }> {
  const adminProfile = await requireAdmin();
  if (!isSupabaseAdminConfigured())
    return { status: "error", message: "Not configured." };

  const auditsGrantedRaw = String(formData.get("audits_granted") ?? "3");
  const auditsGranted = parseInt(auditsGrantedRaw, 10) || 3;
  const label = String(formData.get("label") ?? "").trim() || null;
  const maxUsesRaw = formData.get("max_uses");
  const maxUses = maxUsesRaw ? parseInt(String(maxUsesRaw), 10) || null : null;
  const expiresInDaysRaw = formData.get("expires_in_days");
  const expiresInDays = expiresInDaysRaw ? parseInt(String(expiresInDaysRaw), 10) || null : null;

  if (auditsGranted < 1 || auditsGranted > 50)
    return { status: "error", message: "Audits granted must be between 1 and 50." };

  // Generate random 24-char hex token
  const token = Array.from(
    { length: 24 },
    () => Math.floor(Math.random() * 16).toString(16),
  ).join("");

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const admin = createAdminClient();

  try {
    const { error: insertError } = await (admin as any).from("trial_links").insert({
      token,
      audits_granted: auditsGranted,
      created_by: adminProfile.id,
      label,
      max_uses: maxUses,
      expires_at: expiresAt,
    });

    if (insertError)
      return { status: "error", message: insertError.message };
  } catch (e: any) {
    return { status: "error", message: e.message };
  }

  // Log admin action
  try {
    await (admin as any).from("admin_actions").insert({
      actor_id: adminProfile.id,
      action: "trial_create",
      detail: {
        token,
        audits_granted: auditsGranted,
        label,
        max_uses: maxUses,
        expires_in_days: expiresInDays,
      },
    });
  } catch (e: any) {
    console.error("admin_actions insert failed (trial_create):", e.message);
  }

  revalidatePath("/admin/trials");
  return {
    status: "ok",
    message: "Trial link created.",
    token,
    url: `/try/${token}`,
  };
}

/** Revoke a trial link (admin-only). */
export async function revokeTrialLink(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const adminProfile = await requireAdmin();
  if (!isSupabaseAdminConfigured())
    return { status: "error", message: "Not configured." };

  const trialLinkId = String(formData.get("trialLinkId") ?? "");

  if (!trialLinkId)
    return { status: "error", message: "Trial link ID is required." };

  const admin = createAdminClient();

  try {
    const { error: updateError } = await (admin as any)
      .from("trial_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", trialLinkId);

    if (updateError)
      return { status: "error", message: updateError.message };
  } catch (e: any) {
    return { status: "error", message: e.message };
  }

  // Log admin action
  try {
    await (admin as any).from("admin_actions").insert({
      actor_id: adminProfile.id,
      action: "trial_revoke",
      detail: { trial_link_id: trialLinkId },
    });
  } catch (e: any) {
    console.error("admin_actions insert failed (trial_revoke):", e.message);
  }

  revalidatePath("/admin/trials");
  return { status: "ok", message: "Trial link revoked." };
}
