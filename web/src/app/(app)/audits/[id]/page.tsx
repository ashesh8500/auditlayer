import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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
import { ShareLinks } from "@/components/share-links";
import { StatusBadge } from "@/components/status-badge";
import type { ShareLinkRow } from "@/lib/actions/shares";

export const metadata = { title: "Audit — AuditLayerMedia" };

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
    <main className="alm-shell py-8 sm:py-12 animate-page-in">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-3.5" />
        Back to dashboard
      </Link>

      <header className="mt-5 grid gap-5 border-b border-border pb-7 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">@{audit.handle}</h1>
            <span className="text-sm text-muted-foreground">
              {PLATFORM_LABELS[audit.platform as Platform] ?? audit.platform}
            </span>
          </div>
          <div className="sm:text-right"><p className="mb-2 font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">Audit status</p><StatusBadge status={status} /></div>
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
              <li key={l} className="text-xs text-[color:var(--blue)]">
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
            retryCount={audit.retry_count ?? 0}
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
    id: string;
  };
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const { data: refinementRows } = await supabase
    .from("refinements")
    .select("id, section, instruction, status, error, created_at")
    .eq("audit_id", auditId)
    .order("created_at", { ascending: false });

  // Fetch share links (table may not exist yet if migration hasn't been run)
  let shareLinks: ShareLinkRow[] = [];
  try {
    const { data } = await (supabase as any)
      .from("share_links")
      .select("*")
      .eq("audit_id", auditId)
      .order("created_at", { ascending: false });
    shareLinks = (data ?? []) as ShareLinkRow[];
  } catch {
    // Table doesn't exist yet — no share links
  }

  return (
    <div className="space-y-6">
      {/* Read full report button */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#14241f] px-5 py-5 text-white sm:px-6">
        <div><p className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-[#8de0d3]">Report ready</p><h2 className="mt-1 text-lg font-semibold">Read the analysis without the workspace controls.</h2></div>
        <Link href={`/audits/${auditId}/read`}>
          <Button size="sm" variant="secondary">
            <BookOpen className="size-3.5" />
            Read full report
          </Button>
        </Link>
      </div>

      {/* Side-by-side: report + downloads | refinements + share links */}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Left column: Report iframe + download buttons (from ReportViewer) */}
        <div>
          <ReportViewer
            auditId={auditId}
            reportReady={Boolean(audit.report_path)}
            pdfReady={(audit as any).pdf_status === 'ready'}
            refinements={(refinementRows ?? []) as RefinementRow[]}
          />
        </div>

        {/* Right column: Share links (and any other actions) — stacks below on mobile */}
        <div className="space-y-6 lg:pt-[2.625rem]">
          <ShareLinks
            auditId={auditId}
            links={(shareLinks ?? []) as ShareLinkRow[]}
          />
        </div>
      </div>
    </div>
  );
}
