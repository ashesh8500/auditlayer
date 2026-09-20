"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { bumpResourceRevision } from "@/lib/resources/mutation-revision";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured, siteUrl } from "@/lib/env";
import type { AuditEventPhase } from "@/lib/domain";
import {
  executeFounderTransition,
  type FounderTransitionAction,
  type TransitionRpcCall,
} from "@/lib/admin-audit-transitions";

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

/**
 * Run one founder recovery transition through the canonical compare-and-
 * transition RPC (`founder_transition_audit`). The database validates the
 * founder actor, locks the current audit row, re-validates the transition
 * against the typed matrix, bounds/redacts the note, changes status exactly
 * once, and inserts exactly one matching founder `audit_events` row in the
 * same transaction. Client-observed status is never mutation authority; the
 * RPC compares against the locked row and rejects stale/duplicate submissions
 * with zero writes.
 */
async function runFounderTransition(
  action: FounderTransitionAction,
  formData: FormData,
  successMessage: string,
): Promise<AdminActionState> {
  const actor = await requireAdmin();
  if (!isSupabaseAdminConfigured())
    return { status: "error", message: "Not configured." };

  const auditId = String(formData.get("auditId") ?? "");
  if (!auditId) return { status: "error", message: "Audit id is required." };
  const note = String(formData.get("note") ?? "");

  const admin = createAdminClient();
  const rpc: TransitionRpcCall = async (args) => {
    const { data, error } = await admin.rpc("founder_transition_audit", args);
    return { data, error };
  };

  const result = await executeFounderTransition(rpc, {
    action,
    auditId,
    actorId: actor.id,
    note,
  });

  if (!result.ok) return { status: "error", message: result.message };

  await bumpResourceRevision("reports");
  revalidatePath(`/admin/audits/${auditId}`);
  return { status: "ok", message: successMessage };
}

/** Approve a needs_review/blocked audit -> queue it for the worker. */
export async function approveAudit(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return runFounderTransition("approve", formData, "Audit approved and queued.");
}

/** Re-queue a failed or completed audit for another generation attempt. */
export async function requeueAudit(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return runFounderTransition("requeue", formData, "Audit re-queued.");
}

/** Block an actionable audit (needs_review/queued/running) with a founder note. */
export async function blockAudit(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return runFounderTransition("block", formData, "Audit blocked.");
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

  const hermes_model = "deepseek-v4-flash";
  const submittedModel = String(formData.get("hermes_model") ?? hermes_model).trim();
  const tokenCap = Number(formData.get("token_cap"));
  const costCap = Number(formData.get("cost_cap_usd"));
  const toolsetsRaw = String(formData.get("enabled_toolsets") ?? "");

  if (submittedModel !== hermes_model || toolsetsRaw.trim())
    return { status: "error", message: "Production uses DeepSeek V4 Flash with tool-free inference." };
  if (!Number.isSafeInteger(tokenCap) || tokenCap < 120_000)
    return { status: "error", message: "Token cap must be an integer of at least 120000." };
  if (!Number.isFinite(costCap) || costCap <= 0)
    return { status: "error", message: "Cost cap must be positive." };

  const enabled_toolsets: string[] = [];

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
 * as a unique private object, then commits version + pointer + event together.
 * Ambiguous finalization never deletes the possibly committed object.
 */
export async function uploadManualReport(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const actor = await requireAdmin();
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
  const path = `${auditId}/manual/${randomUUID()}.html`;
  const { error: uploadError } = await admin.storage
    .from("reports")
    .upload(path, file, { contentType: "text/html", upsert: false });
  if (uploadError)
    return { status: "error", message: uploadError.message };

  const { error } = await (admin as any).rpc("admin_finalize_manual_report", {
    p_actor_id: actor.id, p_audit_id: auditId, p_report_path: path,
  });
  if (error) return { status: "error", message: `Finalization not confirmed: ${error.message}. Check report history before retrying.` };

  await bumpResourceRevision("reports");
  revalidatePath(`/admin/audits/${auditId}`);
  revalidatePath(`/audits/${auditId}`);
  return { status: "ok", message: "Report uploaded and marked ready." };
}

/** Atomically assign founder-managed access, including manual enterprise users. */
export async function setUserAccess(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const actor = await requireAdmin();
  if (!isSupabaseAdminConfigured())
    return { status: "error", message: "Not configured." };

  const profileId = String(formData.get("profileId") ?? "");
  const plan = String(formData.get("plan") ?? "");
  const accountType = String(formData.get("account_type") ?? "");
  const giftedDelta = Number(formData.get("gifted_delta") ?? 0);
  const reason = String(formData.get("reason") ?? "").trim();
  if (!profileId || !reason || !Number.isSafeInteger(giftedDelta)) {
    return { status: "error", message: "User, integer credit adjustment, and a reason are required." };
  }

  const { error } = await (createAdminClient() as any).rpc("admin_assign_access_delta", {
    p_actor_id: actor.id,
    p_target_user_id: profileId,
    p_plan: plan,
    p_account_type: accountType,
    p_gifted_delta: giftedDelta,
    p_reason: reason,
  });
  if (error) return { status: "error", message: error.message };

  await bumpResourceRevision("reports");
  revalidatePath(`/admin/users/${profileId}`);
  revalidatePath("/admin/users");
  return { status: "ok", message: "Access assignment saved and logged." };
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
  const offerPlan = String(formData.get("offer_plan") ?? "starter");
  const reportTypes = formData.getAll("report_types").map(String);
  const accessDays = parseInt(String(formData.get("access_days") ?? "14"), 10);

  if (auditsGranted < 1 || auditsGranted > 50)
    return { status: "error", message: "Audits granted must be between 1 and 50." };
  if (!["free", "starter", "pro", "enterprise"].includes(offerPlan))
    return { status: "error", message: "Select a valid trial plan." };
  if (!reportTypes.length)
    return { status: "error", message: "Select at least one report type." };
  if (!Number.isInteger(accessDays) || accessDays < 1 || accessDays > 365)
    return { status: "error", message: "Access days must be between 1 and 365." };

  const token = randomBytes(24).toString("hex");

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
      offer_plan: offerPlan,
      report_types: reportTypes,
      access_days: accessDays,
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
        audits_granted: auditsGranted,
        label,
        max_uses: maxUses,
        expires_in_days: expiresInDays,
        offer_plan: offerPlan,
        report_types: reportTypes,
        access_days: accessDays,
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
    url: `${siteUrl()}/try/${token}`,
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
