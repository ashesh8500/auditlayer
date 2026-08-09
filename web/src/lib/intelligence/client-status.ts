/**
 * Customer-safe audit status projection.
 *
 * Maps internal worker phases and audit statuses to the 3-phase customer
 * view: Preparing → Analyzing → Finalizing, plus an honest Delayed state.
 * Internal events, actor names, cache hits, retries, heartbeats, and raw
 * diagnostics are NEVER exposed.
 *
 * Truthfulness contract (ALM-I-002):
 * - Staleness is measured from the newest MEANINGFUL customer-safe progress
 *   event, falling back to `startedAt`. Heartbeat, cache, and retry noise can
 *   never reset the clock or mask a genuinely delayed run.
 * - The projection is a pure function of (internalStatus, events, startedAt,
 *   nowMs): duplicate and out-of-order events produce identical output, and a
 *   serialized status hydrates losslessly for leave-and-return resume.
 * - Terminal states always win and internal details never leak.
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
 * Event types that represent genuine forward progress a customer may rely on
 * to reset the staleness clock. Heartbeat, cache, and retry events are
 * deliberately excluded: they are noise, not progress, and must never make a
 * stalled run look active.
 */
const MEANINGFUL_PROGRESS_EVENT_TYPES = new Set([
  "research_started",
  "metrics_collected",
  "peers_identified",
  "analysis_running",
  "composing_started",
  "scoring_complete",
  "report_uploaded",
  "audit_succeeded",
]);

export interface ProjectCustomerStatusOptions {
  /** Quiet window before an active run is shown as Delayed (ms). Default 10 min. */
  staleThresholdMs?: number;
  /** Injectable clock for deterministic projection. Defaults to Date.now(). */
  nowMs?: number;
}

/**
 * Project internal audit status + events into the customer-safe three-phase
 * view. Never exposes internal event types, actors, cache hits, retries,
 * heartbeats, worker names, or tracebacks.
 *
 * Delayed is decided from the newest meaningful progress event (falling back
 * to startedAt), so a recent meaningful event keeps a long-lived run honest
 * while heartbeat/cache/retry noise can never mask a genuine stall.
 */
