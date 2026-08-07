import "server-only";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";
import {
  decideShareAccess,
  shareCookiePath,
  shareSessionCookieName,
} from "@/lib/access-boundary";

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
  | { error: "invalid" | "expired" | "revoked" | "not_ready" | "not_found" | "needs_verification" };

/**
 * Check if a share link has a verified session cookie.
 * The cookie is token-scoped by name and reachable from BOTH `/s/{token}` and
 * `/api/share/{token}/report` (see `shareCookiePath`).
 */
export async function getShareSession(token: string): Promise<boolean> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(shareSessionCookieName(token));
  return cookie?.value === "verified";
}

/**
 * Set the verified session cookie for a share link.
 * The path is the canonical `shareCookiePath` (covers the landing page AND the
 * report route); the token-scoped name isolates one share from another.
 */
export async function setShareSession(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(shareSessionCookieName(token), "verified", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: shareCookiePath(token),
  });
}

/**
 * Validate a share link and return the audit and link info.
 * For email-gated links, checks whether the session is verified.
 *
 * Every state transition (revoked, expired, not-ready, email verification) goes
 * through the canonical `decideShareAccess` state machine. The service-role
 * client performs only the token/audit row lookups that share visitors cannot
 * do through private RLS; the canonical decision determines every returned
 * result, and artifact downloads are additionally gated by `shareAccessGate`
 * in the report route.
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

  const linkRow = link as ShareLinkRow | null;
  if (!linkRow) return { error: "not_found" };

  // The share-link row is a token lookup (share visitors cannot pass the
  // private audits RLS). The canonical state machine below consumes ALL facts
  // (token state + audit readiness + email verification) in one pure decision
  // before any artifact download can happen.
  const { data: audit } = await admin
    .from("audits")
    .select("*")
    .eq("id", linkRow.audit_id)
    .maybeSingle();

  const auditReady = Boolean(
    audit && audit.status === "ready" && audit.report_path,
  );

  const decision = decideShareAccess(
    {
      exists: true,
      mode: linkRow.mode,
      revokedAt: linkRow.revoked_at ?? null,
      expiresAt: linkRow.expires_at ?? null,
      verifiedAt: linkRow.verified_at ?? null,
      hasVerifiedSession: await getShareSession(token),
      auditReady,
    },
    new Date(),
  );

  if (!decision.allow) {
    // Email-gated link with a valid, ready audit but no verified session is the
    // "please verify" state, not an error page state: the share page renders the
    // verification form from `needsVerification`.
    if (decision.reason === "needs_verification" && audit) {
      return {
        audit: audit as any,
        link: linkRow as ShareLinkRow,
        mode: "email",
        needsVerification: true,
      };
    }
    return { error: decision.reason };
  }
  if (!audit || !auditReady) {
    return { error: "not_ready" };
  }

  if (decision.mode === "public") {
    return { audit: audit as any, link: linkRow as ShareLinkRow, mode: "public" };
  }

  // Email mode reached the allow state only via verified_at or the verified
  // session cookie — return the verified variant.
  return {
    audit: audit as any,
    link: linkRow as ShareLinkRow,
    mode: "email",
    verified: true,
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
