import { NextResponse } from "next/server";

import { getAuditForShare, incrementShareView } from "@/lib/share-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";
import { redactStorageError, shareAccessGate } from "@/lib/access-boundary";

/**
 * GET /api/share/[token]/report
 *
 * Serves the raw report HTML for a share link. Checks:
 *   1. Link is valid (not revoked, not expired)
 *   2. Audit is ready
 *   3. Email mode: session must be verified
 *
 * The canonical share decision (`getAuditForShare`) runs BEFORE any
 * service-role download.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const access = await getAuditForShare(token);

  const gate = shareAccessGate(access);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
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
    .download((access as { audit: { report_path: string } }).audit.report_path);

  if (error || !data) {
    // Storage errors can echo object paths; never let a private path or
    // credential reach client output.
    return NextResponse.json(
      { error: redactStorageError(error?.message) },
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
