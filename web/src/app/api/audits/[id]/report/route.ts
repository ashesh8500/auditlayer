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
  const versionParameter = new URL(request.url).searchParams.get("version");
  const requestedVersion = versionParameter === null ? null : Number(versionParameter);
  if (
    requestedVersion !== null &&
    (!Number.isInteger(requestedVersion) || requestedVersion <= 0)
  ) {
    return NextResponse.json({ error: "Invalid report version" }, { status: 400 });
  }
  if (audit.status !== "ready" || !audit.report_path) {
    return NextResponse.json({ error: "Report not ready" }, { status: 404 });
  }
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
  }

  const admin = createAdminClient();
  let reportPath = audit.report_path;
  if (requestedVersion !== null) {
    const { data: versionRow, error: versionError } = await (admin as any)
      .from("audit_report_versions")
      .select("report_path")
      .eq("audit_id", id)
      .eq("version", requestedVersion)
      .maybeSingle();
    if (versionError || !versionRow?.report_path) {
      return NextResponse.json({ error: "Report version not found" }, { status: 404 });
    }
    reportPath = versionRow.report_path;
  }
  const { data, error } = await admin.storage
    .from("reports")
    .download(reportPath);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Download failed" },
      { status: 500 },
    );
  }

  const html = await data.text();
  const download = new URL(request.url).searchParams.get("download") === "1";
  const versionSuffix = requestedVersion !== null ? `-v${requestedVersion}` : "";
  const filename = `${audit.handle.replace(/[^a-z0-9_-]+/gi, "-")}-audit${versionSuffix}.html`;

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
