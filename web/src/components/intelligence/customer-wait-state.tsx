"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Loader2, CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { projectCustomerStatus, CUSTOMER_PHASE_LABELS } from "@/lib/intelligence/client-status";
import type { CustomerAuditPhase, CustomerAuditTerminal } from "@/lib/intelligence/types";
import type { AuditStatus } from "@/lib/domain";

// ---- Types ----

interface WaitStateProps {
  auditId: string;
  internalStatus: AuditStatus;
  startedAt: string | null;
}

interface InternalAuditEvent {
  id: string;
  phase: string | null;
  event_type: string;
  detail: string | null;
  created_at: string;
}

// ---- Phase icon and animation ----

const PHASE_ICON: Record<CustomerAuditPhase, React.ReactNode> = {
  preparing: <Loader2 className="size-5 animate-spin" />,
  analyzing: <Loader2 className="size-5 animate-spin" />,
  finalizing: <Loader2 className="size-5 animate-spin" />,
  delayed: <Loader2 className="size-5" />,
};

const PHASE_ORDER: CustomerAuditPhase[] = ["preparing", "analyzing", "finalizing"];

const DELAYED_TERMINAL_THRESHOLD_MS = 20 * 60 * 1000; // 20 min → terminal delayed

// ---- Component ----

export function CustomerWaitState({ auditId, internalStatus, startedAt }: WaitStateProps) {
  const router = useRouter();
  const [events, setEvents] = useState<InternalAuditEvent[]>([]);
  const [pollCount, setPollCount] = useState(0);
  const pollRef = useRef(false);

  const customerStatus = projectCustomerStatus(internalStatus, events, startedAt);
  const isTerminal = customerStatus.terminal !== null;

  // Compute delayed state in a stable way (Date.now is impure during render)
  const [now, setNow] = useState(Date.now);
  const delayedHard = useMemo(() => {
    if (customerStatus.terminal) return false;
    if (!startedAt) return false;
    return now - new Date(startedAt).getTime() > DELAYED_TERMINAL_THRESHOLD_MS;
  }, [customerStatus.terminal, startedAt, now]);

  // Update 'now' periodically for delayed check
  useEffect(() => {
    if (isTerminal) return;
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, [isTerminal]);

  const effectivePhase: CustomerAuditPhase = delayedHard
    ? "delayed"
    : customerStatus.phase;

  const isUpdating = !isTerminal;

  const poll = useCallback(async () => {
    if (pollRef.current) return;
    pollRef.current = true;
    try {
      const res = await fetch(`/api/audits/${auditId}/live`, { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as {
        status: AuditStatus;
        events: InternalAuditEvent[];
      };
      setEvents(body.events ?? []);
      setPollCount((c) => c + 1);
      if (body.status === "ready") {
        router.refresh();
      }
    } finally {
      pollRef.current = false;
    }
  }, [auditId, router]);

  useEffect(() => {
    if (isTerminal) return;
    void poll();
    const interval = setInterval(() => void poll(), 8000);
    return () => clearInterval(interval);
  }, [isTerminal, poll, pollCount]); // restart on terminal change

  return (
    <div className="space-y-8" role="status" aria-live="polite" aria-label="Audit progress">
      {/* Phase stepper — three state, not eleven */}
      <nav aria-label="Audit phases" className="mx-auto max-w-lg">
        <ol className="flex items-center justify-between gap-2">
          {PHASE_ORDER.map((phase, i) => {
            const phaseIndex = PHASE_ORDER.indexOf(effectivePhase);
            const isCompleted = i < phaseIndex || isTerminal;
            const isCurrent = i === phaseIndex && !isTerminal;
            const isDelayed = effectivePhase === "delayed" && i === phaseIndex;

            return (
              <li key={phase} className="flex flex-1 flex-col items-center gap-2">
                <span
                  className={`grid size-10 place-items-center rounded-full border-2 transition-all duration-500 ${
                    isCompleted
                      ? "border-[color:var(--green)] bg-[color:var(--green)] text-white"
                      : isDelayed
                        ? "border-[color:var(--amber)] bg-[color:var(--amber-muted)] text-[color:var(--amber)]"
                        : isCurrent
                          ? "border-[color:var(--accent)] bg-[color:var(--accent-muted)] text-[color:var(--accent)]"
                          : "border-border bg-card text-muted-foreground"
                  }`}
                  aria-hidden="true"
                >
                  {isCompleted ? (
                    <CheckCircle2 className="size-5" />
                  ) : isCurrent || isDelayed ? (
                    <Loader2 className={`size-5 ${isDelayed ? "" : "animate-spin"}`} />
                  ) : (
                    <span className="text-xs font-semibold tabular-nums">{i + 1}</span>
                  )}
                </span>
                <span
                  className={`text-xs font-medium ${
                    isCompleted
                      ? "text-[color:var(--green)]"
                      : isCurrent || isDelayed
                        ? "text-foreground"
                        : "text-muted-foreground"
                  }`}
                >
                  {CUSTOMER_PHASE_LABELS[phase]}
                </span>
                {i < PHASE_ORDER.length - 1 && (
                  <div
                    className={`absolute left-[calc(50%+2.5rem)] hidden h-0.5 w-[calc(100%-5rem)] sm:block ${
                      isCompleted
                        ? "bg-[color:var(--green)]/30"
                        : isCurrent
                          ? "bg-border"
                          : "bg-border/40"
                    }`}
                    style={{ marginTop: "1.25rem" }}
                    aria-hidden="true"
                  />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Central message */}
      <div className="mx-auto max-w-md text-center">
        {delayedHard ? (
          <div className="space-y-4 rounded-[var(--radius)] border border-[color:var(--amber)]/30 bg-[color:var(--amber-muted)] px-6 py-8">
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-[color:var(--amber)]/10">
              <Loader2 className="size-6 text-[color:var(--amber)]" />
            </div>
            <h2 className="text-lg font-semibold">Taking longer than expected</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Your audit is still running but hasn&apos;t completed within the expected window.
              A founder has been notified. You can leave this page — we&apos;ll email you when
              it&apos;s ready.
            </p>
            <p className="text-xs text-muted-foreground">
              No action is needed from you. The worker will keep processing.
            </p>
          </div>
        ) : customerStatus.terminal ? (
          <TerminalState terminal={customerStatus.terminal} auditId={auditId} />
        ) : (
          <div className="space-y-4 rounded-[var(--radius)] border border-border bg-card px-6 py-8 shadow-[var(--shadow)]">
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-[color:var(--accent-muted)]">
              {PHASE_ICON[effectivePhase]}
            </div>
            <h2 className="text-lg font-semibold">
              {CUSTOMER_PHASE_LABELS[effectivePhase]}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {customerStatus.message}
            </p>
            <p className="text-xs text-muted-foreground">
              Most audits complete within 2–5 minutes. You can leave this page —
              we&apos;ll email you when it&apos;s done.
            </p>
          </div>
        )}
      </div>

      {/* Terminal: show CTA to view report */}
      {customerStatus.terminal === "ready" && (
        <div className="mx-auto max-w-sm text-center">
          <Link href={`/audits/${auditId}/read`}>
            <Button size="lg" className="w-full font-semibold">
              <BookOpen className="size-4" />
              Read full report
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function TerminalState({
  terminal,
}: {
  terminal: CustomerAuditTerminal;
  auditId: string;
}) {
  switch (terminal) {
    case "ready":
      return (
        <div className="space-y-4 rounded-[var(--radius)] border border-[color:var(--green)]/30 bg-[color:var(--green-muted)] px-6 py-8">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-[color:var(--green)]/10">
            <CheckCircle2 className="size-6 text-[color:var(--green)]" />
          </div>
          <h2 className="text-lg font-semibold">Report ready</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your report has been generated and verified. All evidence links are intact
            and the scores have been computed.
          </p>
        </div>
      );
    case "failed":
      return (
        <div className="space-y-4 rounded-[var(--radius)] border border-[color:var(--red)]/30 bg-[color:var(--red-muted)] px-6 py-8">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-[color:var(--red)]/10">
            <span className="text-2xl font-bold text-[color:var(--red)]" aria-hidden="true">!</span>
          </div>
          <h2 className="text-lg font-semibold">Generation failed</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Something went wrong during generation. A founder has been notified and
            will look into it. You don&apos;t need to take any action.
          </p>
        </div>
      );
    case "blocked":
      return (
        <div className="space-y-4 rounded-[var(--radius)] border border-[color:var(--red)]/30 bg-[color:var(--red-muted)] px-6 py-8">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-[color:var(--red)]/10">
            <span className="text-2xl font-bold text-[color:var(--red)]" aria-hidden="true">!</span>
          </div>
          <h2 className="text-lg font-semibold">Audit blocked</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            This audit needs a founder review before it can run. We&apos;ll reach out
            if anything is needed.
          </p>
        </div>
      );
    case "needs_review":
      return (
        <div className="space-y-4 rounded-[var(--radius)] border border-[color:var(--amber)]/30 bg-[color:var(--amber-muted)] px-6 py-8">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-[color:var(--amber)]/10">
            <Loader2 className="size-6 text-[color:var(--amber)]" />
          </div>
          <h2 className="text-lg font-semibold">Awaiting founder review</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            We couldn&apos;t detect which platform this handle belongs to. A founder
            will confirm the platform, then generation starts.
          </p>
        </div>
      );
    default:
      return null;
  }
}
