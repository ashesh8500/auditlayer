/**
 * Product-facing Living Brief sections — narrative cards, never raw JSON.
 */

import type { LucideIcon } from "lucide-react";
import {
  Compass,
  Eye,
  Flag,
  FlaskConical,
  Mic2,
  Sparkles,
  Target,
  Users,
  Wallet,
  Shield,
  Map,
} from "lucide-react";

import type { LivingBriefContent } from "@/lib/intelligence/types";

const SECTIONS: {
  key: keyof LivingBriefContent;
  label: string;
  Icon: LucideIcon;
}[] = [
  { key: "identity", label: "Who you are", Icon: Sparkles },
  { key: "vision", label: "Where you're going", Icon: Compass },
  { key: "audience", label: "Who you serve", Icon: Users },
  { key: "offers", label: "What you offer", Icon: Wallet },
  { key: "voice", label: "How you sound", Icon: Mic2 },
  { key: "positioning", label: "How you stand out", Icon: Map },
  { key: "goals", label: "Near-term goals", Icon: Target },
  { key: "successCriteria", label: "What success looks like", Icon: Flag },
  { key: "constraints", label: "Guardrails", Icon: Shield },
  { key: "activeExperiments", label: "What you're testing", Icon: FlaskConical },
  { key: "plannedChanges", label: "What's changing next", Icon: Eye },
];

/** Editable narrative fields for the Living Brief form (not subjectType). */
export const BRIEF_EDIT_FIELDS: Array<{
  key: Exclude<keyof LivingBriefContent, "subjectType">;
  label: string;
  hint?: string;
  rows: number;
}> = [
  {
    key: "identity",
    label: "Who you are",
    hint: "One or two sentences — the subject in plain language.",
    rows: 3,
  },
  {
    key: "audience",
    label: "Who you serve",
    hint: "The people this content is for.",
    rows: 3,
  },
  {
    key: "positioning",
    label: "How you stand out",
    hint: "What makes this subject different from peers.",
    rows: 3,
  },
  {
    key: "offers",
    label: "What you offer",
    hint: "One offer per line.",
    rows: 3,
  },
  {
    key: "goals",
    label: "Near-term goals",
    hint: "One goal per line — what the next audits should optimize for.",
    rows: 3,
  },
  {
    key: "vision",
    label: "Where you're going",
    rows: 2,
  },
  {
    key: "voice",
    label: "How you sound",
    rows: 2,
  },
  {
    key: "successCriteria",
    label: "What success looks like",
    rows: 2,
  },
  {
    key: "constraints",
    label: "Guardrails",
    hint: "What you will not do. One per line.",
    rows: 2,
  },
  {
    key: "activeExperiments",
    label: "What you're testing",
    hint: "One experiment per line.",
    rows: 2,
  },
  {
    key: "plannedChanges",
    label: "What's changing next",
    rows: 2,
  },
];

export function LivingBriefView({
  content,
  compact = false,
}: {
  content: LivingBriefContent;
  /** Overview snippet: identity + goals only */
  compact?: boolean;
}) {
  const sections = compact
    ? SECTIONS.filter((s) => s.key === "identity" || s.key === "goals")
    : SECTIONS.filter((s) => s.key !== "subjectType");

  const filled = sections.filter((s) => {
    const value = content[s.key];
    return typeof value === "string" && value.trim().length > 0;
  });

  if (filled.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This brief is still empty. Use Edit Living Brief to set who you serve
        and what success looks like — future audits will read through it.
      </p>
    );
  }

  return (
    <div className={compact ? "space-y-3" : "grid gap-3 sm:grid-cols-2"}>
      {filled.map(({ key, label, Icon }) => {
        const value = String(content[key]);
        return (
          <article
            key={key}
            className="border border-border bg-card p-4 shadow-[var(--shadow)]"
          >
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center bg-[color:var(--accent-muted)] text-[color:var(--accent)]">
                <Icon className="size-4" aria-hidden />
              </span>
              <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {label}
              </h3>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {value}
            </p>
          </article>
        );
      })}
    </div>
  );
}

/** Human path labels for model proposals (hide raw JSON pointers). */
export function briefPathLabel(path: string): string {
  const cleaned = path.replace(/^\/+/, "").replace(/_/g, " ");
  const map: Record<string, string> = {
    identity: "Who you are",
    vision: "Where you're going",
    audience: "Who you serve",
    offers: "What you offer",
    voice: "How you sound",
    positioning: "How you stand out",
    goals: "Near-term goals",
    successCriteria: "What success looks like",
    "success criteria": "What success looks like",
    constraints: "Guardrails",
    experiments: "What you're testing",
    activeExperiments: "What you're testing",
    plannedChanges: "What's changing next",
    "planned changes": "What's changing next",
  };
  const key = cleaned.split(/[./]/)[0] ?? cleaned;
  return map[key] ?? map[cleaned] ?? (cleaned || "Brief update");
}
