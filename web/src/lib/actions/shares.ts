"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, isSupabaseAdminConfigured } from "@/lib/env";
import { isShareEmailConfigured } from "@/lib/share-security";
import { SHARE_LINK_PUBLIC_COLUMNS, projectShareLink, type ShareLinkPublic } from "@/lib/share-link-public";
import { bumpResourceRevision } from "@/lib/resources/mutation-revision";

export type ShareLinkRow = ShareLinkPublic;
export interface ShareActionState {
  status: "idle" | "ok" | "error";
  message?: string;
  link?: ShareLinkPublic;
}
export async function createShareLink(_prev: ShareActionState, formData: FormData): Promise<ShareActionState> {
  const profile = await requireProfile();
  if (!isSupabaseConfigured()) return { status: "error", message: "Not configured." };
  const auditId = String(formData.get("auditId") ?? "");
  const mode = String(formData.get("mode") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!auditId || !["public", "email"].includes(mode)) return { status: "error", message: "Invalid share request." };
  if (mode === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { status: "error", message: "Enter a valid recipient email." };
    if (!isShareEmailConfigured() || !isSupabaseAdminConfigured()) return { status: "error", message: "Email-gated link creation is temporarily unavailable. Existing restricted links remain restricted." };
  }
  const supabase = await createClient();
  const { data: audit, error: auditError } = await supabase.from("audits").select("id,status,user_id,report_path").eq("id", auditId).maybeSingle();
  if (auditError || !audit || (audit.user_id !== profile.id && profile.role !== "admin")) return { status: "error", message: "Report not available." };
  if (audit.status !== "ready" || !audit.report_path) return { status: "error", message: "Report is not ready yet." };
  // RLS repeats target ownership/readiness checks at insert time, including direct REST writes.
  const { data: link, error } = await supabase.from("share_links").insert({
    audit_id: auditId, token: randomBytes(32).toString("base64url"), mode,
    email: mode === "email" ? email : null, created_by: profile.id,
  }).select(SHARE_LINK_PUBLIC_COLUMNS).single();
  if (error || !link) return { status: "error", message: "Failed to create link. Please retry." };
  await bumpResourceRevision("reports");
  revalidatePath(`/audits/${auditId}`);
  return { status: "ok", message: "Share link created.", link: projectShareLink(link as ShareLinkPublic) };
}

export async function revokeShareLink(_prev: ShareActionState, formData: FormData): Promise<ShareActionState> {
  await requireProfile();
  if (!isSupabaseConfigured()) return { status: "error", message: "Not configured." };
  const linkId = String(formData.get("linkId") ?? "");
  const auditId = String(formData.get("auditId") ?? "");
  if (!linkId || !auditId) return { status: "error", message: "Invalid share request." };
  const supabase = await createClient();
  // Owner-linked RLS, not caller-supplied creator identity, is authoritative.
  const { data: updated, error } = await supabase.from("share_links")
    .update({ revoked_at: new Date().toISOString() }).eq("id", linkId).eq("audit_id", auditId)
    .select("id,audit_id,revoked_at").maybeSingle();
  if (error || !updated?.revoked_at) return { status: "error", message: "Link could not be revoked. Refresh and retry." };
  const { data: confirmed, error: readError } = await supabase.from("share_links")
    .select("id,revoked_at").eq("id", updated.id).maybeSingle();
  if (readError || !confirmed?.revoked_at) return { status: "error", message: "Unable to confirm revocation. Refresh and retry." };
  await bumpResourceRevision("reports");
  revalidatePath(`/audits/${updated.audit_id}`);
  return { status: "ok", message: "Link revoked." };
}
