import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { projectCustomerStatus } from "@/lib/intelligence/client-status";
import type { AuditStatus } from "@/lib/domain";

/** Audit-owned progress only. A subject's newest run may belong to another
 * channel/batch and is never authority for this audit's terminal status. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: audit, error: auditError } = await supabase
    .from("audits")
    .select("status, created_at, claimed_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (auditError) return NextResponse.json({ error: "Unable to load report status" }, { status: 500 });
  if (!audit) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: events, error: eventError } = await supabase
    .from("audit_events")
    .select("phase, event_type, created_at")
    .eq("audit_id", id)
    .order("created_at", { ascending: true });
  if (eventError) return NextResponse.json({ error: "Progress temporarily unavailable" }, { status: 503 });

  const projected = projectCustomerStatus(
    audit.status as AuditStatus,
    (events ?? []).map((event) => ({
      phase: event.phase,
      event_type: event.event_type,
      detail: null,
      created_at: event.created_at ?? new Date(0).toISOString(),
    })),
    audit.claimed_at ?? audit.created_at,
  );
  return NextResponse.json({
    phase: projected.phase,
    terminal: projected.terminal,
    message: projected.message,
    startedAt: projected.startedAt,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
