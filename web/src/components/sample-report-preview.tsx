"use client";

import { useState } from "react";

const SCORE_ROWS = [
  ["Content strategy", 32],
  ["Engagement depth", 55],
  ["Brand cohesion", 68],
  ["Conversion path", 22],
  ["Format discipline", 44],
  ["Audience trust", 61],
] as const;

const TABS = ["Diagnosis", "Benchmark", "Action plan"] as const;
type Tab = (typeof TABS)[number];

export function SampleReportPreview({ full = false }: { full?: boolean }) {
  const [tab, setTab] = useState<Tab>("Diagnosis");

  return (
    <div className="relative bg-[color:var(--forest)] p-4 shadow-[var(--shadow-lg)] sm:p-7">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[color:var(--teal-on-forest)]/70" aria-hidden="true" />
      <div className="bg-card shadow-2xl">
        <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between sm:p-7">
          <div>
            <p className="alm-kicker">Fictional sample intelligence brief</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">@glowstate</h2>
            <p className="mt-1 text-xs text-muted-foreground">Representative report structure · no client data</p>
          </div>
          <div className="sm:text-right"><b className="font-mono text-4xl">48</b><span className="font-mono text-xs text-muted-foreground"> / 100</span></div>
        </div>

        <div className="grid grid-cols-3 border-b border-border bg-muted/40 p-1" role="tablist" aria-label="Sample report sections">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              onClick={() => setTab(item)}
              className={`alm-focus min-h-10 px-2 text-xs font-semibold transition-colors sm:text-sm ${tab === item ? "bg-card text-foreground shadow-[var(--shadow)]" : "text-muted-foreground hover:text-foreground"}`}
            >
              {item}
            </button>
          ))}
        </div>

        <div className={`p-5 sm:p-7 ${full ? "min-h-[30rem]" : "min-h-[24rem]"}`}>
          {tab === "Diagnosis" && (
            <div className="animate-page-in">
              <div>
                {SCORE_ROWS.map(([label, score]) => (
                  <div key={label} className="grid grid-cols-[7.5rem_1fr_1.75rem] items-center gap-3 border-b border-border/70 py-2.5 text-xs sm:grid-cols-[9rem_1fr_2rem]">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-[color:var(--accent)]" style={{ width: `${score}%` }} /></span>
                    <b className="text-right font-mono">{score}</b>
                  </div>
                ))}
              </div>
              <div className="mt-5 border-l-2 border-[color:var(--accent)] bg-[color:var(--accent-muted)] p-4">
                <p className="alm-kicker">Primary constraint</p>
                <p className="mt-2 text-sm font-medium leading-6">A coherent brand without a repeatable distribution system.</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">Strong identity is not translating into discovery because format selection and post-to-post continuation are inconsistent.</p>
              </div>
            </div>
          )}

          {tab === "Benchmark" && (
            <div className="animate-page-in">
              <p className="alm-kicker">Same-tier context</p>
              <h3 className="mt-2 text-xl font-semibold">The gap is distribution discipline.</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Comparable fictional accounts are not winning through a different niche. They repeat recognisable formats and guide first-time profile visitors more deliberately.</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[["@peakmethod", "72", "Repeatable series"], ["@formdaily", "61", "Faster replies"], ["@buildclub", "53", "Clearer profile path"]].map(([handle, score, reason]) => (
                  <div key={handle} className="border border-border bg-muted/30 p-4">
                    <div className="flex items-center justify-between gap-3"><p className="font-semibold">{handle}</p><b className="font-mono text-lg text-[color:var(--accent)]">{score}</b></div>
                    <p className="mt-5 text-xs leading-5 text-muted-foreground">{reason}</p>
                  </div>
                ))}
              </div>
              <p className="mt-6 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">A real report explains why each peer is relevant, what evidence supports the comparison, and where collection limits apply.</p>
            </div>
          )}

          {tab === "Action plan" && (
            <div className="animate-page-in">
              <p className="alm-kicker">Ranked next actions</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {["Shift the format mix", "Tighten reply time", "Guide first visits"].map((move, index) => (
                  <div key={move} className="border-t-2 border-[color:var(--accent)] bg-muted/25 p-4">
                    <b className="font-mono text-xs text-[color:var(--accent)]">0{index + 1}</b>
                    <h3 className="mt-5 text-sm font-semibold">{move}</h3>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">A concrete owner, format, and measurement checkpoint replaces generic advice.</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 border-t border-border pt-5">
                <p className="alm-kicker text-muted-foreground">30-day checkpoints</p>
                <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
                  <li>✓ Format mix moved toward repeatable short-form and carousel series</li>
                  <li>✓ Reply time under 90 minutes on priority posts</li>
                  <li>✓ One same-tier partnership post with a defined audience handoff</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
