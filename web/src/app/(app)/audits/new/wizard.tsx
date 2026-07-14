"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { 
  ArrowLeft, ArrowRight, Info, Loader2, Sparkles, Check, 
  Search, CheckCircle2, Zap, FileText, BookOpen, Building2, Compass 
} from "lucide-react";

const InstagramIcon = (props: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={props.className}
  >
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const YoutubeIcon = (props: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={props.className}
  >
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.6.46A2.78 2.78 0 0 0 1.46 6.42a29 29 0 0 0-.46 5.33a29 29 0 0 0 .46 5.33a2.78 2.78 0 0 0 1.94 2C4.72 19.6 11.6 19.6 11.6 19.6s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2a29 29 0 0 0 .46-5.25a29 29 0 0 0-.46-5.33z" />
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="currentColor" />
  </svg>
);

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  GOALS,
  PLATFORM_LABELS,
  intakeHints,
  REPORT_TYPE_LABELS,
  type Goal,
  type ReportType,
} from "@/lib/domain";
import { createAudit, type CreateAuditState } from "@/lib/actions/audits";

const REPORT_TYPE_ICONS: Record<ReportType, any> = {
  pulse: Zap,
  standard: FileText,
  extended: BookOpen,
  enterprise: Building2,
  blueprint: Compass,
};

const PLATFORM_ICONS: Record<string, any> = {
  instagram: InstagramIcon,
  tiktok: () => (
    <svg className="size-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.17-2.89-.6-4.09-1.51l-.09-.08v7.44c.01 4.54-3.56 8.16-8.1 8.16-3.88 0-7.3-2.73-8.1-6.52-.96-4.51 2.3-8.8 6.81-9.76.62-.13 1.25-.2 1.88-.2 1.34-.01 2.68.01 4.02-.03.01.21.01.42.01.62-.02 1.2-.01 2.4-.02 3.6-1.15.11-2.34-.23-3.23-.97-.99-.81-1.49-2.09-1.34-3.34.09-1.28.79-2.45 1.86-3.11.95-.59 2.1-.79 3.2-.62.59.09 1.16.32 1.63.69-.02.16-.03.32-.05.48h.04z" />
    </svg>
  ),
  youtube: YoutubeIcon,
  x: () => <span className="font-bold font-sans text-[11px] shrink-0">𝕏</span>,
  linkedin: () => <span className="font-bold font-sans text-[11px] shrink-0">In</span>,
  unknown: Search,
};

const initialState: CreateAuditState = { status: "idle" };

