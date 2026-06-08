import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import {
  PLATFORM_LABELS,
  type AuditStatus,
  type Platform,
} from "@/lib/domain";
import { LiveTimeline, type TimelineEvent } from "@/components/live-timeline";
import {
  ReportViewer,
  type RefinementRow,
} from "@/components/report-viewer";

export const metadata = { title: "Audit — AuditLayer" };

export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireProfile();
  const supabase = await createClient();

  const { data: audit } = await supabase
    .from("audits")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!audit) notFound();

  const { data: eventRows } = await supabase
    .from("audit_events")
    .select("id, phase, event_type, detail, actor, created_at")
    .eq("audit_id", id)
    .order("created_at", { ascending: true });

  const events = (eventRows ?? []) as TimelineEvent[];
  const limitations = Array.isArray(audit.limitations)
    ? (audit.limitations as string[])
    : [];
  const status = audit.status as AuditStatus;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to dashboard
      </Link>

      <header className="mt-4 border-b border-border pb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">@{audit.handle}</h1>
          <span className="text-sm text-muted-foreground">
            {PLATFORM_LABELS[audit.platform as Platform] ?? audit.platform}
          </span>
        </div>
        {audit.milestone_label && (
          <p className="mt-1 text-sm text-muted-foreground">
            {audit.milestone_label}
          </p>
        )}
      </header>

      {limitations.length > 0 && (
        <section className="mt-6 rounded-[var(--radius)] border-l-[3px] border-[color:var(--blue)] bg-[color:var(--blue-muted)] px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--blue)]">
            Data collection notes
          </h2>
          <ul className="mt-2 space-y-1.5">
            {limitations.map((l) => (
              <li key={l} className="text-xs text-[color:#1e3a8a]">
                {l}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8">
        {status === "ready" ? (
          <ReadyReport auditId={id} audit={audit} supabase={supabase} />
        ) : (
          <LiveTimeline
            auditId={id}
            initialEvents={events}
            status={status}
            realtimeEnabled={isSupabaseConfigured()}
          />
        )}
      </div>
    </main>
  );
}

async function ReadyReport({
  auditId,
  audit,
  supabase,
}: {
  auditId: string;
  audit: {
    report_path: string | null;
    report_url: string | null;
    pdf_url: string | null;
    id: string;
  };
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const { data: refinementRows } = await supabase
    .from("refinements")
    .select("id, section, instruction, status, error, created_at")
    .eq("audit_id", auditId)
    .order("created_at", { ascending: false });

  return (
    <ReportViewer
      auditId={auditId}
      reportReady={Boolean(audit.report_path)}
      refinements={(refinementRows ?? []) as RefinementRow[]}
    />
  );
}
