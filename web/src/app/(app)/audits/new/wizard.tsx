"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Info, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  GOALS,
  PLATFORM_LABELS,
  intakeHints,
  type Goal,
} from "@/lib/domain";
import { createAudit, type CreateAuditState } from "@/lib/actions/audits";

const initialState: CreateAuditState = { status: "idle" };

export function IntakeWizard() {
  const [step, setStep] = useState(0);
  const [handle, setHandle] = useState("");
  const [goal, setGoal] = useState<Goal | "">("");
  const [context, setContext] = useState("");
  const [state, action, pending] = useActionState(createAudit, initialState);

  const hints = useMemo(() => intakeHints(handle, context), [handle, context]);
  const canContinueHandle = hints.normalizedHandle.length >= 2;

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="handle" value={handle} />
      <input type="hidden" name="goal" value={goal} />
      <input type="hidden" name="context" value={context} />

      <Stepper step={step} />

      {step === 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">
              Whose account are we auditing?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Paste a handle or profile URL — Instagram, TikTok, YouTube, X, or
              LinkedIn.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="handle-input">Handle or profile URL</Label>
            <Input
              id="handle-input"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@drjanesmith or instagram.com/drjanesmith"
              autoFocus
            />
          </div>

          {hints.normalizedHandle && (
            <div className="rounded-[var(--radius)] border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono">@{hints.normalizedHandle}</span>
                <Badge tone={hints.platform === "unknown" ? "warning" : "accent"}>
                  {PLATFORM_LABELS[hints.platform]}
                </Badge>
              </div>
              {hints.notes.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {hints.notes.map((note) => (
                    <li
                      key={note}
                      className="flex gap-2 text-xs text-muted-foreground"
                    >
                      <Info className="mt-0.5 size-3.5 shrink-0 text-[color:var(--blue)]" />
                      {note}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => setStep(1)}
              disabled={!canContinueHandle}
              className="font-medium"
            >
              Continue
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">What&apos;s the goal?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This calibrates the analysis and the recommendations.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {GOALS.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => {
                  setGoal(g.value);
                  setStep(2);
                }}
                className={`rounded-[var(--radius)] border p-4 text-left transition-colors hover:border-[color:var(--accent)]/50 ${
                  goal === g.value
                    ? "border-[color:var(--accent)] bg-[color:var(--accent-muted)]"
                    : "border-border bg-card"
                }`}
              >
                <h3 className="text-sm font-semibold">{g.label}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{g.blurb}</p>
              </button>
            ))}
          </div>
          <div className="flex justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep(0)}>
              <ArrowLeft className="size-4" />
              Back
            </Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">
              Anything we should know?{" "}
              <span className="text-sm font-normal text-muted-foreground">
                (optional)
              </span>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Niche, competitors, brand positioning, or goals that sharpen the
              read. The more specific, the better the calibration.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="context-input">Context</Label>
            <Textarea
              id="context-input"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={5}
              placeholder="CPG food brand, LA-based, competing with @brandx; or personal brand, fitness niche, launching a course…"
            />
          </div>

          {hints.notes.length > 0 && (
            <ul className="space-y-1.5">
              {hints.notes.map((note) => (
                <li
                  key={note}
                  className="flex gap-2 text-xs text-muted-foreground"
                >
                  <Info className="mt-0.5 size-3.5 shrink-0 text-[color:var(--blue)]" />
                  {note}
                </li>
              ))}
            </ul>
          )}

          {state.status === "error" && (
            <div className="rounded-[var(--radius)] border border-[color:var(--red)]/30 bg-[color:var(--red-muted)] px-4 py-3 text-sm text-[color:var(--red)]">
              {state.message}
              {state.limitReached && (
                <Link
                  href="/dashboard"
                  className="ml-1 font-medium underline underline-offset-2"
                >
                  View plans
                </Link>
              )}
            </div>
          )}

          <div className="flex justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft className="size-4" />
              Back
            </Button>
            <Button type="submit" disabled={pending} className="font-medium">
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Generate audit
            </Button>
          </div>
        </section>
      )}
    </form>
  );
}

function Stepper({ step }: { step: number }) {
  const labels = ["Handle", "Goal", "Context"];
  return (
    <ol className="flex items-center gap-2">
      {labels.map((label, i) => (
        <li key={label} className="flex flex-1 items-center gap-2">
          <span
            className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-medium ${
              i <= step
                ? "bg-[color:var(--accent)] text-white"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {i + 1}
          </span>
          <span
            className={`text-xs ${i <= step ? "font-medium" : "text-muted-foreground"}`}
          >
            {label}
          </span>
          {i < labels.length - 1 && (
            <span className="h-px flex-1 bg-border" />
          )}
        </li>
      ))}
    </ol>
  );
}
