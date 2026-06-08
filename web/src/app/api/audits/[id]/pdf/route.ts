import { NextResponse } from "next/server";

import { getAuditForViewer } from "@/lib/audit-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";

/** Same-origin PDF download (object path: `{audit_id}.pdf`). */
export async function GET(
  _request: Request,
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
  if (audit.status !== "ready") {
    return NextResponse.json({ error: "Report not ready" }, { status: 404 });
  }
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
  }

  const pdfPath = `${audit.id}.pdf`;
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("pdfs").download(pdfPath);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "PDF not found" },
      { status: 404 },
    );
  }

  const bytes = Buffer.from(await data.arrayBuffer());
  const filename = `${audit.handle.replace(/[^a-z0-9_-]+/gi, "-")}-audit.pdf`;

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-cache",
    },
  });
}
