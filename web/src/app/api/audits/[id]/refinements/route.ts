import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { data: audit, error } = await db.from("audits")
    .select("id,report_version,report_path,status").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Status unavailable" }, { status: 503 });
  if (!audit) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").filter(Boolean);
  if (!ids.length || ids.length > 100 || ids.some(value => !/^[0-9a-f-]{36}$/i.test(value))) {
    return NextResponse.json({ error: "Invalid refinement ids" }, { status: 400 });
  }
  const { data: rows, error: rowsError } = await db.from("refinements")
    .select("id,section,instruction,status,error,created_at").eq("audit_id", id).in("id", ids);
  if (rowsError) return NextResponse.json({ error: "Status unavailable" }, { status: 503 });
  return NextResponse.json({ refinements: rows ?? [], reportVersion: audit.report_version,
    reportReady: audit.status === "ready" && Boolean(audit.report_path) },
    { headers: { "Cache-Control": "private, no-store" } });
}
