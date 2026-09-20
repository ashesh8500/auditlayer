"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, CircleDashed, Loader2, CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { useWorkspaceResources } from "@/components/workspace-resources";
import { Button } from "@/components/ui/button";
import { projectCustomerStatus, CUSTOMER_PHASE_LABELS } from "@/lib/intelligence/client-status";
import { progressStepState } from "@/lib/intelligence/progress-step-state";
import type { CustomerAuditPhase, CustomerAuditTerminal } from "@/lib/intelligence/types";
import type { AuditStatus } from "@/lib/domain";

// ---- Types ----

interface WaitStateProps {
  auditId: string;
  internalStatus: AuditStatus;
  startedAt: string | null;
}

interface ProgressPayload {
  phase: CustomerAuditPhase;
  terminal: CustomerAuditTerminal | null;
  message: string | null;
  startedAt: string | null;
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

export function CustomerWaitState(props: WaitStateProps) {
  return <WaitState key={`${props.auditId}:${props.internalStatus}`} {...props} />;
}

function WaitState({ auditId, internalStatus, startedAt }: WaitStateProps) {
  const router = useRouter();
  const resources = useWorkspaceResources();
  const invalidateRef = useRef(resources?.invalidate);
  useEffect(() => { invalidateRef.current = resources?.invalidate; }, [resources?.invalidate]);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [checkVersion, setCheckVersion] = useState(0);
  const [checking, setChecking] = useState(false);
  const [observationError, setObservationError] = useState<number | null>(null);
  const refreshRef = useRef(router.refresh);
  useEffect(() => { refreshRef.current = router.refresh; }, [router.refresh]);
  const readyRef = useRef<string | null>(null);

  const customerStatus = progress
    ? {
        phase: progress.phase,
        terminal: progress.terminal,
        message:
          progress.message ||
          projectCustomerStatus(
            (progress.terminal as AuditStatus) || internalStatus,
            [],
            progress.startedAt ?? startedAt,
          ).message,
        startedAt: progress.startedAt ?? startedAt,
        estimatedCompletion: null,
      }
    : projectCustomerStatus(internalStatus, [], startedAt);
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
  const stepStates = progressStepState(
    effectivePhase,
    customerStatus.terminal,
  );

  useEffect(() => {
    if (projectCustomerStatus(internalStatus, [], startedAt).terminal && checkVersion === 0) return;
    let disposed = false;
    let stopped = false;
    let attempts = 0;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const visible = () => !document.hidden && navigator.onLine;
    const pause = () => {
      clearTimeout(timer);
      controller?.abort();
      controller = undefined;
    };
    const poll = async () => {
      if (disposed || stopped || !visible() || controller) return;
      const request = new AbortController();
      controller = request;
      setChecking(true);
      try {
        const res = await fetch(`/api/audits/${auditId}/progress`, { cache: "no-store", signal: request.signal });
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          if (!disposed && !request.signal.aborted) setObservationError(res.status);
          stopped = true; return;
        }
        if (!res.ok) throw new Error("Progress unavailable");
        const body = (await res.json()) as ProgressPayload;
        if (disposed || request.signal.aborted) return;
        setObservationError(null);
        failures = 0;
        attempts++;
        setProgress(body);
        if (body.terminal) stopped = true;
        if (body.terminal === "ready" && readyRef.current !== auditId) {
          readyRef.current = auditId;
          void invalidateRef.current?.("reports");
          refreshRef.current();
        }
      } catch {
        if (!disposed && !request.signal.aborted) { failures++; setObservationError(503); }
      } finally {
        if (!disposed) setChecking(false);
        if (controller === request) controller = undefined;
        if (!disposed && !stopped && !request.signal.aborted && visible()) {
          timer = setTimeout(poll, Math.min(60000, 8000 * 2 ** Math.min(failures, 3)) * (failures ? 1 : attempts > 30 ? 2 : 1));
        }
      }
    };
    const resume = () => {
      pause();
      // Delay resumes too: rapid visibility toggles must not create a request storm.
      if (visible() && !stopped) timer = setTimeout(poll, 8000);
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    void poll();
    return () => {
      disposed = true; pause();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
    };
  }, [auditId, internalStatus, startedAt, checkVersion]);

  return (
    <div className="space-y-8" role="status" aria-live="polite" aria-label="Audit progress">
      {/* Phase stepper — three state, not eleven */}
      <nav aria-label="Audit phases" className="mx-auto max-w-lg">
        <ol className="flex items-center justify-between gap-2">
          {PHASE_ORDER.map((phase, i) => {
            const visualState = stepStates[i];
            const isCompleted = visualState === "complete";
            const isCurrent = visualState === "current";
            const isStopped = visualState === "stopped";
            const isDelayed = effectivePhase === "delayed" && isCurrent;

            return (
              <li key={phase} className="relative flex flex-1 flex-col items-center gap-2">
                <span
                  className={`relative z-10 grid size-10 place-items-center rounded-full border-2 transition-all duration-500 ${
                    isCompleted
                      ? "border-[color:var(--green)] bg-[color:var(--green)] text-white"
                      : isStopped
                        ? customerStatus.terminal === "needs_review"
                          ? "border-[color:var(--amber)] bg-[color:var(--amber-muted)] text-[color:var(--amber)]"
                          : "border-[color:var(--red)] bg-[color:var(--red-muted)] text-[color:var(--red)]"
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
                  ) : isStopped ? (
                    <CircleDashed className="size-5" />
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
                      : isCurrent || isDelayed || isStopped
                        ? "text-foreground"
                        : "text-muted-foreground"
                  }`}
                >
                  {CUSTOMER_PHASE_LABELS[phase]}
                </span>
                {i < PHASE_ORDER.length - 1 && (
                  <div
                    className={`absolute left-[calc(50%+1.25rem)] top-5 hidden h-0.5 w-[calc(100%-2.5rem)] sm:block ${
                      isCompleted
                        ? "bg-[color:var(--green)]/30"
                        : "bg-border/40"
                    }`}
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
              This audit has not reported completion within the expected window.
              Check again for the latest recorded status.
            </p>
            <p className="text-xs text-muted-foreground">
              Checking status does not restart generation or bypass review.
            </p>
          </div>
        ) : customerStatus.terminal ? (
          <TerminalState
            terminal={customerStatus.terminal}
            auditId={auditId}
            phase={effectivePhase}
          />
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
              This page checks for recorded progress while it is open and online.
              You can return from Reports to check later.
            </p>
          </div>
        )}
      </div>

      {(observationError || delayedHard || (isTerminal && customerStatus.terminal !== "ready")) && (
        <section className="mx-auto max-w-md space-y-3 text-center" aria-label="Progress recovery">
          {observationError && <p role="alert" className="text-sm text-muted-foreground">
            {observationError === 401 ? "Your session could not be verified. Sign in again to check this report." : observationError === 403 || observationError === 404 ? "This report is unavailable to this account. Check your access or return to Reports." : "Progress could not be loaded. You can check again."}
          </p>}
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="outline" disabled={checking} onClick={() => setCheckVersion(v => v + 1)}>{checking ? "Checking…" : "Check again"}</Button>
            {observationError === 401 && <Button asChild variant="outline"><Link href={`/login?error=session&next=${encodeURIComponent(`/audits/${auditId}`)}`}>Sign in again</Link></Button>}
            <Button asChild variant="outline"><Link href="/dashboard">Back to Reports</Link></Button>
          </div>
          <p className="text-xs text-muted-foreground">Checking only reads status; it does not restart or approve an audit.</p>
        </section>
      )}

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
  phase,
}: {
  terminal: CustomerAuditTerminal;
  auditId: string;
  phase: CustomerAuditPhase;
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
            Generation is marked complete. Open the report to review its findings and evidence limits.
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
            Generation reported a failure. Check again after a retry has been arranged,
            or return to Reports. Checking status does not start another paid run.
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
            {phase === "preparing"
              ? "This audit needs founder review before it can run. Check again after review."
              : "Generation stopped before the report could be finalized. Check again after the issue has been resolved."}
          </p>
        </div>
      );
    case "needs_review":
      return (
        <div className="space-y-4 rounded-[var(--radius)] border border-[color:var(--amber)]/30 bg-[color:var(--amber-muted)] px-6 py-8">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-[color:var(--amber)]/10">
            <CircleDashed className="size-6 text-[color:var(--amber)]" />
          </div>
          <h2 className="text-lg font-semibold">Awaiting founder review</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            This audit is waiting for founder review. Check again after review to see
            whether it has been approved to continue.
          </p>
        </div>
      );
    default:
      return null;
  }
}
