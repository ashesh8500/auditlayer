"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";

import { requireProfile, type Profile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export interface CreateShareLinkInput {
  auditId: string;
  mode: "public" | "email";
  email?: string;
}

export interface ShareLinkRow {
  id: string;
  audit_id: string;
  token: string;
  mode: "public" | "email";
  email: string | null;
  verified_at: string | null;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  view_count: number;
}

export interface ShareActionState {
  status: "idle" | "ok" | "error";
  message?: string;
  link?: ShareLinkRow;
}

function generateToken(): string {
  return randomBytes(6)
    .toString("base64url")
    .slice(0, 8);
}

/** Create a new share link for an audit. */
export async function createShareLink(
  _prev: ShareActionState,
  formData: FormData
): Promise<ShareActionState> {
  const profile = await requireProfile();
  if (!isSupabaseConfigured())
    return { status: "error", message: "Not configured." };

  const auditId = String(formData.get("auditId") ?? "");
  const mode = String(formData.get("mode") ?? "public") as "public" | "email";
  const email = String(formData.get("email") ?? "").trim() || null;

  if (!auditId) return { status: "error", message: "Audit ID is required." };
  if (mode === "email" && !email)
    return { status: "error", message: "Email is required for email-gated links." };

  const supabase = await createClient();

  // Verify ownership
  const { data: audit } = await supabase
    .from("audits")
    .select("id, status, user_id")
    .eq("id", auditId)
    .maybeSingle();

  if (!audit) return { status: "error", message: "Audit not found." };
  if (audit.user_id !== profile.id && profile.role !== "admin")
    return { status: "error", message: "Not authorized." };
  if (audit.status !== "ready")
    return { status: "error", message: "Report is not ready yet." };

  const token = generateToken();
  const { data: link, error } = await (supabase as any)
    .from("share_links")
    .insert({
      audit_id: auditId,
      token,
      mode,
      email,
      created_by: profile.id,
    })
    .select()
    .single();

  if (error || !link) {
    return { status: "error", message: error?.message ?? "Failed to create link." };
  }

  revalidatePath(`/audits/${auditId}`);
  return {
    status: "ok",
    message: "Share link created.",
    link: link as ShareLinkRow,
  };
}

/** Revoke a share link. */
export async function revokeShareLink(
  _prev: ShareActionState,
  formData: FormData
): Promise<ShareActionState> {
  const profile = await requireProfile();
  if (!isSupabaseConfigured())
    return { status: "error", message: "Not configured." };

  const linkId = String(formData.get("linkId") ?? "");
  const auditId = String(formData.get("auditId") ?? "");

  if (!linkId) return { status: "error", message: "Link ID is required." };

  const supabase = await createClient();

  const { data: link } = await (supabase as any)
    .from("share_links")
    .select("created_by")
    .eq("id", linkId)
    .maybeSingle();

  if (!link) return { status: "error", message: "Link not found." };
  if (link.created_by !== profile.id && profile.role !== "admin")
    return { status: "error", message: "Not authorized." };

  const { error } = await (supabase as any)
    .from("share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId);

  if (error)
    return { status: "error", message: error.message };

  revalidatePath(`/audits/${auditId}`);
  return { status: "ok", message: "Link revoked." };
}
