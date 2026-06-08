import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/** Lightweight poll endpoint for live audit status + events (no full page reload). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: audit, error: auditError } = await supabase
    .from("audits")
    .select("status")
    .eq("id", id)
    .maybeSingle();

  if (auditError) {
    return NextResponse.json({ error: auditError.message }, { status: 500 });
  }
  if (!audit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: events, error: eventsError } = await supabase
    .from("audit_events")
    .select("id, phase, event_type, detail, actor, created_at")
    .eq("audit_id", id)
    .order("created_at", { ascending: true });

  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  return NextResponse.json({
    status: audit.status,
    events: events ?? [],
  });
}
