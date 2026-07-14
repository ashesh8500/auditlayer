"use client";

import { useActionState, useState } from "react";
import { Download, FileText, Loader2, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ALLOWED_REFINEMENT_SECTIONS } from "@/lib/refinement";
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
}: {
  auditId: string;
  reportReady: boolean;
  refinements: RefinementRow[];
}) {
  const [state, action, pending] = useActionState(
    requestRefinement,
    initialState,
  );
  const [section, setSection] = useState<string>(
    ALLOWED_REFINEMENT_SECTIONS[0],
  );

  const reportSrc = `/api/audits/${auditId}/report`;
  const htmlDownload = `/api/audits/${auditId}/report?download=1`;
  const pdfDownload = `/api/audits/${auditId}/pdf`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Report
        </h2>
        <div className="flex gap-2">
          <a href={reportReady ? htmlDownload : undefined} download>
            <Button variant="outline" size="sm" disabled={!reportReady}>
              <Download className="size-4" />
              HTML
            </Button>
          </a>
          <a href={reportReady ? pdfDownload : undefined} download>
            <Button variant="outline" size="sm" disabled={!reportReady}>
              <FileText className="size-4" />
              PDF
            </Button>
          </a>
        </div>
      </div>

      {reportReady ? (
        <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-[var(--shadow-md)]">
          <iframe
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
          <input type="hidden" name="section" value={section} />
          <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="section-select">Section</Label>
              <select
                id="section-select"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
              >
                {ALLOWED_REFINEMENT_SECTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="instruction">Instruction</Label>
              <Textarea
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
          {state.status === "queued" && state.message && (
            <p className="text-xs text-[color:var(--green)]">{state.message}</p>
          )}

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Queue refinement
            </Button>
          </div>
        </form>

        {refinements.length > 0 && (
          <ul className="mt-5 space-y-2 border-t border-border pt-4">
            {refinements.map((r) => (
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
