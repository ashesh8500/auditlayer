import { NextResponse } from "next/server";

import { getAuditForViewer } from "@/lib/audit-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";
import {
  auditAccessGate,
  redactStorageError,
  resolveReportVersionRequest,
} from "@/lib/access-boundary";

/** Same-origin HTML report for iframe viewing and download. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  // Canonical access decision BEFORE any service-role client or download.
  const access = await getAuditForViewer(id);
  const gate = auditAccessGate(access);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { audit } = access as { audit: { id: string; user_id: string; handle: string; status: string; report_path: string | null } };

  const versionParameter = new URL(request.url).searchParams.get("version");
  const requestedVersion = versionParameter === null ? null : Number(versionParameter);

  // Version requests are validated and kept scoped to the authorized audit.
  const versionRequest = resolveReportVersionRequest({
    requestedVersion,
    auditId: id,
    authorizedAuditId: audit.id,
  });
  if (!versionRequest.ok) {
    return NextResponse.json(
      { error: versionRequest.reason === "invalid" ? "Invalid report version" : "Report version not found" },
      { status: versionRequest.reason === "invalid" ? 400 : 404 },
    );
  }

  if (audit.status !== "ready" || !audit.report_path) {
    return NextResponse.json({ error: "Report not ready" }, { status: 404 });
  }
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
  }

  const admin = createAdminClient();
  let reportPath = audit.report_path;
  if (versionRequest.version > 0) {
    const { data: versionRow, error: versionError } = await (admin as any)
      .from("audit_report_versions")
      .select("report_path")
      .eq("audit_id", audit.id)
      .eq("version", versionRequest.version)
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
    // Storage errors can echo object paths; never let a private path or
    // credential reach client output.
    return NextResponse.json(
      { error: redactStorageError(error?.message) },
      { status: 500 },
    );
  }

  const html = await data.text();
  const download = new URL(request.url).searchParams.get("download") === "1";
  const versionSuffix = versionRequest.version > 0 ? `-v${versionRequest.version}` : "";
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
