import { NextResponse } from "next/server";

import { getAuditForShare, incrementShareView } from "@/lib/share-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";

/**
 * GET /api/share/[token]/report
 *
 * Serves the raw report HTML for a share link. Checks:
 *   1. Link is valid (not revoked, not expired)
 *   2. Audit is ready
 *   3. Email mode: session must be verified
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const access = await getAuditForShare(token);

  if ("error" in access) {
    const status =
      access.error === "not_found"
        ? 404
        : access.error === "revoked" || access.error === "expired"
          ? 410
          : 403;
    return NextResponse.json({ error: access.error }, { status });
  }

  // Email mode but not verified
  if ("needsVerification" in access && access.needsVerification) {
    return NextResponse.json(
      { error: "Email verification required" },
      { status: 403 }
    );
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Storage not configured" },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("reports")
    .download(access.audit.report_path!);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Download failed" },
      { status: 500 }
    );
  }

  const html = await data.text();

  // Increment view count (fire-and-forget)
  incrementShareView(token).catch(() => {});

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-cache",
    },
  });
}
