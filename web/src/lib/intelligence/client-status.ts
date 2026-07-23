/**
 * Customer-safe audit status projection.
 *
 * Maps internal worker phases and audit statuses to the 3-phase customer
 * view: Preparing → Analyzing → Finalizing. Internal events, actor names,
 * cache hits, retries, heartbeats, and raw diagnostics are NEVER exposed.
 */

import type {
  CustomerAuditPhase,
  CustomerAuditTerminal,
  CustomerAuditStatus,
} from "./types";
import type { AuditStatus } from "../domain";

/** Phases considered "active" (not terminal) */
const ACTIVE: AuditStatus[] = ["queued", "running"];

/** Terminal statuses that stop animation */
const TERMINAL: AuditStatus[] = ["ready", "failed", "blocked", "needs_review"];

type InternalEvent = {
  phase: string | null;
  event_type: string;
  detail: string | null;
  created_at: string;
};

/**
 * Project internal audit status + events into the customer-safe three-phase
 * view. Never exposes internal event types, actors, cache hits, retries,
 * heartbeats, worker names, or tracebacks.
 */
export function projectCustomerStatus(
  internalStatus: AuditStatus,
  events: InternalEvent[],
  startedAt: string | null,
  staleThresholdMs: number = 10 * 60 * 1000, // 10 min
): CustomerAuditStatus {
  // Terminal first — always stops animation immediately
  if (TERMINAL.includes(internalStatus)) {
    const terminal = internalStatus as CustomerAuditTerminal;
    return {
      phase: "finalizing",
      terminal,
      message: TERMINAL_MESSAGES[terminal] ?? "Your audit is ready.",
      startedAt,
      estimatedCompletion: null,
    };
  }

  // Delayed: active but no progress within threshold
  if (ACTIVE.includes(internalStatus) && startedAt) {
    const elapsed = Date.now() - new Date(startedAt).getTime();
    if (elapsed > staleThresholdMs) {
      return {
        phase: "delayed",
        terminal: null,
        message:
          "Your audit is taking longer than expected. This can happen during high load. We'll notify you when it's ready — no action needed.",
        startedAt,
        estimatedCompletion: null,
      };
    }
  }

  // Active — map to one of three customer phases based on event progression
  const phase = deriveCustomerPhase(events);

  return {
    phase,
    terminal: null,
    message: PHASE_MESSAGES[phase],
    startedAt,
    estimatedCompletion: null,
  };
}

function deriveCustomerPhase(events: InternalEvent[]): CustomerAuditPhase {
  const eventTypes = new Set(events.map((e) => e.event_type));

  // Any composition/upload/scoring events → finalizing
  if (
    eventTypes.has("composing_started") ||
    eventTypes.has("scoring_complete") ||
    eventTypes.has("report_uploaded") ||
    eventTypes.has("audit_succeeded")
  ) {
    return "finalizing";
  }

  // Research/metrics/peer events → analyzing
  if (
    eventTypes.has("research_started") ||
    eventTypes.has("metrics_collected") ||
    eventTypes.has("peers_identified") ||
    eventTypes.has("analysis_running") ||
    eventTypes.has("research_cached")
  ) {
    return "analyzing";
  }

  // Default: still preparing
  return "preparing";
}

const PHASE_MESSAGES: Record<CustomerAuditPhase, string> = {
  preparing: "Preparing your evidence run.",
  analyzing:
    "Checking current signals and comparing them with your previous state.",
  finalizing: "Verifying evidence links and assembling your report.",
  delayed:
    "Your audit is taking longer than expected. This can happen during high load. We'll notify you when it's ready — no action needed.",
};

const TERMINAL_MESSAGES: Record<CustomerAuditTerminal, string> = {
  ready: "Your report is ready.",
  failed:
    "Something went wrong during generation. A founder has been notified and will look into it.",
  blocked:
    "This audit needs a founder review before it can run. We'll reach out if anything is needed.",
  needs_review:
    "We couldn't detect which platform this handle belongs to. A founder will confirm the platform, then generation starts.",
};

/**
 * Returns true if the customer status is in a terminal state.
 */
export function isTerminal(status: CustomerAuditStatus): boolean {
  return status.terminal !== null;
}

/**
 * Returns true if the job appears stale (active but no recent progress).
 */
export function isStale(
  status: CustomerAuditStatus,
  allowedLifetimeMs: number = 15 * 60 * 1000,
): boolean {
  if (isTerminal(status)) return false;
  if (!status.startedAt) return false;
  return Date.now() - new Date(status.startedAt).getTime() > allowedLifetimeMs;
}

/**
 * Customer-safe phase labels for display.
 */
export const CUSTOMER_PHASE_LABELS: Record<CustomerAuditPhase, string> = {
  preparing: "Preparing",
  analyzing: "Analyzing",
  finalizing: "Finalizing",
  delayed: "Delayed",
};
