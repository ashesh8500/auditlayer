import { NextResponse } from "next/server";

import { getAuditForViewer } from "@/lib/audit-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";
import { auditAccessGate, redactStorageError } from "@/lib/access-boundary";

/**
 * GET /api/audits/[id]/read
 *
 * Serves raw report HTML for the immersive reading view.
 * Same auth as the existing report API but without X-Frame-Options.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  // Canonical access decision BEFORE any service-role client or download.
  const access = await getAuditForViewer(id);
  const gate = auditAccessGate(access);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { audit } = access as { audit: { status: string; report_path: string | null } };
  if (audit.status !== "ready" || !audit.report_path) {
    return NextResponse.json({ error: "Report not ready" }, { status: 404 });
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
    .download(audit.report_path);

  if (error || !data) {
    // Storage errors can echo object paths; never let a private path or
    // credential reach client output.
    return NextResponse.json(
      { error: redactStorageError(error?.message) },
      { status: 500 }
    );
  }

  const html = await data.text();

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-cache",
    },
  });
}
