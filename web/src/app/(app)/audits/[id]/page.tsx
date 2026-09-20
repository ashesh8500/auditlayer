import Link from "next/link";
import { Suspense } from "react";
import { loadAuditContext } from "@/lib/audit-context";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ExperienceBanner } from "@/components/ui/experience-banner";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";
import { editableReportSections } from "@/lib/refinement";
import { SHARE_LINK_PUBLIC_COLUMNS, projectShareLink } from "@/lib/share-link-public";
import {
  PLATFORM_LABELS,
  type AuditStatus,
  type Platform,
} from "@/lib/domain";
import { CustomerWaitState } from "@/components/intelligence/customer-wait-state";
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
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: audit } = await supabase
    .from("audits")
    .select("*")
    .eq("id", id)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!audit || audit.user_id !== profile.id) notFound();

  const limitations = Array.isArray(audit.limitations)
    ? (audit.limitations as string[])
    : [];
  const status = audit.status as AuditStatus;
  const isWebLocator = /^https?:\/\//i.test(audit.handle);
  const reportVersion = Number((audit as any).report_version ?? 1);

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
        <div className="flex min-w-0 flex-wrap items-center gap-3 justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="min-w-0 max-w-full wrap-anywhere text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{isWebLocator ? audit.handle : `@${audit.handle}`}</h1>
            <span className="text-sm text-muted-foreground">
              {isWebLocator && audit.platform === "unknown" ? "Website" : PLATFORM_LABELS[audit.platform as Platform] ?? audit.platform}
            </span>
          </div>
          <div className="sm:text-right">
            <p className="mb-2 font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">Audit status</p>
            <StatusBadge status={status} />
            {status === "ready" && (
              <p className="mt-2 font-mono text-[0.65rem] text-muted-foreground">
                Report v{reportVersion}
              </p>
            )}
          </div>
        </div>
        {audit.milestone_label && (
          <p className="mt-1 text-sm text-muted-foreground">
            {audit.milestone_label}
          </p>
        )}
      </header>

      <Suspense fallback={null}><AuditContext auditId={id} ownerId={profile.id} supabase={supabase} /></Suspense>

      {limitations.length > 0 && (
        <ExperienceBanner
          tone="info"
          title="Data collection notes"
          className="mt-6"
        >
          <ul className="space-y-1.5">
            {limitations.map((l) => (
              <li key={l} className="text-xs text-[color:var(--blue)]">
                {l}
              </li>
            ))}
          </ul>
        </ExperienceBanner>
      )}

      <div className="mt-8">
        {status === "ready" ? (
          <ReadyReport auditId={id} audit={audit} supabase={supabase} />
        ) : (
          <CustomerWaitState
            auditId={id}
            internalStatus={status}
            startedAt={audit.created_at}
          />
        )}
      </div>
    </main>
  );
}

async function AuditContext({ auditId, ownerId, supabase }: {auditId:string;ownerId:string;supabase:Awaited<ReturnType<typeof createClient>>}) {
  let context;
  try { context = await loadAuditContext(supabase, auditId, ownerId); }
  catch { return <ExperienceBanner tone="warning" className="mt-4">Related reports could not be loaded. <Link href="/subjects" className="underline">View subjects</Link></ExperienceBanner>; }
  if (!context) return null;
  return <nav aria-label="Subject and related reports" className="mt-4 space-y-3 text-sm">
    <Link className="alm-focus font-semibold text-[color:var(--accent)] underline" href={`/subjects/${context.subject.id}`}>{context.subject.name}</Link>
    {context.audits.length > 1 && <ul className="flex flex-wrap gap-3">{context.audits.map(item=><li key={item.id}><Link aria-current={item.id===auditId?'page':undefined} className="alm-focus inline-flex min-h-11 max-w-full flex-wrap items-center gap-2 rounded-[var(--radius)] border border-border px-3" href={`/audits/${item.id}`}><span className="break-all">{item.handle}</span><StatusBadge status={item.status as AuditStatus}/></Link></li>)}</ul>}
  </nav>;
}

