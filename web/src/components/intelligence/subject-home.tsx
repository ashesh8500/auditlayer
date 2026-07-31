"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  GitBranch,
  History,
  Target,
  XCircle,
  Eye,
  BookOpen,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  SubjectSummary,
  ChannelSummary,
  LivingBriefVersion,
  LivingBriefProposal,
  ScoreEvidence,
  RecommendationSummary,
  SinceLastAuditItem,
  ReportArchiveItem,
} from "@/lib/intelligence/types";
import {
  fixtureSubjects,
  fixtureChannels,
  fixtureBriefVersions,
  fixtureBriefProposals,
  fixtureScores,
  fixtureRecommendations,
  fixtureSinceLastAudit,
  fixtureReportArchive,
} from "@/lib/intelligence/fixtures";

const TABS = [
  ["overview", "Overview"],
  ["brief", "Living Brief"],
  ["scores", "Scores"],
  ["recommendations", "Recommendations"],
] as const;

interface SubjectHomeProps {
  subjectId: string;
  /** When true, show fixture banner so customers know data is illustrative until kernel lands */
  fixtureMode?: boolean;
}

export function SubjectHome({ subjectId, fixtureMode = true }: SubjectHomeProps) {
  const subjects = fixtureSubjects();
  const subject = subjects.find((s) => s.id === subjectId) ?? subjects[0];
  const channels = fixtureChannels(subject.id);
  const briefVersions = fixtureBriefVersions(subject.id);
  const proposals = fixtureBriefProposals(subject.id);
  const scores = fixtureScores();
  const recommendations = fixtureRecommendations(subject.id);
  const sinceLast = fixtureSinceLastAudit();
  const reports = fixtureReportArchive(subject.id);

  const [activeTab, setActiveTab] = useState<
    "overview" | "brief" | "scores" | "recommendations"
  >("overview");
  const [proposalState, setProposalState] = useState<
    Record<string, LivingBriefProposal["status"]>
  >(() => Object.fromEntries(proposals.map((p) => [p.id, p.status])));

  const currentBrief = briefVersions[0] ?? null;
  const pendingProposals = proposals.filter(
    (p) => (proposalState[p.id] ?? p.status) === "proposed",
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-border pb-7">
        <div className="flex min-w-0 items-center gap-4">
          <div className="grid size-14 shrink-0 place-items-center rounded-full bg-[color:var(--accent-muted)] text-lg font-semibold text-[color:var(--accent)]">
            {subject.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={subject.avatarUrl} alt="" className="size-full rounded-full object-cover" />
            ) : (
              subject.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              {subject.name}
            </h1>
            <p className="mt-1 text-sm capitalize text-muted-foreground">
              {subject.type} · {channels.length} channel
              {channels.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <Link href="/audits/new">
          <Button size="sm" className="font-semibold">
            New audit
          </Button>
        </Link>
      </header>

      {fixtureMode && (
        <p className="text-xs text-muted-foreground">
          Showing contract fixtures until subject ledgers are available on this
          environment. Confirmed versions and model proposals stay visually distinct.
        </p>
      )}

      <nav
        className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1"
        role="tablist"
        aria-label="Subject intelligence"
      >
        {TABS.map(([tab, label]) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`shrink-0 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px sm:px-4 ${
              activeTab === tab
                ? "border-[color:var(--accent)] text-[color:var(--accent)]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === "overview" && (
        <OverviewTab
          channels={channels}
          currentBrief={currentBrief}
          recommendations={recommendations}
          sinceLast={sinceLast}
          reports={reports}
          pendingProposalCount={pendingProposals.length}
        />
      )}
      {activeTab === "brief" && (
        <BriefTab
          versions={briefVersions}
          proposals={proposals}
          proposalState={proposalState}
          onResolve={(id, status) =>
            setProposalState((prev) => ({ ...prev, [id]: status }))
          }
        />
      )}
      {activeTab === "scores" && <ScoresTab scores={scores} />}
      {activeTab === "recommendations" && (
        <RecommendationsTab recommendations={recommendations} />
      )}
    </div>
  );
}

function OverviewTab({
  channels,
  currentBrief,
  recommendations,
  sinceLast,
  reports,
  pendingProposalCount,
}: {
  channels: ChannelSummary[];
  currentBrief: LivingBriefVersion | null;
  recommendations: RecommendationSummary[];
  sinceLast: SinceLastAuditItem[];
  reports: ReportArchiveItem[];
  pendingProposalCount: number;
}) {
  const activeRecs = recommendations.filter(
    (r) => r.status === "proposed" || r.status === "in_progress",
  );

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-base font-semibold">Channel map</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Managed channels belong to your workspace. Observed targets do not.
        </p>
        {channels.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No channels yet. Connect Instagram or add a website on New Audit.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {channels.map((ch) => (
              <li key={ch.id} className="flex items-center gap-3 py-3">
                <span className="text-sm">
                  {ch.platform === "website" ? <GlobeIcon /> : <AtSymbol />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {ch.displayName || ch.handle || ch.url}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {ch.platform === "website" ? ch.url : `@${ch.handle}`}
                    {" · "}
                    {ch.connected ? "Connected" : "Public research"}
                  </p>
                </div>
                <Badge
                  tone={
                    ch.ownershipStatus === "connected"
                      ? "success"
                      : ch.ownershipStatus === "observed"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {ch.ownershipStatus === "observed" ? "Observed" : "Managed"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-center gap-2">
          <BookOpen className="size-4 text-[color:var(--accent)]" />
          <h2 className="text-base font-semibold">Living Brief</h2>
        </div>
        {currentBrief ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              v{currentBrief.version}
              {currentBrief.source === "user"
                ? " · Confirmed"
                : " · From proposal"}
            </p>
            <p className="text-sm leading-relaxed">
              {currentBrief.content.identity}
            </p>
            {pendingProposalCount > 0 && (
              <p className="text-xs text-[color:var(--amber)]">
                {pendingProposalCount} model proposal
                {pendingProposalCount === 1 ? "" : "s"} waiting for confirm or
                reject.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No brief yet — it is created with your first audit.
          </p>
        )}
      </section>

      <section>
        <div className="flex items-center gap-2">
          <History className="size-4 text-[color:var(--accent)]" />
          <h2 className="text-base font-semibold">Since last audit</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Evidence, decisions, and brief changes — not another full report.
        </p>
        <ol className="mt-4 space-y-3 border-l-2 border-border pl-4">
          {sinceLast.map((item) => (
            <li key={item.id}>
              <p className="text-sm font-medium">{item.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {item.detail}
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {item.kind} ·{" "}
                {new Date(item.at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {activeRecs.length > 0 && (
        <section>
          <div className="flex items-center gap-2">
            <Target className="size-4 text-[color:var(--accent)]" />
            <h2 className="text-base font-semibold">Active recommendations</h2>
          </div>
          <ul className="mt-3 space-y-2">
            {activeRecs.slice(0, 3).map((rec) => (
              <li key={rec.id} className="flex items-start gap-2 text-sm">
                <RecStatusIcon status={rec.status} />
                <span className="leading-relaxed">{rec.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-[color:var(--accent)]" />
          <h2 className="text-base font-semibold">Report archive</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Immutable outputs pinned to past intelligence runs.
        </p>
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {reports.map((report) => (
            <li
              key={report.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="text-sm font-semibold">
                  {report.channelLabel} · v{report.reportVersion}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {report.promptVersion
                    ? `Method ${report.promptVersion} · `
                    : ""}
                  {new Date(report.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Link
                href={report.href}
                className="text-xs font-semibold text-[color:var(--accent)] hover:underline"
              >
                Open report
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function BriefTab({
  versions,
  proposals,
  proposalState,
  onResolve,
}: {
  versions: LivingBriefVersion[];
  proposals: LivingBriefProposal[];
  proposalState: Record<string, LivingBriefProposal["status"]>;
  onResolve: (id: string, status: "accepted" | "rejected") => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(
    versions[0]?.id ?? null,
  );

  return (
    <div className="space-y-10">
      <section>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <GitBranch className="size-4 text-[color:var(--accent)]" />
          <h2 className="text-base font-semibold">Confirmed versions</h2>
          <Badge tone="neutral">{versions.length}</Badge>
        </div>
        {versions.length === 0 ? (
          <EmptyState
            title="No Living Brief versions yet"
            detail="A brief is created from your subject and channel data on the first audit."
          />
        ) : (
          <ol className="relative ml-3 space-y-6 border-l-2 border-border">
            {versions.map((v, i) => (
              <li key={v.id} className="relative pl-6">
                <span
                  className={`absolute -left-[9px] top-1 grid size-4 place-items-center rounded-full border-2 ${
                    i === 0
                      ? "border-[color:var(--accent)] bg-[color:var(--accent)]"
                      : "border-border bg-card"
                  }`}
                >
                  {i === 0 && (
                    <span className="size-1.5 rounded-full bg-white" />
                  )}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setExpanded(expanded === v.id ? null : v.id)
                  }
                  className="w-full text-left"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">
                      v{v.version}
                      {i === 0 ? " · Current" : ""}
                    </p>
                    <Badge
                      tone={v.source === "user" ? "accent" : "warning"}
                    >
                      {v.source === "user" ? "Confirmed" : "From proposal"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(v.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </button>
                {expanded === v.id && (
                  <div className="mt-3 space-y-3 rounded bg-[var(--surface-muted)] p-4 text-xs">
                    {v.changeSummary && (
                      <p className="italic text-muted-foreground">
                        {v.changeSummary}
                      </p>
                    )}
                    {(
                      Object.entries(v.content) as [string, string][]
                    ).map(([key, value]) => (
                      <div key={key}>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                          {key}
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">
                          {value || "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <h2 className="text-base font-semibold">Model proposals</h2>
          <Badge tone="warning">Diffs — not yet confirmed</Badge>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Models may propose Living Brief changes. Identity, vision, goals, and
          constraints require your confirm or reject.
        </p>
        {proposals.length === 0 ? (
          <EmptyState
            title="No open proposals"
            detail="When an intelligence run suggests brief updates, they appear here."
          />
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {proposals.map((p) => {
              const status = proposalState[p.id] ?? p.status;
              return (
                <li key={p.id} className="space-y-3 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      tone={
                        status === "proposed"
                          ? "warning"
                          : status === "accepted"
                            ? "success"
                            : "neutral"
                      }
                    >
                      {status === "proposed"
                        ? "Awaiting decision"
                        : status}
                    </Badge>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {p.operation} {p.path} · base v{p.baseVersion}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed">{p.proposedValue}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.changeExplanation}
                  </p>
                  {p.evidenceIds.length > 0 && (
                    <p className="font-mono text-[10px] text-muted-foreground">
                      Evidence: {p.evidenceIds.join(", ")}
                    </p>
                  )}
                  {status === "proposed" && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => onResolve(p.id, "accepted")}
                      >
                        Confirm
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onResolve(p.id, "rejected")}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function ScoresTab({ scores }: { scores: ScoreEvidence[] }) {
  const [expandedScore, setExpandedScore] = useState<string | null>(null);

  if (scores.length === 0) {
    return (
      <EmptyState
        title="No scores yet"
        detail="Scores are computed from evidence during each audit run."
      />
    );
  }

  const numericScores = scores.filter((s) => s.score != null);
  const overall =
    numericScores.length > 0
      ? Math.round(
          numericScores.reduce((sum, s) => sum + (s.score ?? 0), 0) /
            numericScores.length,
        )
      : null;

  return (
    <section className="space-y-6">
      {overall != null && (
        <div className="border-b border-border pb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Overall score
          </p>
          <p className="mt-2 font-mono text-5xl font-semibold tracking-[-0.04em]">
            {overall}
            <span className="text-xl text-muted-foreground">/100</span>
          </p>
        </div>
      )}

      <div className="space-y-4">
        {scores.map((dim) => (
          <div key={dim.dimensionId} className="border-b border-border pb-4">
            <button
              type="button"
              onClick={() =>
                setExpandedScore(
                  expandedScore === dim.dimensionId ? null : dim.dimensionId,
                )
              }
              className="flex w-full items-center justify-between gap-4 text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{dim.dimensionLabel}</p>
                {dim.changeReason && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {CHANGE_REASON_LABELS[dim.changeReason]}
                    {dim.previousScore != null &&
                      ` (was ${dim.previousScore})`}
                  </p>
                )}
              </div>
              <p className="shrink-0 font-mono text-lg font-semibold">
                {dim.score != null ? dim.score : "Data needed"}
              </p>
            </button>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              {dim.score != null ? (
                <div
                  className="h-full rounded-full bg-[color:var(--accent)] transition-[width] duration-700"
                  style={{ width: `${(dim.score / dim.maxScore) * 100}%` }}
                />
              ) : (
                <div className="h-full w-full bg-muted" />
              )}
            </div>

            {expandedScore === dim.dimensionId && (
              <div className="mt-3 space-y-2 border-t border-border pt-3 text-xs">
                <p className="leading-relaxed text-muted-foreground">
                  {dim.rationale}
                </p>
                {dim.evidenceIds.length > 0 && (
                  <div>
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      Evidence ({dim.evidenceIds.length})
                    </p>
                    <ul className="mt-1 space-y-1">
                      {dim.evidenceIds.map((eid) => (
                        <li
                          key={eid}
                          className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground"
                        >
                          <Eye className="size-3" />
                          {eid}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function RecommendationsTab({
  recommendations,
}: {
  recommendations: RecommendationSummary[];
}) {
  if (recommendations.length === 0) {
    return (
      <EmptyState
        title="No recommendations yet"
        detail="Recommendations are generated during each audit. Rejected ones will not reappear without new evidence."
      />
    );
  }

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <Target className="size-4 text-[color:var(--accent)]" />
        <h2 className="text-base font-semibold">Recommendation lifecycle</h2>
        <Badge tone="neutral">{recommendations.length}</Badge>
      </div>
      <ul className="divide-y divide-border border-y border-border">
        {recommendations.map((rec) => (
          <li key={rec.id} className="flex items-start gap-3 py-3">
            <RecStatusIcon status={rec.status} />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-relaxed">{rec.text}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {REC_STATUS_LABELS[rec.status]}
                {" · "}
                {new Date(rec.createdAt).toLocaleDateString()}
                {rec.evidenceIds.length > 0
                  ? ` · ${rec.evidenceIds.length} evidence`
                  : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="border border-dashed border-border px-6 py-12 text-center">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

const CHANGE_REASON_LABELS: Record<string, string> = {
  evidence_changed: "Moved because evidence changed.",
  brief_changed: "Moved because the Living Brief lens changed.",
  methodology_changed: "Moved because methodology changed.",
  prior_error_corrected: "Moved because a prior correction landed.",
  new: "New score — no previous baseline.",
};

const REC_STATUS_LABELS: Record<string, string> = {
  proposed: "Proposed",
  accepted: "Accepted",
  rejected: "Rejected",
  in_progress: "In progress",
  implemented: "Implemented",
  deferred: "Deferred",
  superseded: "Superseded",
  invalidated: "Invalidated",
};

function RecStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "accepted":
    case "implemented":
      return (
        <CheckCircle2 className="size-4 shrink-0 text-[color:var(--green)]" />
      );
    case "rejected":
    case "invalidated":
      return <XCircle className="size-4 shrink-0 text-[color:var(--red)]" />;
    case "in_progress":
      return (
        <ArrowRight className="size-4 shrink-0 text-[color:var(--accent)]" />
      );
    case "deferred":
    case "superseded":
      return <Clock className="size-4 shrink-0 text-[color:var(--amber)]" />;
    default:
      return <Target className="size-4 shrink-0 text-muted-foreground" />;
  }
}

function GlobeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="size-4 shrink-0 text-muted-foreground"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" x2="22" y1="12" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function AtSymbol() {
  return (
    <span className="shrink-0 text-sm font-semibold text-muted-foreground">
      @
    </span>
  );
}

/** Unused subject type kept for callers that pass subject into overview */
export type { SubjectSummary };
