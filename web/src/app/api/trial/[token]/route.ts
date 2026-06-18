import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/trial/[token]
 * Validates a trial link token for the landing page.
 * Returns { valid: true, audits_granted: N } or { valid: false, reason: ... }
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!token || token.length < 8) {
    return NextResponse.json(
      { valid: false, reason: "not_found" },
      { status: 404 },
    );
  }

  const admin = createAdminClient();

  try {
    const { data, error } = await (admin as any)
      .from("trial_links")
      .select("id, audits_granted, revoked_at, expires_at, max_uses, used_count")
      .eq("token", token)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { valid: false, reason: "not_found" },
        { status: 404 },
      );
    }

    if (data.revoked_at) {
      return NextResponse.json({ valid: false, reason: "revoked" });
    }

    if (data.expires_at && new Date(data.expires_at) <= new Date()) {
      return NextResponse.json({ valid: false, reason: "expired" });
    }

    if (data.max_uses !== null && data.used_count >= data.max_uses) {
      return NextResponse.json({ valid: false, reason: "exhausted" });
    }

    return NextResponse.json({
      valid: true,
      audits_granted: data.audits_granted,
    });
  } catch (e: any) {
    console.error("[api/trial] validation error:", e.message);
    return NextResponse.json(
      { valid: false, reason: "not_found" },
      { status: 500 },
    );
  }
}
