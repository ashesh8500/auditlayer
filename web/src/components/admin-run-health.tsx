import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { ExperienceBanner } from "@/components/ui/experience-banner";
import { ExperienceEmpty } from "@/components/ui/experience-state";
import { cn } from "@/lib/utils";
import {
  formatRunAge,
  type IntelligenceRunHealth,
  type ReportAttemptHealth,
  type RunHealthBundle,
} from "@/lib/admin-run-health";

/**
 * AdminRunHealth — server-renderable founder run-health panel.
 *
 * ALM-I-016. Consumes the deterministic bundle produced by
 * `web/src/lib/admin-run-health.ts` and renders two bounded owner sections:
 * report-generation attempts (report-pipeline vocabulary) and intelligence
 * runs (subject-run vocabulary). Never conflates the two vocabularies, never
 * renders handles/emails/evidence bodies/stage payload values/raw exceptions/
 * credentials/tracebacks, and never offers a mutation — correction tips are
 * guidance only. Reuses shared primitives (Badge, ExperienceBanner,
 * ExperienceEmpty, alm-panel) and is mobile-safe (flex-wrap rows).
 *
 * This is a server component by construction (no "use client"); it is only
 * composed inside the founder-only `/admin` server route behind requireAdmin.
 */

const REPORT_STATE_TONE: Record<
  ReportAttemptHealth["state"],
  "neutral" | "accent" | "success" | "warning" | "danger" | "info"
> = {
  ready: "success",
  running: "info",
  delayed: "warning",
  failed: "danger",
  crashed: "danger",
  blocked: "warning",
  needs_review: "warning",
  resumed: "accent",
  contradictory: "danger",
  unknown: "neutral",
};

const INTELLIGENCE_STATE_TONE: Record<
  IntelligenceRunHealth["state"],
  "neutral" | "accent" | "success" | "warning" | "danger" | "info"
> = {
  completed: "success",
  running: "info",
  delayed: "warning",
  failed: "danger",
  resumed: "accent",
  contradictory: "danger",
  unknown: "neutral",
};

const REPORT_STATE_LABEL: Record<ReportAttemptHealth["state"], string> = {
  ready: "Ready",
  running: "Running",
  delayed: "Delayed",
  failed: "Failed",
  crashed: "Crashed",
  blocked: "Blocked",
  needs_review: "Needs review",
  resumed: "Resumed",
  contradictory: "Contradictory",
  unknown: "Unknown",
};

const INTELLIGENCE_STATE_LABEL: Record<IntelligenceRunHealth["state"], string> = {
  completed: "Completed",
  running: "Running",
  delayed: "Delayed",
  failed: "Failed",
  resumed: "Resumed",
  contradictory: "Contradictory",
  unknown: "Unknown",
};

function statusLabel(owner: "report_generation_run" | "intelligence_run", state: string): string {
  if (owner === "report_generation_run") {
    return REPORT_STATE_LABEL[state as ReportAttemptHealth["state"]] ?? "Unknown";
  }
  return INTELLIGENCE_STATE_LABEL[state as IntelligenceRunHealth["state"]] ?? "Unknown";
}

function toneFor(
  owner: "report_generation_run" | "intelligence_run",
  state: string,
): "neutral" | "accent" | "success" | "warning" | "danger" | "info" {
  if (owner === "report_generation_run") {
    return REPORT_STATE_TONE[state as ReportAttemptHealth["state"]] ?? "neutral";
  }
  return INTELLIGENCE_STATE_TONE[state as IntelligenceRunHealth["state"]] ?? "neutral";
}

function issueCounts(bundle: RunHealthBundle): {
  critical: number;
  attention: number;
} {
  const criticalStates = new Set(["failed", "crashed", "contradictory"]);
  const attentionStates = new Set(["delayed", "blocked", "needs_review", "unknown"]);
  let critical = 0;
  let attention = 0;
  for (const h of [...bundle.reportAttempts, ...bundle.intelligenceRuns]) {
    if (criticalStates.has(h.state)) critical += 1;
    else if (attentionStates.has(h.state)) attention += 1;
  }
  return { critical, attention };
}

function UnsupportedSignals({ signals }: { signals: readonly { signal: string; state: string; correctionTip: string }[] }) {
  return (
    <div className="mt-2 space-y-1">
      {signals.map((u) => (
        <p key={u.signal} className="text-xs leading-5 text-muted-foreground">
          <span className="font-mono font-semibold text-[color:var(--amber)]">
            {u.signal}: {u.state}
          </span>
          <span className="ml-1">{u.correctionTip}</span>
        </p>
      ))}
    </div>
  );
}

