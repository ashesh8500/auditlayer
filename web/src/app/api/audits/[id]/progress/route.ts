import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { projectCustomerStatus } from "@/lib/intelligence/client-status";
import type { AuditStatus } from "@/lib/domain";

/**
 * Customer-safe progress projection.
 * Never returns internal event types, actors, cache hits, retries, or worker names.
 */
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
    .select("status, created_at, claimed_at")
    .eq("id", id)
    .maybeSingle();

  if (auditError) {
    return NextResponse.json({ error: auditError.message }, { status: 500 });
  }
  if (!audit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: events } = await supabase
    .from("audit_events")
    .select("phase, event_type, detail, created_at")
    .eq("audit_id", id)
    .order("created_at", { ascending: true });

  // Prefer allowlisted intelligence_run_progress when this audit is batched.
  const { data: batchLink } = await supabase
    .from("batch_audits")
    .select("batch_id, audit_batches(subject_id)")
    .eq("audit_id", id)
    .maybeSingle();

  const batch = batchLink?.audit_batches as
    | { subject_id?: string }
    | { subject_id?: string }[]
    | null
    | undefined;
  const subjectId = Array.isArray(batch)
    ? batch[0]?.subject_id
    : batch?.subject_id;

  if (subjectId) {
    const { data: progress } = await supabase
      .from("intelligence_run_progress")
      .select("customer_state, detail, updated_at")
      .eq("subject_id", subjectId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (progress?.customer_state) {
      const state = progress.customer_state as string;
      const terminalMap: Record<string, AuditStatus | null> = {
        succeeded: "ready",
        failed: "failed",
        delayed: null,
      };
      const phaseMap: Record<string, "preparing" | "analyzing" | "finalizing" | "delayed"> =
        {
          preparing: "preparing",
          analyzing: "analyzing",
          finalizing: "finalizing",
          delayed: "delayed",
          succeeded: "finalizing",
          failed: "finalizing",
        };
      const terminal = terminalMap[state] ?? null;
      // Prefer live audit status for terminal ready when report is ready.
      const auditStatus = audit.status as AuditStatus;
      const resolvedTerminal =
        auditStatus === "ready" ||
        auditStatus === "failed" ||
        auditStatus === "blocked" ||
        auditStatus === "needs_review"
          ? auditStatus
          : terminal;

      return NextResponse.json({
        phase: phaseMap[state] ?? "preparing",
        terminal: resolvedTerminal,
        message: progress.detail || null,
        startedAt: audit.claimed_at ?? audit.created_at,
      });
    }
  }

  const projected = projectCustomerStatus(
    audit.status as AuditStatus,
    (events ?? []).map((e) => ({
      phase: e.phase,
      event_type: e.event_type,
      detail: e.detail,
      created_at: e.created_at ?? new Date(0).toISOString(),
    })),
    audit.claimed_at ?? audit.created_at,
  );

  return NextResponse.json({
    phase: projected.phase,
    terminal: projected.terminal,
    message: projected.message,
    startedAt: projected.startedAt,
  });
}
