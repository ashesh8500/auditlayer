import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { workflowRpc } from "@/lib/workflows/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Authenticated, revocable artifact link. Live recipient grant is re-checked by
 * SQL on every request, so revocation/pause/cancellation takes effect
 * immediately. No signed storage URL, attachment or provider receipt is exposed.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const profile = await getProfile();
  const headers = { "Cache-Control": "private, no-store" };
  if (!profile || !uuid.test(id)) return NextResponse.json({ error: "Not available" }, { status: 403, headers });
  if (!isSupabaseAdminConfigured()) return NextResponse.json({ error: "Not available" }, { status: 503, headers });
  let artifact: { report_path?: unknown };
  try {
    artifact = await workflowRpc("artifact_access", { viewer_id: profile.id, delivery_id: id }) as { report_path?: unknown };
  } catch {
    return NextResponse.json({ error: "Not available" }, { status: 403, headers });
  }
  if (typeof artifact?.report_path !== "string" || !artifact.report_path) return NextResponse.json({ error: "Not available" }, { status: 403, headers });
  const { data, error } = await createAdminClient().storage.from("reports").download(artifact.report_path);
  if (error || !data) return NextResponse.json({ error: "Not available" }, { status: 500, headers });
  return new NextResponse(await data.text(), {
    status: 200,
    headers: {
      ...headers,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": "inline",
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy": "sandbox",
    },
  });
}
