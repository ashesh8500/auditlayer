import type {
  CustomerAuditPhase,
  CustomerAuditTerminal,
} from "./types";

export type ProgressStepVisualState =
  | "complete"
  | "current"
  | "pending"
  | "stopped";

const PHASES: Exclude<CustomerAuditPhase, "delayed">[] = [
  "preparing",
  "analyzing",
  "finalizing",
];

/**
 * Project the customer phase into honest step visuals.
 * Only a ready report completes all phases. A failed/review/blocked terminal
 * stops at the phase reached instead of painting future work as complete.
 */
export function progressStepState(
  phase: CustomerAuditPhase,
  terminal: CustomerAuditTerminal | null,
): ProgressStepVisualState[] {
  if (terminal === "ready") return PHASES.map(() => "complete");

  const activeIndex = phase === "delayed" ? 0 : Math.max(0, PHASES.indexOf(phase));
  return PHASES.map((_, index) => {
    if (index < activeIndex) return "complete";
    if (index > activeIndex) return "pending";
    return terminal ? "stopped" : "current";
  });
}
