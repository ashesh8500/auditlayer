"use client";

import { useRef, useState } from "react";

const SCORE_ROWS = [
  ["Content strategy", 32],
  ["Engagement depth", 55],
  ["Brand cohesion", 68],
  ["Conversion path", 22],
  ["Format discipline", 44],
  ["Audience trust", 61],
] as const;

const SECTIONS = [
  { id: "diagnosis", label: "Diagnosis" },
  { id: "benchmark", label: "Benchmark" },
  { id: "action-plan", label: "Action plan" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function SampleReportPreview({ full = false }: { full?: boolean }) {
  const [activeSection, setActiveSection] = useState<SectionId>("diagnosis");
  const readerRef = useRef<HTMLDivElement>(null);
  const diagnosisRef = useRef<HTMLElement>(null);
  const benchmarkRef = useRef<HTMLElement>(null);
  const actionPlanRef = useRef<HTMLElement>(null);
  const sectionRefs = {
    diagnosis: diagnosisRef,
    benchmark: benchmarkRef,
    "action-plan": actionPlanRef,
  };

  function scrollToSection(sectionId: SectionId) {
    const target = sectionRefs[sectionId].current;
    if (!target) return;

    setActiveSection(sectionId);
    if (full) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    readerRef.current?.scrollTo({
      top: target.offsetTop,
      behavior: "smooth",
    });
  }

  function updateActiveSection() {
    const reader = readerRef.current;
    if (!reader || full) return;

    if (reader.scrollTop + reader.clientHeight >= reader.scrollHeight - 4) {
      setActiveSection("action-plan");
      return;
    }

    const readingLine = reader.scrollTop + reader.clientHeight * 0.38;
    let nextSection: SectionId = "diagnosis";

    for (const section of SECTIONS) {
      const element = sectionRefs[section.id].current;
      if (element && element.offsetTop <= readingLine) nextSection = section.id;
    }

    setActiveSection(nextSection);
  }

  const activeIndex = SECTIONS.findIndex((section) => section.id === activeSection);

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

        <nav className="grid grid-cols-3 border-b border-border bg-muted/40 p-1" aria-label="Jump to sample report section">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              aria-current={activeSection === section.id ? "true" : undefined}
              onClick={() => scrollToSection(section.id)}
              className={`alm-focus min-h-10 px-2 text-xs font-semibold transition-colors sm:text-sm ${activeSection === section.id ? "bg-card text-foreground shadow-[var(--shadow)]" : "text-muted-foreground hover:text-foreground"}`}
            >
              {section.label}
            </button>
          ))}
        </nav>

        <div
          ref={readerRef}
          onScroll={updateActiveSection}
          tabIndex={full ? undefined : 0}
          aria-label={full ? "Fictional sample report" : "Scrollable fictional sample report"}
          className={`relative scroll-smooth bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--ring)] ${full ? "" : "max-h-[28rem] overflow-y-auto [scrollbar-color:var(--accent)_var(--muted)] [scrollbar-width:thin]"}`}
        >
          <section ref={diagnosisRef} className="scroll-mt-24 border-b border-border p-5 sm:p-7" aria-labelledby="sample-diagnosis-title">
            <p className="alm-kicker">Section 01 · Diagnosis</p>
            <h3 id="sample-diagnosis-title" className="mt-2 text-xl font-semibold tracking-[-0.02em]">Where the account stands.</h3>
            <div className="mt-5">
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
          </section>

          <section ref={benchmarkRef} className="scroll-mt-24 border-b border-border p-5 sm:p-7" aria-labelledby="sample-benchmark-title">
            <p className="alm-kicker">Section 02 · Same-tier context</p>
            <h3 id="sample-benchmark-title" className="mt-2 text-xl font-semibold tracking-[-0.02em]">The gap is distribution discipline.</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Comparable fictional accounts are not winning through a different niche. They repeat recognisable formats and guide first-time profile visitors more deliberately.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[["@peakmethod", "72", "Repeatable series"], ["@formdaily", "61", "Faster replies"], ["@buildclub", "53", "Clearer profile path"]].map(([handle, score, reason]) => (
                <div key={handle} data-testid="benchmark-peer-card" className="min-w-0 border border-border bg-muted/30 p-4">
                  <b className="block font-mono text-2xl leading-none text-[color:var(--accent)]">{score}</b>
                  <p data-testid="benchmark-peer-handle" className="mt-4 break-words text-sm font-semibold leading-5">{handle}</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{reason}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">A real report explains why each peer is relevant, what evidence supports the comparison, and where collection limits apply.</p>
          </section>

          <section ref={actionPlanRef} className="scroll-mt-24 p-5 sm:p-7" aria-labelledby="sample-action-title">
            <p className="alm-kicker">Section 03 · Ranked next actions</p>
            <h3 id="sample-action-title" className="mt-2 text-xl font-semibold tracking-[-0.02em]">What to do next.</h3>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {["Shift the format mix", "Tighten reply time", "Guide first visits"].map((move, index) => (
                <div key={move} className="border-t-2 border-[color:var(--accent)] bg-muted/25 p-4">
                  <b className="font-mono text-xs text-[color:var(--accent)]">0{index + 1}</b>
                  <h4 className="mt-5 text-sm font-semibold">{move}</h4>
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
          </section>
        </div>

        {!full && (
          <div className="flex items-center justify-between border-t border-border bg-muted/35 px-5 py-3 font-mono text-[0.68rem] uppercase tracking-[0.08em] text-muted-foreground">
            <span>Scroll through the sample</span>
            <span>Section {activeIndex + 1} / {SECTIONS.length} ↓</span>
          </div>
        )}
      </div>
    </div>
  );
}
