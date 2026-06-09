import "server-only";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";

type AuditRow = {
  id: string;
  user_id: string;
  handle: string;
  platform: string;
  goal: string;
  context: string;
  status: string;
  limitations: unknown;
  admin_notes: string;
  milestone_label: string | null;
  model: string | null;
  report_path: string | null;
  report_url: string | null;
  pdf_url: string | null;
  cost_usd: number;
  tokens_in: number;
  tokens_out: number;
  created_at: string;
  updated_at: string;
};

export type ShareLinkRow = {
  id: string;
  audit_id: string;
  token: string;
  mode: "public" | "email";
  email: string | null;
  verified_at: string | null;
  verification_code: string | null;
  verification_code_expires: string | null;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  view_count: number;
};

export type ShareAccessResult =
  | { audit: AuditRow; link: ShareLinkRow; mode: "public" }
  | { audit: AuditRow; link: ShareLinkRow; mode: "email"; needsVerification: true }
  | { audit: AuditRow; link: ShareLinkRow; mode: "email"; verified: true }
  | { error: "invalid" | "expired" | "revoked" | "not_ready" | "not_found" };

function shareSessionCookieName(token: string): string {
  return `alm_share_${token}`;
}

/** Check if a share link has a verified session cookie. */
export async function getShareSession(token: string): Promise<boolean> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(shareSessionCookieName(token));
  return cookie?.value === "verified";
}

/** Set the verified session cookie for a share link. */
export async function setShareSession(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(shareSessionCookieName(token), "verified", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: `/s/${token}`,
  });
}

/**
 * Validate a share link and return the audit and link info.
 * For email-gated links, checks whether the session is verified.
 */
export async function getAuditForShare(
  token: string
): Promise<ShareAccessResult> {
  if (!isSupabaseAdminConfigured()) return { error: "not_found" };
  const admin = createAdminClient();

  const { data: link } = await (admin as any)
    .from("share_links")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!link) return { error: "not_found" };

  if (link.revoked_at) return { error: "revoked" };
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return { error: "expired" };
  }

  // Fetch audit using service-role client (bypasses RLS — share visitors
  // are not authenticated and can't pass the audits RLS ownership check).
  const { data: audit } = await admin
    .from("audits")
    .select("*")
    .eq("id", link.audit_id)
    .maybeSingle();

  if (!audit) return { error: "not_found" };
  if (audit.status !== "ready" || !audit.report_path) {
    return { error: "not_ready" };
  }

  if (link.mode === "public") {
    return { audit, link: link as ShareLinkRow, mode: "public" };
  }

  // Email mode — check verification
  const verified = await getShareSession(token);
  if (verified || link.verified_at) {
    return { audit, link: link as ShareLinkRow, mode: "email", verified: true };
  }

  return {
    audit,
    link: link as ShareLinkRow,
    mode: "email",
    needsVerification: true,
  };
}

/** Increment view count for a share link. Called when the report is served. */
export async function incrementShareView(token: string): Promise<void> {
  try {
    const supabase = await createClient();
    await (supabase as any).rpc("increment_share_view", { p_token: token });
  } catch {
    // Function may not exist yet if migration hasn't been run
  }
}
