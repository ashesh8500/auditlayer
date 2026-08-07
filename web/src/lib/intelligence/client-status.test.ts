import { describe, it, expect } from "vitest";
import {
  projectCustomerStatus,
  isTerminal,
  isStale,
  serializeStatus,
  hydrateStatus,
} from "./client-status";
import type { AuditStatus } from "../domain";
import type { CustomerAuditStatus } from "./types";

// ---- Deterministic clock ----
// All staleness cases use a fixed "now" so results are clock-independent.

const NOW_MS = Date.parse("2026-08-07T12:00:00.000Z");
const MIN = 60 * 1000;
const STALE_THRESHOLD_MS = 10 * MIN;
const at = (offsetMs: number) => new Date(NOW_MS + offsetMs).toISOString();

// ---- Helpers ----

function mkEvent(
  event_type: string,
  created_at: string = at(0),
  phase?: string,
) {
  return {
    id: `evt-${event_type}-${created_at}`,
    phase: phase ?? null,
    event_type,
    detail: null,
    created_at,
  };
}

function project(
  internalStatus: AuditStatus,
  events: ReturnType<typeof mkEvent>[],
  startedAtOffsetMs: number | null,
  nowOffsetMs: number = 0,
) {
  return projectCustomerStatus(
    internalStatus,
    events,
    startedAtOffsetMs === null ? null : at(startedAtOffsetMs),
    { staleThresholdMs: STALE_THRESHOLD_MS, nowMs: NOW_MS + nowOffsetMs },
  );
}

// ---- Tests ----

describe("projectCustomerStatus — terminal states", () => {
  it.each([
    ["ready", "ready"],
    ["failed", "failed"],
    ["blocked", "blocked"],
    ["needs_review", "needs_review"],
  ] as const)("returns terminal %s for internal status %s", (_, internal) => {
    const result = project(internal, [], 0);
    expect(result.terminal).toBe(internal);
    expect(result.phase).toBe("finalizing");
    expect(isTerminal(result)).toBe(true);
  });

  it("terminal always wins even with stale progress and noise", () => {
    const result = project(
      "failed",
      [
        mkEvent("heartbeat", at(-11 * MIN)),
        mkEvent("retry_attempt", at(-11 * MIN)),
      ],
      -30 * MIN,
    );
    expect(result.terminal).toBe("failed");
    expect(result.phase).toBe("finalizing");
  });

  it("terminal always wins even with recent meaningful progress", () => {
    const result = project(
      "ready",
      [mkEvent("research_started", at(-1 * MIN))],
      -30 * MIN,
    );
    expect(result.terminal).toBe("ready");
    expect(result.phase).toBe("finalizing");
  });
});

describe("projectCustomerStatus — active phases", () => {
  it('returns "preparing" phase for queued with no events', () => {
    const result = project("queued", [], 0);
    expect(result.terminal).toBeNull();
    expect(result.phase).toBe("preparing");
    expect(result.message).toContain("Preparing");
  });

  it('returns "analyzing" when research events exist', () => {
    const result = project("running", [mkEvent("research_started")], 0);
    expect(result.phase).toBe("analyzing");
  });

  it('returns "analyzing" for metrics_collected', () => {
    const result = project("running", [mkEvent("metrics_collected")], 0);
    expect(result.phase).toBe("analyzing");
  });

  it('returns "analyzing" for research_cached (display only — not progress)', () => {
    const result = project("running", [mkEvent("research_cached")], 0);
    expect(result.phase).toBe("analyzing");
  });

  it('returns "finalizing" when composing started', () => {
    const result = project("running", [mkEvent("composing_started")], 0);
    expect(result.phase).toBe("finalizing");
  });

  it('returns "finalizing" when report uploaded', () => {
    const result = project("running", [mkEvent("report_uploaded")], 0);
    expect(result.phase).toBe("finalizing");
  });

  it("never returns a phase outside the allowlist", () => {
    const allInternalEvents = [
      "audit_submitted",
      "worker_claim",
      "research_started",
      "research_cached",
      "metrics_collected",
      "peers_identified",
      "analysis_running",
      "composing_started",
      "scoring_complete",
      "report_uploaded",
      "audit_succeeded",
    ].map((event_type) => mkEvent(event_type));

    for (const status of ["queued", "running"] as AuditStatus[]) {
      const result = project(status, allInternalEvents.slice(0, 3), 0);
      expect(["preparing", "analyzing", "finalizing"]).toContain(result.phase);
    }
  });
});