export function IntakeWizard({ reportTypes }: { reportTypes: ReportType[] }) {
  const [step, setStep] = useState(0);
  const [handle, setHandle] = useState("");
  const [goal, setGoal] = useState<Goal | "">("");
  const [reportType, setReportType] = useState<ReportType>(
    reportTypes.includes("standard") ? "standard" : reportTypes[0] ?? "pulse"
  );
  const [context, setContext] = useState("");
  const [state, action, pending] = useActionState(createAudit, initialState);

  const hints = useMemo(() => intakeHints(handle, context), [handle, context]);
  const canContinueHandle = hints.normalizedHandle.length >= 2;
  const canSubmit = goal !== "";

  const availableTypes = reportTypes;

  const IconComponent = PLATFORM_ICONS[hints.platform] || Search;

  return (
    <form action={action} className="mx-auto max-w-2xl space-y-8">
      <input type="hidden" name="handle" value={handle} />
      <input type="hidden" name="goal" value={goal} />
      <input type="hidden" name="report_type" value={reportType} />
      <input type="hidden" name="context" value={context} />

      <Stepper step={step} />

      {step === 0 && (
        <section className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight">
              Whose account are we auditing?
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Enter a handle or profile URL. We will identify the platform before submission.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="handle-input" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Handle or profile URL
            </Label>
            <div className="relative">
              <span className="absolute inset-y-0 left-3.5 flex items-center text-muted-foreground">
                <IconComponent className="size-4 shrink-0 transition-all text-[color:var(--accent)]" />
              </span>
              <Input
                id="handle-input"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="@drjanesmith or instagram.com/drjanesmith"
                className="pl-10 h-12 text-sm font-mono"
                autoFocus
              />
            </div>
          </div>

          {hints.normalizedHandle && (
            <div className="border border-border bg-[var(--panel)] p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <div className="flex items-center gap-1.5 font-mono text-sm font-semibold">
                  <span className="text-[color:var(--accent)]">@</span>
                  <span>{hints.normalizedHandle}</span>
                </div>
                <Badge tone={hints.platform === "unknown" ? "warning" : "accent"}>
                  {PLATFORM_LABELS[hints.platform]}
                </Badge>
              </div>
              {hints.notes.length > 0 && (
                <ul className="space-y-2">
                  {hints.notes.map((note) => (
                    <li
                      key={note}
                      className="flex gap-2 text-xs text-muted-foreground leading-relaxed"
                    >
                      <Info className="mt-0.5 size-3.5 shrink-0 text-[color:var(--blue)]" />
                      {note}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={() => setStep(1)}
              disabled={!canContinueHandle}
              className="h-11 px-5 font-semibold"
            >
              Continue
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight">What is the strategic goal?</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This calibrates our competitive benchmarks and tactical recommendations.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {GOALS.map((g) => {
              const isSelected = goal === g.value;
              return (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => setGoal(g.value)}
                  className={`relative border p-5 text-left transition-all hover:border-[color:var(--accent)]/50 alm-focus ${
                    isSelected
                      ? "border-[color:var(--accent)] bg-[color:var(--accent-muted)] shadow-sm"
                      : "border-border bg-card"
                  }`}
                >
                  <h3 className="text-sm font-bold flex items-center justify-between">
                    {g.label}
                    {isSelected && <CheckCircle2 className="size-4 text-[color:var(--accent)]" />}
                  </h3>
                  <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{g.blurb}</p>
                </button>
              );
            })}
          </div>

          {goal && (
            <div className="space-y-3 border border-border bg-card p-5 animate-in fade-in duration-200">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Report type
              </p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {availableTypes.map((rt) => {
                  const Icon = REPORT_TYPE_ICONS[rt];
                  const isSelected = reportType === rt;
                  return (
                    <button
                      key={rt}
                      type="button"
                      onClick={() => setReportType(rt)}
                      className={`flex items-center gap-3 border p-3 text-left text-sm transition-all alm-focus ${
                        isSelected
                          ? "border-[color:var(--accent)] bg-[color:var(--accent-muted)] shadow-sm"
                          : "border-border hover:border-[color:var(--accent)]/30 bg-white"
                      }`}
                    >
                      <Icon className="size-4 shrink-0 text-[color:var(--accent)]" />
                      <div>
                        <div className="font-semibold">{REPORT_TYPE_LABELS[rt]}</div>
                      </div>
                      {isSelected && <CheckCircle2 className="size-3.5 ml-auto text-[color:var(--accent)]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button type="button" variant="ghost" onClick={() => { setStep(0); setGoal(""); }} className="font-semibold h-11">
              <ArrowLeft className="size-4" />
              Back
            </Button>
            <Button type="button" onClick={() => setStep(2)} disabled={!canSubmit} className="h-11 px-5 font-semibold">
              Continue
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight">
              Anything we should know?{" "}
              <span className="text-sm font-normal text-muted-foreground">
                (optional)
              </span>
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Add known competitors, current offers, or a launch date when they matter to the strategy.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="context-input" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Context & Objectives</Label>
            <Textarea
              id="context-input"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={5}
              placeholder="e.g., Clinical longevity practitioner based in Austin. Competing with @hubermanlab. Launching a supplement line next month..."
              className="border border-border shadow-sm p-4 text-sm resize-none focus-visible:ring-1 focus-visible:ring-[color:var(--accent)]"
            />
          </div>

          {hints.notes.length > 0 && (
            <ul className="space-y-2 rounded-xl bg-neutral-50/80 p-4 border border-border text-[11px] leading-relaxed text-muted-foreground">
              {hints.notes.map((note) => (
                <li
                  key={note}
                  className="flex gap-2"
                >
                  <Info className="mt-0.5 size-3.5 shrink-0 text-[color:var(--blue)]" />
                  {note}
                </li>
              ))}
            </ul>
          )}

          {state.status === "error" && (
            <div className="rounded-xl border border-[color:var(--red)]/30 bg-[color:var(--red-muted)] px-4 py-3 text-xs leading-relaxed text-[color:var(--red)]">
              {state.message}
              {state.limitReached && (
                <Link
                  href="/dashboard"
                  className="ml-1 font-semibold underline underline-offset-2"
                >
                  View plans
                </Link>
              )}
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button type="button" variant="ghost" onClick={() => setStep(1)} className="font-semibold h-11">
              <ArrowLeft className="size-4" />
              Back
            </Button>
            <Button type="submit" disabled={pending} className="font-semibold h-11 px-5">
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Queueing audit...
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  Generate Audit
                </>
              )}
            </Button>
          </div>
        </section>
      )}
    </form>
  );
}

function Stepper({ step }: { step: number }) {
  const labels = ["Handle", "Strategy", "Context"];
  return (
    <ol aria-label="Audit setup progress" className="mx-auto flex items-center gap-2 border-y border-border bg-card px-2 py-3.5 sm:gap-4 sm:px-4">
      {labels.map((label, i) => {
        const isCompleted = i < step;
        const isActive = i === step;
        return (
          <li key={label} className="flex flex-1 items-center gap-2.5">
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold transition-all duration-300 ${
                isCompleted
                  ? "bg-[color:var(--green)] text-white"
                  : isActive
                  ? "bg-[color:var(--accent)] text-white shadow-sm ring-2 ring-[color:var(--accent)]/15"
                  : "bg-white border border-border text-muted-foreground"
              }`}
            >
              {isCompleted ? <Check className="size-3.5 stroke-[3]" /> : i + 1}
            </span>
            <span
              className={`text-xs ${
                isActive 
                  ? "font-bold text-foreground" 
                  : isCompleted 
                  ? "font-semibold text-muted-foreground" 
                  : "text-muted-foreground/80 font-medium"
              }`}
            >
              {label}
            </span>
            {i < labels.length - 1 && (
              <span className="h-px flex-1 bg-border/60" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
