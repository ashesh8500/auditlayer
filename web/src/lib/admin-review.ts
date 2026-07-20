const FOUNDER_ACTION_STATUSES = new Set([
  "needs_review",
  "blocked",
  "failed",
]);

export function needsFounderAction(status: string): boolean {
  return FOUNDER_ACTION_STATUSES.has(status);
}