describe("projectCustomerStatus — meaningful-progress staleness", () => {
  it("does NOT mark delayed when a recent meaningful event exists, even if startedAt is old", () => {
    // Baseline falsification: started 30 min ago but composed 1 min ago.
    const result = project(
      "running",
      [mkEvent("composing_started", at(-1 * MIN))],
      -30 * MIN,
    );
    expect(result.phase).toBe("finalizing");
    expect(result.phase).not.toBe("delayed");
  });

  it("does NOT mark delayed when analyzing event is recent", () => {
    const result = project(
      "running",
      [mkEvent("metrics_collected", at(-2 * MIN))],
      -30 * MIN,
    );
    expect(result.phase).toBe("analyzing");
    expect(result.phase).not.toBe("delayed");
  });

  it("marks delayed when the newest meaningful progress is stale", () => {
    const result = project(
      "running",
      [mkEvent("research_started", at(-12 * MIN))],
      -30 * MIN,
    );
    expect(result.phase).toBe("delayed");
    expect(result.message).toContain("longer than expected");
  });

  it("marks delayed when no events exist and startedAt is old", () => {
    const result = project("running", [], -11 * MIN);
    expect(result.phase).toBe("delayed");
  });

  it("does not mark delayed when startedAt is recent with no events", () => {
    const result = project("running", [], -2 * MIN);
    expect(result.phase).not.toBe("delayed");
    expect(result.phase).toBe("preparing");
  });

  it("reports the newest meaningful progress reference in lastProgressAt", () => {
    const result = project(
      "running",
      [mkEvent("research_started", at(-5 * MIN)), mkEvent("metrics_collected", at(-2 * MIN))],
      -30 * MIN,
    );
    expect(result.lastProgressAt).toBe(at(-2 * MIN));
  });

  it("falls back to startedAt for lastProgressAt when no meaningful events", () => {
    const result = project("running", [mkEvent("heartbeat", at(-1 * MIN))], -5 * MIN);
    expect(result.lastProgressAt).toBe(at(-5 * MIN));
  });
});

describe("projectCustomerStatus — heartbeat/cache/retry noise cannot mask delay", () => {
  it("marks delayed when only recent heartbeat activity exists", () => {
    const result = project(
      "running",
      [
        mkEvent("heartbeat", at(-30 * 1000)),
        mkEvent("heartbeat", at(-1 * MIN)),
      ],
      -20 * MIN,
    );
    expect(result.phase).toBe("delayed");
  });

  it("marks delayed when only recent cache-hit activity exists", () => {
    const result = project(
      "running",
      [mkEvent("cache_hit", at(-30 * 1000)), mkEvent("research_cached", at(-1 * MIN))],
      -20 * MIN,
    );
    expect(result.phase).toBe("delayed");
  });

  it("marks delayed when only recent retry activity exists", () => {
    const result = project(
      "running",
      [
        mkEvent("retry_attempt", at(-30 * 1000)),
        mkEvent("worker_claim", at(-1 * MIN)),
      ],
      -20 * MIN,
    );
    expect(result.phase).toBe("delayed");
  });

  it("noise mixed with a stale meaningful event still marks delayed", () => {
    const result = project(
      "running",
      [
        mkEvent("research_started", at(-12 * MIN)),
        mkEvent("heartbeat", at(-30 * 1000)),
        mkEvent("retry_attempt", at(-15 * 1000)),
      ],
      -20 * MIN,
    );
    expect(result.phase).toBe("delayed");
  });

  it("does not mask delay when noise arrives after a fresh meaningful event that later goes stale", () => {
    // Meaningful at -9min (fresh), then only noise; at now the run is 9 min
    // past meaningful progress → still within threshold → not delayed.
    const fresh = project(
      "running",
      [
        mkEvent("metrics_collected", at(-9 * MIN)),
        mkEvent("heartbeat", at(-30 * 1000)),
      ],
      -20 * MIN,
    );
    expect(fresh.phase).toBe("analyzing");
    expect(fresh.phase).not.toBe("delayed");
  });
});

describe("projectCustomerStatus — retry/resume idempotency", () => {
  it("duplicate events do not change the projection", () => {
    const single = project("running", [mkEvent("research_started", at(-2 * MIN))], -20 * MIN);
    const duplicated = project(
      "running",
      [
        mkEvent("research_started", at(-2 * MIN)),
        mkEvent("research_started", at(-2 * MIN)),
        mkEvent("research_started", at(-2 * MIN)),
      ],
      -20 * MIN,
    );
    expect(duplicated).toEqual(single);
  });

  it("out-of-order events produce the same projection as ordered events", () => {
    const ordered = project(
      "running",
      [
        mkEvent("research_started", at(-8 * MIN)),
        mkEvent("metrics_collected", at(-5 * MIN)),
        mkEvent("composing_started", at(-2 * MIN)),
      ],
      -20 * MIN,
    );
    const shuffled = project(
      "running",
      [
        mkEvent("composing_started", at(-2 * MIN)),
        mkEvent("research_started", at(-8 * MIN)),
        mkEvent("metrics_collected", at(-5 * MIN)),
      ],
      -20 * MIN,
    );
    expect(shuffled).toEqual(ordered);
    expect(shuffled.phase).toBe("finalizing");
  });

  it("a late-arriving older meaningful event cannot extend freshness", () => {
    // Meaningful progress at -30min is old; a duplicate of it arriving late
    // must not make the run look fresh.
    const result = project(
      "running",
      [
        mkEvent("research_started", at(-30 * MIN)),
        mkEvent("research_started", at(-30 * MIN)),
      ],
      -30 * MIN,
    );
    expect(result.phase).toBe("delayed");
  });

  it("same inputs + same clock → identical output (determinism)", () => {
    const a = project("running", [mkEvent("research_started", at(-2 * MIN))], -20 * MIN);
    const b = project("running", [mkEvent("research_started", at(-2 * MIN))], -20 * MIN);
    expect(a).toEqual(b);
  });
});

