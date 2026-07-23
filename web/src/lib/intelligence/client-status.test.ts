import { describe, it, expect } from "vitest";
import { projectCustomerStatus, isTerminal, isStale } from "./client-status";
import type { AuditStatus } from "../domain";

// ---- Helpers ----

function mkEvent(event_type: string, phase?: string) {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    phase: phase ?? null,
    event_type,
    detail: null,
    created_at: new Date().toISOString(),
  };
}

// ---- Tests ----

describe("projectCustomerStatus", () => {
  it("returns terminal ready when internal status is ready", () => {
    const result = projectCustomerStatus("ready", [], new Date().toISOString());
    expect(result.terminal).toBe("ready");
    expect(result.phase).toBe("finalizing");
  });

  it("returns terminal failed when internal status is failed", () => {
    const result = projectCustomerStatus("failed", [], new Date().toISOString());
    expect(result.terminal).toBe("failed");
  });

  it("returns terminal blocked when internal status is blocked", () => {
    const result = projectCustomerStatus("blocked", [], new Date().toISOString());
    expect(result.terminal).toBe("blocked");
  });

  it("returns terminal needs_review when internal status is needs_review", () => {
    const result = projectCustomerStatus("needs_review", [], new Date().toISOString());
    expect(result.terminal).toBe("needs_review");
  });

  it('returns "preparing" phase for queued with no events', () => {
    const result = projectCustomerStatus("queued", [], new Date().toISOString());
    expect(result.terminal).toBeNull();
    expect(result.phase).toBe("preparing");
    expect(result.message).toContain("Preparing");
  });

  it('returns "analyzing" when research events exist', () => {
    const result = projectCustomerStatus(
      "running",
      [mkEvent("research_started")],
      new Date().toISOString(),
    );
    expect(result.phase).toBe("analyzing");
  });

  it('returns "analyzing" for metrics_collected', () => {
    const result = projectCustomerStatus(
      "running",
      [mkEvent("metrics_collected")],
      new Date().toISOString(),
    );
    expect(result.phase).toBe("analyzing");
  });

  it('returns "analyzing" for research_cached', () => {
    const result = projectCustomerStatus(
      "running",
      [mkEvent("research_cached")],
      new Date().toISOString(),
    );
    expect(result.phase).toBe("analyzing");
  });

  it('returns "finalizing" when composing started', () => {
    const result = projectCustomerStatus(
      "running",
      [mkEvent("composing_started")],
      new Date().toISOString(),
    );
    expect(result.phase).toBe("finalizing");
  });

  it('returns "finalizing" when report uploaded', () => {
    const result = projectCustomerStatus(
      "running",
      [mkEvent("report_uploaded")],
      new Date().toISOString(),
    );
    expect(result.phase).toBe("finalizing");
  });

  it("returns delayed when active but no progress for >10min", () => {
    const oldStart = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    const result = projectCustomerStatus("running", [], oldStart);
    expect(result.phase).toBe("delayed");
    expect(result.message).toContain("longer than expected");
  });

  it("does not mark as delayed when within threshold", () => {
    const recentStart = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const result = projectCustomerStatus("running", [], recentStart);
    expect(result.phase).not.toBe("delayed");
  });

  it("never exposes internal event detail in message", () => {
    const events = [
      mkEvent("worker_claim", "started"),
      mkEvent("cache_hit"),
      mkEvent("retry_attempt"),
    ];
    const result = projectCustomerStatus(
      "running",
      events,
      new Date().toISOString(),
    );
    // Messages should never contain raw internal details
    expect(result.message).not.toContain("worker_claim");
    expect(result.message).not.toContain("cache_hit");
    expect(result.message).not.toContain("retry_attempt");
    expect(result.message).not.toContain("heartbeat");
  });

  it("terminal states always stop animation regardless of events", () => {
    const events = [mkEvent("composing_started"), mkEvent("report_uploaded")];
    const result = projectCustomerStatus("failed", events, new Date().toISOString());
    expect(result.terminal).toBe("failed");
    // Phase should be overridden to finalizing since terminal
    expect(result.phase).toBe("finalizing");
  });
});

describe("isTerminal", () => {
  it("returns true when terminal is set", () => {
    const status = projectCustomerStatus("ready", [], new Date().toISOString());
    expect(isTerminal(status)).toBe(true);
  });

  it("returns false when terminal is null", () => {
    const status = projectCustomerStatus("queued", [], new Date().toISOString());
    expect(isTerminal(status)).toBe(false);
  });
});

describe("isStale", () => {
  it("returns true for active jobs older than allowed lifetime", () => {
    const oldStart = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const status = projectCustomerStatus("running", [], oldStart);
    expect(isStale(status)).toBe(true);
  });

  it("returns false for terminal jobs", () => {
    const status = projectCustomerStatus("ready", [], new Date().toISOString());
    expect(isStale(status)).toBe(false);
  });

  it("returns false for recent active jobs", () => {
    const recent = new Date(Date.now() - 60 * 1000).toISOString();
    const status = projectCustomerStatus("running", [], recent);
    expect(isStale(status)).toBe(false);
  });

  it("returns false when startedAt is null", () => {
    const status = projectCustomerStatus("running", [], null);
    expect(isStale(status)).toBe(false);
  });
});

describe("allowlisted phases", () => {
  const allowlisted = ["preparing", "analyzing", "finalizing"];

  it("never returns a phase outside the allowlist", () => {
    // Test with many events to ensure no leakage
    const allInternalEvents = [
      mkEvent("audit_submitted"),
      mkEvent("worker_claim"),
      mkEvent("research_started"),
      mkEvent("research_cached"),
      mkEvent("metrics_collected"),
      mkEvent("peers_identified"),
      mkEvent("analysis_running"),
      mkEvent("composing_started"),
      mkEvent("scoring_complete"),
      mkEvent("report_uploaded"),
      mkEvent("audit_succeeded"),
    ];

    for (const status of ["queued", "running"] as AuditStatus[]) {
      const result = projectCustomerStatus(
        status,
        allInternalEvents.slice(0, 3),
        new Date().toISOString(),
      );
      expect(allowlisted).toContain(result.phase);
    }
  });
});
