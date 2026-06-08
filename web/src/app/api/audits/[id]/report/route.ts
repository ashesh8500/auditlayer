import { NextResponse } from "next/server";

import { getAuditForViewer } from "@/lib/audit-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";

/** Same-origin HTML report for iframe viewing and download. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const access = await getAuditForViewer(id);
  if ("error" in access) {
    const status =
      access.error === "unauthorized"
        ? 401
        : access.error === "forbidden"
          ? 403
          : 404;
    return NextResponse.json({ error: access.error }, { status });
  }

  const { audit } = access;
  if (audit.status !== "ready" || !audit.report_path) {
    return NextResponse.json({ error: "Report not ready" }, { status: 404 });
  }
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("reports")
    .download(audit.report_path);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Download failed" },
      { status: 500 },
    );
  }

  const html = await data.text();
  const download = new URL(request.url).searchParams.get("download") === "1";
  const filename = `${audit.handle.replace(/[^a-z0-9_-]+/gi, "-")}-audit.html`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": download
        ? `attachment; filename="${filename}"`
        : "inline",
      "X-Frame-Options": "SAMEORIGIN",
      "Cache-Control": "private, no-cache",
    },
  });
}