function AttemptRow({ h }: { h: ReportAttemptHealth }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={toneFor(h.owner, h.state)}>
            {statusLabel(h.owner, h.state)}
          </Badge>
          {h.resumed && <Badge tone="accent">Resumed</Badge>}
          <span className="font-mono text-xs text-muted-foreground">
            {h.recordId.slice(0, 8)}
          </span>
          {h.auditId && (
            <span className="text-xs text-muted-foreground">
              audit {h.auditId.slice(0, 8)}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {h.statusKnown ? `status ${h.status}` : `raw status ${JSON.stringify(h.status)}`}
          {" · "}
          age {formatRunAge(h.ageMs)}
          {h.errorCode ? ` · error ${h.errorCode}` : ""}
          {h.evidenceItems !== null ? ` · evidence ${h.evidenceItems}` : ""}
        </p>
        {h.correctionTip && (
          <p className="mt-1 text-xs leading-5 text-[color:var(--amber)]">{h.correctionTip}</p>
        )}
        <UnsupportedSignals signals={h.unsupported} />
      </div>
    </li>
  );
}

function IntelligenceRow({ h }: { h: IntelligenceRunHealth }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={toneFor(h.owner, h.state)}>
            {statusLabel(h.owner, h.state)}
          </Badge>
          {h.resumed && <Badge tone="accent">Resumed</Badge>}
          <span className="font-mono text-xs text-muted-foreground">
            {h.recordId.slice(0, 8)}
          </span>
          {h.subjectId && (
            <span className="text-xs text-muted-foreground">
              subject {h.subjectId.slice(0, 8)}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {h.statusKnown ? `status ${h.status}` : `raw status ${JSON.stringify(h.status)}`}
          {" · "}
          age {formatRunAge(h.ageMs)}
          {h.latencyMs !== null ? ` · latency ${h.latencyMs}ms` : ""}
        </p>
        {h.correctionTip && (
          <p className="mt-1 text-xs leading-5 text-[color:var(--amber)]">{h.correctionTip}</p>
        )}
        <UnsupportedSignals signals={h.unsupported} />
      </div>
    </li>
  );
}

export function AdminRunHealth({ bundle, className }: { bundle: RunHealthBundle; className?: string }) {
  const { critical, attention } = issueCounts(bundle);

  if (bundle.empty) {
    return (
      <section data-slot="admin-run-health" className={cn("mt-8", className)}>
        <ExperienceEmpty
          icon={<span aria-hidden="true" className="text-sm">✓</span>}
          title="No run records yet"
          description="Report attempts and intelligence runs will appear here once generation has started."
        />
      </section>
    );
  }

  return (
    <section data-slot="admin-run-health" aria-labelledby="run-health-heading" className={cn("mt-8", className)}>
      <h2 id="run-health-heading" className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Run health
      </h2>

      {critical > 0 ? (
        <ExperienceBanner tone="danger" role="alert" title={`${critical} run${critical === 1 ? "" : "s"} need attention`}>
          Failed, crashed, or contradictory runs may need founder review. Nothing on this panel mutates state.
        </ExperienceBanner>
      ) : attention > 0 ? (
        <ExperienceBanner tone="warning" title={`${attention} run${attention === 1 ? "" : "s"} delayed or waiting`}>
          Delayed, blocked, needs-review, or unknown runs are surfaced below with recovery guidance.
        </ExperienceBanner>
      ) : (
        <ExperienceBanner tone="success" title="All tracked runs are healthy">
          No failed, crashed, delayed, or contradictory run records detected.
        </ExperienceBanner>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="alm-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="alm-kicker">Report attempts</h3>
            <Badge tone="neutral">{bundle.reportAttempts.length}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Private generation-attempt telemetry · report-pipeline status vocabulary.
          </p>
          {bundle.reportAttempts.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No report attempts yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {bundle.reportAttempts.map((h) => (
                <AttemptRow key={h.recordId} h={h} />
              ))}
            </ul>
          )}
        </div>

        <div className="alm-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="alm-kicker">Intelligence runs</h3>
            <Badge tone="neutral">{bundle.intelligenceRuns.length}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Subject-domain run truth · intelligence-run status vocabulary.
          </p>
          {bundle.intelligenceRuns.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No intelligence runs yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {bundle.intelligenceRuns.map((h) => (
                <IntelligenceRow key={h.recordId} h={h} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
