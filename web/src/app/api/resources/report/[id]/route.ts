import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { presentReportHtml } from "@/lib/report-presentation";
import { REPORT_PRESENTATION_REVISION } from "@/lib/resources/report";
import { parseReaderVersion } from "@/lib/report-reader";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const { id } = await context.params;
  const requested = parseReaderVersion(new URL(request.url).searchParams.get("version"));
  if (requested === "invalid") return NextResponse.json({ error: "Invalid report version" }, { status: 400, headers });
  const db = await createClient();
  const { data: audit, error } = await db.from("audits")
    .select("id, handle, report_version, status, report_path").eq("id", id).eq("user_id", profile.id).abortSignal(request.signal).maybeSingle();
  if (error) return NextResponse.json({ error: "Report unavailable" }, { status: 503, headers });
  if (!audit || audit.status !== "ready" || !audit.report_path) return NextResponse.json({ error: "Report not found" }, { status: 404, headers });
  // Root owner check precedes every version/run/storage read (including admin users).
  const { data: versions, error: versionError } = await db.from("audit_report_versions")
    .select("version, report_path, created_at, change_type, changed_section, intelligence_run_id")
    .eq("audit_id", id).order("version", { ascending: false }).abortSignal(request.signal);
  if (versionError) return NextResponse.json({ error: "Version history unavailable" }, { status: 503, headers });
  const version = requested ?? audit.report_version ?? 1;
  const selected = versions?.find(row => row.version === version);
  if (requested !== null && !selected) return NextResponse.json({ error: "Report version not found" }, { status: 404, headers });
  let contextVersion: number | null = null;
  let evidenceSnapshotId: string | null = null;
  let methodology: string | null = null;
  // Never substitute the subject's newest run for an old artifact's immutable pin.
  if (selected?.intelligence_run_id) {
    const { data: run, error: runError } = await db.from("intelligence_runs")
      .select("subject_id, status, brief_version, evidence_snapshot_id, methodology_version")
      .eq("id", selected.intelligence_run_id).abortSignal(request.signal).maybeSingle();
    if (runError) return NextResponse.json({ error: "Provenance unavailable" }, { status: 503, headers });
    if (run && run.status === "completed") {
      const { data: subject, error: subjectError } = await db.from("subjects").select("id")
        .eq("id", run.subject_id).eq("user_id", profile.id).abortSignal(request.signal).maybeSingle();
      if (subjectError) return NextResponse.json({ error: "Provenance unavailable" }, { status: 503, headers });
      if (subject) { contextVersion = run.brief_version; evidenceSnapshotId = run.evidence_snapshot_id; methodology = run.methodology_version; }
    }
  }
  const metadata = { ownerId: profile.id, reportId: id, version,
    latestVersion: audit.report_version ?? 1, createdAt: selected?.created_at ?? null,
    contextVersion, evidenceSnapshotId, methodology,
    versions: (versions ?? []).map(row => ({ version: row.version, createdAt: row.created_at, changeType: row.change_type, changedSection: row.changed_section })),
    presentationRevision: REPORT_PRESENTATION_REVISION, handle: audit.handle, fetchedAt: new Date().toISOString(),
  };
  if (new URL(request.url).searchParams.get("metadata") === "1") return NextResponse.json(metadata, { headers });
  const { data, error: storageError } = await createAdminClient().storage.from("reports").download(selected?.report_path ?? audit.report_path);
  if (storageError || !data) return NextResponse.json({ error: "Report unavailable" }, { status: 503, headers });
  request.signal.throwIfAborted();
  const html = presentReportHtml(await data.text(), new URL(request.url).origin);
  // Hash actual presented bytes, not just a mutable storage path or audit id.
  const contentHash = createHash("sha256").update(html).digest("hex");
  return NextResponse.json({ ...metadata, contentHash, html }, { headers });
}
