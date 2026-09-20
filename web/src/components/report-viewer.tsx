"use client";

import { ReportFrame } from "@/components/report-frame";
import { useActionState, useState } from "react";
import { Download, Loader2, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useRefinementStatus } from "@/lib/use-refinement-status";
import {
  requestRefinement,
  type RefinementState,
} from "@/lib/actions/refinements";

export interface RefinementRow {
  id: string;
  section: string;
  instruction: string;
  status: string;
  error: string;
  created_at: string;
}

const initialState: RefinementState = { status: "idle" };

export function ReportViewer({
  auditId,
  reportReady,
  refinements,
  editableSections = [],
  reportVersion = 0,
}: {
  auditId: string;
  reportReady: boolean;
  refinements: RefinementRow[];
  editableSections?: string[];
  reportVersion?: number;
}) {
  const [state, action, pending] = useActionState(
    requestRefinement,
    initialState,
  );
  const [section, setSection] = useState<string>(
    editableSections[0] ?? "",
  );

  const observed = useRefinementStatus(auditId, refinements, reportVersion, state.refinementId);
  const rows = observed.refinements;
  const selectedSection = editableSections.includes(section) ? section : (editableSections[0] ?? "");
  const versionQuery = observed.reportVersion > 0 ? `version=${observed.reportVersion}` : "";
  const reportSrc = `/api/audits/${auditId}/report${versionQuery ? `?${versionQuery}` : ""}`;
  const htmlDownload = `${reportSrc}${versionQuery ? "&" : "?"}download=1`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Report
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {reportReady && <a className="inline-flex min-h-11 items-center text-sm underline alm-focus" href={`/audits/${auditId}/read`}>Read &amp; browse versions</a>}
          <a href={reportReady ? htmlDownload : undefined} download>
            <Button variant="outline" size="sm" disabled={!reportReady}>
              <Download className="size-4" />
              Download report
            </Button>
          </a>
        </div>
      </div>

      {reportReady ? (
        <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-[var(--shadow-md)]">
          <ReportFrame
            key={reportSrc}
            title="Audit report"
            src={reportSrc}
            sandbox="allow-same-origin"
            referrerPolicy="no-referrer"
            className="h-[72vh] w-full bg-white"
          />
        </div>
      ) : (
        <div className="rounded-[var(--radius)] border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          The report file isn&apos;t available yet. If this persists, a founder
          will take a look.
        </div>
      )}

      <section className="rounded-[var(--radius)] border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <Wand2 className="size-4 text-[color:var(--accent)]" />
          <h3 className="text-sm font-semibold">Refine a section</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Request a focused edit to one report section. This isn&apos;t a
          general chat — instructions are scoped to the section you pick.
        </p>

        <form action={action} className="mt-4 space-y-3">
          <input type="hidden" name="auditId" value={auditId} />
          <input type="hidden" name="section" value={selectedSection} />
          <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="section-select">Section</Label>
              <select
                disabled={!reportReady || !editableSections.length || pending}
                id="section-select"
                value={selectedSection}
                onChange={(e) => setSection(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
              >
                {editableSections.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="instruction">Instruction</Label>
              <Textarea
                disabled={!reportReady || !editableSections.length || pending}
                maxLength={4000}
                id="instruction"
                name="instruction"
                rows={3}
                placeholder="Tighten the executive summary to three sentences and lead with the engagement gap."
                aria-invalid={state.status === "error"}
              />
            </div>
          </div>

          {state.status === "error" && state.message && (
            <p className="text-xs text-[color:var(--red)]">{state.message}</p>
          )}
          {state.status === "queued" && state.message && !rows.some(r => r.id === state.refinementId && ["done", "failed"].includes(r.status)) && (
            <p className="text-xs text-[color:var(--green)]">{state.message}</p>
          )}

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending || !reportReady || !selectedSection}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Queue refinement
            </Button>
          </div>
        </form>

        {observed.error && <p role="alert" className="mt-3 text-sm">{observed.error} <Button type="button" variant="ghost" size="sm" className="min-h-11 underline" onClick={() => window.location.reload()}>Refresh</Button></p>}
        {reportReady && rows.some(r => r.status === "done") && !rows.some(r => ["queued", "running"].includes(r.status)) && <p role="status" className="mt-3 text-sm">Refinement complete. The latest report version is shown.</p>}
        {rows.length > 0 && (
          <ul className="mt-5 space-y-2 border-t border-border pt-4">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex items-start justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <span className="font-medium">{r.section}</span>
                  <p className="truncate text-muted-foreground">
                    {r.instruction}
                  </p>
                  {r.status === "failed" && r.error && (
                    <p className="text-[color:var(--red)]">{r.error}</p>
                  )}
                </div>
                <Badge
                  tone={
                    r.status === "done"
                      ? "success"
                      : r.status === "failed"
                        ? "danger"
                        : "info"
                  }
                >
                  {r.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