async function ReadyReport({
  auditId,
  audit,
  supabase,
}: {
  auditId: string;
  audit: {
    report_path: string | null;
    report_version?: number | null;
    id: string;
  };
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  if (!audit.report_path) return (
    <ExperienceBanner tone="warning" title="Report unavailable">
      The report file is unavailable. <Link href="/support" className="underline">Contact support</Link> for help recovering it.
    </ExperienceBanner>
  );
  // The parent has already authorized this audit. These independent reads
  // share that boundary, but must not add three sequential database trips.
  const [{ data: refinementRows }, { data: versionRows }, shareResult, reportHtml] =
    await Promise.all([
      supabase
        .from("refinements")
        .select("id, section, instruction, status, error, created_at")
        .eq("audit_id", auditId)
        .order("created_at", { ascending: false }),
      (supabase as any)
        .from("audit_report_versions")
        .select(
          "id, version, prompt_version, change_type, changed_section, change_summary, created_at",
        )
        .eq("audit_id", auditId)
        .order("version", { ascending: false }),
      Promise.resolve(
        (supabase as any)
          .from("share_links")
          .select(SHARE_LINK_PUBLIC_COLUMNS)
          .eq("audit_id", auditId)
          .order("created_at", { ascending: false }),
      ).catch(() => ({ data: [], error: true })),
      (async () => {
        if (!isSupabaseAdminConfigured()) return null;
        const { data, error } = await createAdminClient().storage.from("reports").download(audit.report_path!);
        if (error || !data) return null;
        return data.text();
      })().catch(() => null),
    ]);
  if (!reportHtml) return <ExperienceBanner tone="warning" title="Report unavailable">The report file could not be loaded. Reload to try again, or <Link href="/support" className="underline">contact support</Link>.</ExperienceBanner>;
  const shareLinks = (shareResult.data ?? []) as ShareLinkRow[];

  return (
    <div className="space-y-6">
      {/* Read full report button */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[color:var(--forest)] px-5 py-5 text-white sm:px-6">
        <div><p className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--teal-on-forest)]">Report ready</p><h2 className="mt-1 text-lg font-semibold">Read the analysis without the workspace controls.</h2></div>
        <Link href={`/audits/${auditId}/read`}>
          <Button size="sm" variant="secondary">
            <BookOpen className="size-3.5" />
            Read full report
          </Button>
        </Link>
      </div>

      {(versionRows ?? []).length > 0 && (
        <section className="alm-panel rounded-[var(--radius)] p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="alm-kicker">Version history</p>
              <h2 className="mt-1 text-base font-semibold">Immutable report revisions</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              New audits remain separate evidence snapshots.
            </p>
          </div>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {(versionRows ?? []).map((version: any, index: number) => (
              <li
                key={version.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    Report v{version.version}{index === 0 ? " · Current" : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {version.change_type === "refinement"
                      ? `Refined ${version.changed_section || "report"}`
                      : version.version > 1
                        ? "Full regeneration"
                        : "Initial generation"}
                    {` · ${new Date(version.created_at).toLocaleString()}`}
                  </p>
                </div>
                <a
                  href={`/api/audits/${auditId}/report?version=${version.version}`}
                  target="_blank"
                  rel="noreferrer"
                  className="alm-focus inline-flex min-h-10 items-center text-xs font-semibold text-[color:var(--accent)] hover:underline"
                >
                  Open version
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Side-by-side: report + downloads | refinements + share links */}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Left column: Report iframe + download buttons (from ReportViewer) */}
        <div>
          <ReportViewer
            auditId={auditId}
            reportReady={true}
            reportVersion={audit.report_version ?? 0}
            editableSections={editableReportSections(reportHtml)}
            refinements={(refinementRows ?? []) as RefinementRow[]}
          />
        </div>

        {/* Right column: Share links (and any other actions) — stacks below on mobile */}
        <div className="space-y-6 lg:pt-[2.625rem]">
          {shareResult.error ? <ExperienceBanner tone="warning" title="Sharing is temporarily unavailable">Reload this page to try again. Your existing links have not changed.</ExperienceBanner> : <ShareLinks
            auditId={auditId}
            links={shareLinks.map(projectShareLink)}
          />}
        </div>
      </div>
    </div>
  );
}