export function projectCustomerStatus(
  internalStatus: AuditStatus,
  events: InternalEvent[],
  startedAt: string | null,
  options: ProjectCustomerStatusOptions = {},
): CustomerAuditStatus {
  const staleThresholdMs = options.staleThresholdMs ?? 10 * 60 * 1000;
  const nowMs = options.nowMs ?? Date.now();

  // Terminal first — always stops animation immediately
  if (TERMINAL.includes(internalStatus)) {
    const terminal = internalStatus as CustomerAuditTerminal;
    const phase =
      terminal === "ready"
        ? "finalizing"
        : terminal === "needs_review"
          ? "preparing"
          : deriveCustomerPhase(events);
    return {
      phase,
      terminal,
      message: terminalMessage(terminal, phase),
      startedAt,
      lastProgressAt: newestProgressAt(events, startedAt, nowMs),
      estimatedCompletion: null,
    };
  }

  // Delayed: active but no meaningful progress within threshold
  const referenceMs = newestProgressMs(events, startedAt, nowMs);
  if (ACTIVE.includes(internalStatus) && referenceMs !== null) {
    if (nowMs - referenceMs > staleThresholdMs) {
      return {
        phase: "delayed",
        terminal: null,
        message: DELAYED_MESSAGE,
        startedAt,
        lastProgressAt: isoOrNull(referenceMs),
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
    lastProgressAt: isoOrNull(referenceMs),
    estimatedCompletion: null,
  };
}

/**
 * Newest meaningful progress reference, in ms since epoch, or null when there
 * is neither a startedAt nor a meaningful progress event to judge staleness
 * from. Out-of-order and duplicate events are absorbed (max over timestamps);
 * future-dated events cannot create indefinite freshness (clamped to now).
 */
function newestProgressMs(
  events: InternalEvent[],
  startedAt: string | null,
  nowMs: number,
): number | null {
  let newest: number | null = null;
  if (startedAt) {
    const t = Date.parse(startedAt);
    if (!Number.isNaN(t)) newest = t;
  }
  for (const e of events) {
    if (!MEANINGFUL_PROGRESS_EVENT_TYPES.has(e.event_type)) continue;
    const t = Date.parse(e.created_at);
    if (Number.isNaN(t)) continue;
    if (newest === null || t > newest) newest = t;
  }
  if (newest === null) return null;
  return Math.min(newest, nowMs);
}

function newestProgressAt(
  events: InternalEvent[],
  startedAt: string | null,
  nowMs: number,
): string | null {
  return isoOrNull(newestProgressMs(events, startedAt, nowMs));
}

function isoOrNull(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString();
}

function deriveCustomerPhase(
  events: InternalEvent[],
): Exclude<CustomerAuditPhase, "delayed"> {
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

const DELAYED_MESSAGE =
  "Your audit is taking longer than expected. This can happen during high load. We'll notify you when it's ready — no action needed.";

const PHASE_MESSAGES: Record<CustomerAuditPhase, string> = {
  preparing: "Preparing your evidence run.",
  analyzing:
    "Checking current signals and comparing them with your previous state.",
  finalizing: "Verifying evidence links and assembling your report.",
  delayed: DELAYED_MESSAGE,
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

function terminalMessage(
  terminal: CustomerAuditTerminal,
  phase: Exclude<CustomerAuditPhase, "delayed">,
): string {
  if (terminal === "blocked" && phase === "finalizing") {
    return "We couldn't finalize this report. A founder has been notified and will review it.";
  }
  if (terminal === "blocked" && phase === "analyzing") {
    return "This audit stopped during analysis. A founder has been notified and will review it.";
  }
  return TERMINAL_MESSAGES[terminal] ?? "Your audit is ready.";
}

/**
 * Returns true if the customer status is in a terminal state.
 */
export function isTerminal(status: CustomerAuditStatus): boolean {
  return status.terminal !== null;
}

/**
 * Returns true if the job appears stale (active but no recent meaningful
 * progress). Uses the newest meaningful progress reference (falling back to
 * startedAt), so heartbeat/cache/retry noise cannot keep a stalled run alive.
 */
export function isStale(
  status: CustomerAuditStatus,
  allowedLifetimeMs: number = 15 * 60 * 1000,
  nowMs: number = Date.now(),
): boolean {
  if (isTerminal(status)) return false;
  const reference = status.lastProgressAt ?? status.startedAt;
  if (!reference) return false;
  return nowMs - Date.parse(reference) > allowedLifetimeMs;
}

/**
 * Serialize a projected customer status to a stable JSON string (fixed key
 * order, customer-safe fields only) so a leave-and-return resume can rehydrate
 * the exact same truthful state.
 */
export function serializeStatus(status: CustomerAuditStatus): string {
  return JSON.stringify({
    phase: status.phase,
    terminal: status.terminal,
    message: status.message,
    startedAt: status.startedAt,
    lastProgressAt: status.lastProgressAt,
    estimatedCompletion: status.estimatedCompletion,
  });
}

/**
 * Hydrate a serialized customer status, failing closed on malformed payloads.
 * Never trusts unknown fields; only the allowlisted customer-safe shape is
 * returned.
 */
export function hydrateStatus(serialized: string): CustomerAuditStatus {
  const raw: unknown = JSON.parse(serialized);
  if (typeof raw !== "object" || raw === null) {
    throw new Error("invalid customer status: expected an object");
  }
  const record = raw as Record<string, unknown>;

  const phases: CustomerAuditPhase[] = [
    "preparing",
    "analyzing",
    "finalizing",
    "delayed",
  ];
  const terminals: CustomerAuditTerminal[] = [
    "ready",
    "failed",
    "blocked",
    "needs_review",
  ];

  if (!phases.includes(record.phase as CustomerAuditPhase)) {
    throw new Error(`invalid customer status: unknown phase ${String(record.phase)}`);
  }
  if (
    record.terminal !== null &&
    !terminals.includes(record.terminal as CustomerAuditTerminal)
  ) {
    throw new Error(
      `invalid customer status: unknown terminal ${String(record.terminal)}`,
    );
  }
  for (const key of ["message", "startedAt", "lastProgressAt", "estimatedCompletion"] as const) {
    if (record[key] !== null && typeof record[key] !== "string") {
      throw new Error(`invalid customer status: ${key} must be a string or null`);
    }
  }

  return {
    phase: record.phase as CustomerAuditPhase,
    terminal: record.terminal as CustomerAuditTerminal | null,
    message: (record.message as string) ?? "",
    startedAt: (record.startedAt as string | null) ?? null,
    lastProgressAt: (record.lastProgressAt as string | null) ?? null,
    estimatedCompletion: (record.estimatedCompletion as string | null) ?? null,
  };
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