describe("serialize / hydrate resume", () => {
  it("serialize → hydrate returns an identical status", () => {
    const status = project(
      "running",
      [mkEvent("composing_started", at(-2 * MIN))],
      -20 * MIN,
    );
    expect(hydrateStatus(serializeStatus(status))).toEqual(status);
  });

  it("hydrated status is identical for terminal states too", () => {
    const status = project("failed", [], -20 * MIN);
    expect(hydrateStatus(serializeStatus(status))).toEqual(status);
  });

  it("serialized payload is scrubbed — no internal event types or details", () => {
    const status = project(
      "running",
      [
        mkEvent("worker_claim", at(-20 * MIN), "started"),
        mkEvent("research_cached", at(-18 * MIN)),
        mkEvent("retry_attempt", at(-15 * MIN)),
      ],
      -20 * MIN,
    );
    const serialized = serializeStatus(status);
    expect(serialized).not.toMatch(/worker_claim|cache_hit|retry_attempt|heartbeat/i);
    expect(serialized).not.toContain("hermes");
  });

  it("hydrate rejects malformed payloads", () => {
    expect(() => hydrateStatus("not json")).toThrow();
    expect(() => hydrateStatus(JSON.stringify({ phase: "bogus", terminal: null, message: "x" }))).toThrow();
    expect(() => hydrateStatus(JSON.stringify({ phase: "preparing", terminal: "bogus", message: "x" }))).toThrow();
    expect(() => hydrateStatus(JSON.stringify({ phase: "preparing", terminal: null, message: 42 }))).toThrow();
  });

  it("resume at a later clock re-projects the same inputs honestly", () => {
    // Leave at T0 with fresh progress; return 5 min later (still within threshold).
    const events = [mkEvent("research_started", at(-2 * MIN))];
    const atLeave = project("running", events, -20 * MIN, 0);
    expect(atLeave.phase).toBe("analyzing");

    // Return 5 min later → progress now 7 min old → still analyzing.
    const onReturn = project("running", events, -20 * MIN, 5 * MIN);
    expect(onReturn.phase).toBe("analyzing");

    // Return 12 min later → progress now 14 min old → delayed, honestly.
    const muchLater = project("running", events, -20 * MIN, 12 * MIN);
    expect(muchLater.phase).toBe("delayed");
  });
});

describe("isTerminal", () => {
  it("returns true when terminal is set", () => {
    const status = project("ready", [], 0);
    expect(isTerminal(status)).toBe(true);
  });

  it("returns false when terminal is null", () => {
    const status = project("queued", [], 0);
    expect(isTerminal(status)).toBe(false);
  });
});

describe("isStale — progress-aware", () => {
  const allowedLifetimeMs = 15 * MIN;

  it("returns true when meaningful progress is older than lifetime", () => {
    const status = project(
      "running",
      [mkEvent("research_started", at(-20 * MIN))],
      -30 * MIN,
    );
    expect(isStale(status, allowedLifetimeMs, NOW_MS)).toBe(true);
  });

  it("returns false when meaningful progress is recent, even if startedAt is old", () => {
    const status = project(
      "running",
      [mkEvent("composing_started", at(-2 * MIN))],
      -30 * MIN,
    );
    expect(isStale(status, allowedLifetimeMs, NOW_MS)).toBe(false);
  });

  it("returns false for terminal jobs", () => {
    const status = project("ready", [], -20 * MIN);
    expect(isStale(status, allowedLifetimeMs, NOW_MS)).toBe(false);
  });

  it("returns false when there is no reference (no startedAt, no meaningful events)", () => {
    const status = projectCustomerStatus("running", [], null, {
      staleThresholdMs: STALE_THRESHOLD_MS,
      nowMs: NOW_MS,
    });
    expect(isStale(status, allowedLifetimeMs, NOW_MS)).toBe(false);
  });

  it("heartbeat noise does not keep a stale job alive", () => {
    const status = project(
      "running",
      [mkEvent("heartbeat", at(-1 * MIN))],
      -30 * MIN,
    );
    expect(isStale(status, allowedLifetimeMs, NOW_MS)).toBe(true);
  });
});

describe("customer-safe output shape", () => {
  it("every projected status carries the full customer-safe shape", () => {
    for (const status of ["queued", "running", "ready", "failed", "blocked", "needs_review"] as AuditStatus[]) {
      const result = project(status, [], -1 * MIN);
      const shape: CustomerAuditStatus = result;
      expect(shape.phase).toBeTruthy();
      expect(shape.message).toBeTruthy();
      expect(typeof shape.startedAt).toBe("string");
      expect("lastProgressAt" in shape).toBe(true);
      expect("estimatedCompletion" in shape).toBe(true);
    }
  });
});
