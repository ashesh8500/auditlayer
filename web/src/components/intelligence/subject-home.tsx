"use client";

import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  GitBranch,
  Target,
  XCircle,
  Eye,
  BookOpen,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type {
  SubjectSummary,
  ChannelSummary,
  LivingBriefVersion,
  ScoreEvidence,
  RecommendationSummary,
} from "@/lib/intelligence/types";
import {
  fixtureSubjects,
  fixtureChannels,
  fixtureBriefVersions,
  fixtureScores,
  fixtureRecommendations,
} from "@/lib/intelligence/fixtures";

const TABS = [
  ["overview", "Overview"],
  ["brief", "Living Brief"],
  ["scores", "Scores & Evidence"],
  ["recommendations", "Recommendations"],
] as const;

interface SubjectHomeProps {
  subjectId: string;
}

// ---- Main Subject Home ----

export function SubjectHome({ subjectId }: SubjectHomeProps) {
  const subjects = fixtureSubjects();
  const subject = subjects.find((s) => s.id === subjectId) ?? subjects[0];
  const channels = fixtureChannels(subjectId);
  const briefVersions = fixtureBriefVersions(subjectId);
  const scores = fixtureScores();
  const recommendations = fixtureRecommendations(subjectId);

  const [activeTab, setActiveTab] = useState<
    "overview" | "brief" | "scores" | "recommendations"
  >("overview");

  const currentBrief = briefVersions[0];

  return (
    <div className="space-y-8">
      {/* Subject header */}
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-border pb-7">
        <div className="flex items-center gap-4">
          <div className="grid size-14 shrink-0 place-items-center rounded-full bg-[color:var(--accent-muted)] text-lg font-semibold text-[color:var(--accent)]">
            {subject.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={subject.avatarUrl} alt="" className="size-full rounded-full object-cover" />
            ) : (
              subject.name.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              {subject.name}
            </h1>
            <p className="mt-1 text-sm capitalize text-muted-foreground">
              {subject.type} · {channels.length} channel{channels.length > 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <nav className="flex gap-1 border-b border-border" role="tablist">
        {TABS.map(([tab, label]) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab
                ? "border-[color:var(--accent)] text-[color:var(--accent)]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Tab panels */}
      {activeTab === "overview" && (
        <OverviewTab
          subject={subject}
          channels={channels}
          currentBrief={currentBrief}
          scores={scores}
          recommendations={recommendations}
        />
      )}
      {activeTab === "brief" && (
        <BriefTab versions={briefVersions} />
      )}
      {activeTab === "scores" && (
        <ScoresTab scores={scores} />
      )}
      {activeTab === "recommendations" && (
        <RecommendationsTab recommendations={recommendations} />
      )}
    </div>
  );
}

// ---- Overview Tab ----

function OverviewTab({
  channels,
  currentBrief,
  recommendations,
}: {
  subject: SubjectSummary;
  channels: ChannelSummary[];
  currentBrief: LivingBriefVersion | null;
  scores: ScoreEvidence[];
  recommendations: RecommendationSummary[];
}) {
  const activeRecs = recommendations.filter(
    (r) => r.status === "proposed" || r.status === "in_progress",
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      {/* Channels card */}
      <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-[var(--shadow)] sm:p-6">
        <h2 className="text-base font-semibold">Channels</h2>
        {channels.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No channels configured yet. Connect an Instagram account or add a website.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {channels.map((ch) => (
              <li key={ch.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="text-sm capitalize">
                  {ch.platform === "website" ? (
                    <GlobeIcon />
                  ) : (
                    <AtSymbol />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{ch.displayName || ch.handle || ch.url}</p>
                  <p className="text-xs text-muted-foreground">
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

      {/* Brief snapshot + active recs */}
      <div className="space-y-6">
        <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-[var(--shadow)]">
          <div className="flex items-center gap-2">
            <BookOpen className="size-4 text-[color:var(--accent)]" />
            <h2 className="text-sm font-semibold">Living Brief</h2>
          </div>
          {currentBrief ? (
            <>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                v{currentBrief.version} · {currentBrief.source === "user" ? "You edited" : "Model proposal"}
              </p>
              <p className="mt-2 text-xs leading-relaxed">
                {currentBrief.content.identity.slice(0, 120)}…
              </p>
            </>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">No brief configured yet.</p>
          )}
        </section>

        {activeRecs.length > 0 && (
          <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-[var(--shadow)]">
            <div className="flex items-center gap-2">
              <Target className="size-4 text-[color:var(--accent)]" />
              <h2 className="text-sm font-semibold">Active recommendations</h2>
            </div>
            <ul className="mt-3 space-y-2">
              {activeRecs.slice(0, 3).map((rec) => (
                <li key={rec.id} className="flex items-start gap-2 text-xs">
                  <RecStatusIcon status={rec.status} />
                  <span className="leading-relaxed">{rec.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

// ---- Brief Tab ----

function BriefTab({ versions }: { versions: LivingBriefVersion[] }) {
  const [expanded, setExpanded] = useState<string | null>(
    versions[0]?.id ?? null,
  );

  if (versions.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border border-dashed border-border p-12 text-center">
        <p className="text-sm text-muted-foreground">No Living Brief versions yet.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          A brief is created from your subject and channel data when you run your first audit.
        </p>
      </div>
    );
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <GitBranch className="size-4 text-[color:var(--accent)]" />
        <h2 className="text-base font-semibold">Version history</h2>
        <Badge tone="neutral">{versions.length} versions</Badge>
      </div>
      <ol className="relative border-l-2 border-border ml-3 space-y-6">
        {versions.map((v, i) => (
          <li key={v.id} className="pl-6 relative">
            <span
              className={`absolute -left-[9px] top-1 grid size-4 place-items-center rounded-full border-2 ${
                i === 0
                  ? "border-[color:var(--accent)] bg-[color:var(--accent)]"
                  : "border-border bg-card"
              }`}
            >
              {i === 0 && <span className="size-1.5 rounded-full bg-white" />}
            </span>
            <button
              onClick={() => setExpanded(expanded === v.id ? null : v.id)}
              className="text-left w-full"
            >
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">
                  v{v.version}
                  {i === 0 ? " · Current" : ""}
                </p>
                <Badge
                  tone={v.source === "user" ? "accent" : "warning"}
                >
                  {v.source === "user" ? "You edited" : "Proposal"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
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
                  <p className="text-muted-foreground italic">
                    {v.changeSummary}
                  </p>
                )}
                {(Object.entries(v.content) as [string, string][]).map(([key, value]) => (
                  <div key={key}>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      {key}
                    </p>
                    <p className="mt-0.5 leading-relaxed whitespace-pre-wrap">
                      {value || "—"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---- Scores Tab ----

function ScoresTab({ scores }: { scores: ScoreEvidence[] }) {
  const [expandedScore, setExpandedScore] = useState<string | null>(null);

  if (scores.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border border-dashed border-border p-12 text-center">
        <p className="text-sm text-muted-foreground">No scores yet.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Scores are computed from evidence during each audit run.
        </p>
      </div>
    );
  }

  // Compute overall score from non-null dimension scores
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
      {/* Overall score */}
      {overall != null && (
        <div className="rounded-[var(--radius)] border border-border bg-card p-6 text-center shadow-[var(--shadow)]">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Overall score
          </p>
          <p className="mt-2 font-mono text-5xl font-semibold tracking-[-0.04em]">
            {overall}
            <span className="text-xl text-muted-foreground">/100</span>
          </p>
        </div>
      )}

      {/* Dimension scores */}
      <div className="space-y-4">
        {scores.map((dim) => (
          <div
            key={dim.dimensionId}
            className="rounded-[var(--radius)] border border-border bg-card p-4 shadow-[var(--shadow)]"
          >
            <button
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
              <div className="shrink-0 text-right">
                <p className="font-mono text-lg font-semibold">
                  {dim.score != null ? dim.score : "Data needed"}
                </p>
              </div>
            </button>

            {/* Score bar */}
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              {dim.score != null ? (
                <div
                  className="h-full rounded-full bg-[color:var(--accent)]"
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
                    <p className="font-semibold text-[10px] uppercase tracking-[0.08em] text-muted-foreground mt-2">
                      Evidence ({dim.evidenceIds.length} items)
                    </p>
                    <ul className="mt-1 space-y-1">
                      {dim.evidenceIds.map((eid) => (
                        <li key={eid} className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
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

// ---- Recommendations Tab ----

function RecommendationsTab({
  recommendations,
}: {
  recommendations: RecommendationSummary[];
}) {
  if (recommendations.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border border-dashed border-border p-12 text-center">
        <p className="text-sm text-muted-foreground">No recommendations yet.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Recommendations are generated during each audit and can be accepted, rejected,
          or deferred. Rejected recommendations won&apos;t reappear without new evidence.
        </p>
      </div>
    );
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Target className="size-4 text-[color:var(--accent)]" />
        <h2 className="text-base font-semibold">Recommendation ledger</h2>
        <Badge tone="neutral">{recommendations.length} total</Badge>
      </div>
      <ul className="divide-y divide-border border-y border-border">
        {recommendations.map((rec) => (
          <li key={rec.id} className="flex items-start gap-3 py-3">
            <RecStatusIcon status={rec.status} />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-relaxed">{rec.text}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Status:{" "}
                <span className="font-medium">{REC_STATUS_LABELS[rec.status]}</span>
                {" · "}
                {new Date(rec.createdAt).toLocaleDateString()}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---- Helpers ----

const CHANGE_REASON_LABELS: Record<string, string> = {
  evidence_changed: "Changed because new evidence was collected.",
  brief_changed: "Changed because the Living Brief was updated.",
  methodology_changed: "Changed because the scoring method was updated.",
  prior_error_corrected: "Changed because a previous error was corrected.",
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
      return <CheckCircle2 className="size-4 shrink-0 text-[color:var(--green)]" />;
    case "rejected":
    case "invalidated":
      return <XCircle className="size-4 shrink-0 text-[color:var(--red)]" />;
    case "in_progress":
      return <ArrowRight className="size-4 shrink-0 text-[color:var(--accent)]" />;
    case "deferred":
    case "superseded":
      return <Clock className="size-4 shrink-0 text-[color:var(--amber)]" />;
    default:
      return <Target className="size-4 shrink-0 text-muted-foreground" />;
  }
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4 shrink-0 text-muted-foreground">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" x2="22" y1="12" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function AtSymbol() {
  return <span className="text-sm font-semibold text-muted-foreground shrink-0">@</span>;
}
