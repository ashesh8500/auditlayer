import { describe, expect, it } from "vitest";

import {
  ADMIN_RUN_HEALTH_VERSION,
  CANCELLATION_UNSUPPORTED,
  DEFAULT_DELAYED_THRESHOLD_MS,
  INTELLIGENCE_RUN_STATUS_VOCABULARY,
  REPORT_RUN_STATUS_VOCABULARY,
  TOTAL_DEADLINE_UNSUPPORTED,
  buildAdminRunHealthContract,
  formatRunAge,
  projectIntelligenceRun,
  projectReportAttempt,
  projectRunHealth,
  serializeReportAttemptHealth,
  serializeIntelligenceRunHealth,
  type IntelligenceRunHealthRow,
  type ReportRunHealthRow,
} from "./admin-run-health";

// ---------------------------------------------------------------------------
// Fixtures (deterministic clock: 2026-08-07T12:00:00Z)
// ---------------------------------------------------------------------------

const NOW_MS = Date.parse("2026-08-07T12:00:00.000Z");
const MIN = 60_000;

function iso(offsetMs: number): string {
  return new Date(NOW_MS - offsetMs).toISOString();
}

function reportRow(overrides: Partial<ReportRunHealthRow> = {}): ReportRunHealthRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    audit_id: "00000000-0000-4000-8000-000000000002",
    status: "running",
    error_code: null,
    cache_mode: "fresh",
    evidence_items: 0,
    started_at: iso(2 * MIN),
    finished_at: null,
    updated_at: iso(1 * MIN),
    ...overrides,
  };
}

function intelligenceRow(
  overrides: Partial<IntelligenceRunHealthRow> = {},
): IntelligenceRunHealthRow {
  return {
    id: "00000000-0000-4000-8000-000000000011",
    subject_id: "00000000-0000-4000-8000-000000000012",
    status: "running",
    cache_mode: "fresh",
    latency_ms: null,
    created_at: iso(2 * MIN),
    updated_at: iso(1 * MIN),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Report-attempt vocabulary (running/ready/needs_review/failed/blocked/crashed)
// ---------------------------------------------------------------------------

describe("admin-run-health: report-attempt vocabulary", () => {
  it("projects a finished attempt as ready", () => {
    const h = projectReportAttempt(
      reportRow({ status: "ready", finished_at: iso(1 * MIN) }),
      { nowMs: NOW_MS },
    );
    expect(h.owner).toBe("report_generation_run");
    expect(h.state).toBe("ready");
    expect(h.statusKnown).toBe(true);
    expect(h.correctionTip).toBeNull();
    expect(h.ageKnown).toBe(true);
    expect(h.ageMs).toBe(2 * MIN);
  });

  it("projects a fresh running attempt as running", () => {
    const h = projectReportAttempt(reportRow({ status: "running" }), {
      nowMs: NOW_MS,
    });
    expect(h.state).toBe("running");
    expect(h.correctionTip).toBeNull();
  });

  it("projects a running attempt beyond the delayed threshold as delayed", () => {
    const h = projectReportAttempt(
      reportRow({ status: "running", started_at: iso(12 * MIN) }),
      { nowMs: NOW_MS },
    );
    expect(h.state).toBe("delayed");
    expect(h.correctionTip).toMatch(/delayed threshold/);
  });

  it("does not flag an attempt inside the threshold as delayed", () => {
    const h = projectReportAttempt(
      reportRow({ status: "running", started_at: iso(5 * MIN) }),
      { nowMs: NOW_MS, delayedThresholdMs: 10 * MIN },
    );
    expect(h.state).toBe("running");
  });

  it("projects a failed attempt with its bounded error code", () => {
    const h = projectReportAttempt(
      reportRow({ status: "failed", error_code: "provider_error", finished_at: iso(1 * MIN) }),
      { nowMs: NOW_MS },
    );
    expect(h.state).toBe("failed");
    expect(h.errorCode).toBe("provider_error");
    expect(h.correctionTip).toMatch(/audit review surface/);
  });

  it("projects a crashed attempt", () => {
    const h = projectReportAttempt(reportRow({ status: "crashed" }), {
      nowMs: NOW_MS,
    });
    expect(h.state).toBe("crashed");
    expect(h.correctionTip).toMatch(/worker logs/);
  });

  it("projects a blocked attempt as founder action", () => {
    const h = projectReportAttempt(reportRow({ status: "blocked" }), {
      nowMs: NOW_MS,
    });
    expect(h.state).toBe("blocked");
    expect(h.correctionTip).toMatch(/Founder decision required/);
  });

  it("projects a needs_review attempt as founder action", () => {
    const h = projectReportAttempt(reportRow({ status: "needs_review" }), {
      nowMs: NOW_MS,
    });
    expect(h.state).toBe("needs_review");
    expect(h.correctionTip).toMatch(/confirm the platform/);
  });

  it("projects a resumed attempt from cache_mode=resume", () => {
    const h = projectReportAttempt(
      reportRow({ status: "running", cache_mode: "resume" }),
      { nowMs: NOW_MS },
    );
    expect(h.resumed).toBe(true);
    expect(h.cacheMode).toBe("resume");
  });

  it("never flags fresh/reused cache as resumed", () => {
    expect(
      projectReportAttempt(reportRow({ status: "running", cache_mode: "fresh" }), {
        nowMs: NOW_MS,
      }).resumed,
    ).toBe(false);
    expect(
      projectReportAttempt(reportRow({ status: "running", cache_mode: "reused" }), {
        nowMs: NOW_MS,
      }).resumed,
    ).toBe(false);
  });

  it("projects contradictory finished-marker as contradictory, not success", () => {
    const h = projectReportAttempt(
      reportRow({ status: "running", finished_at: iso(30_000) }),
      { nowMs: NOW_MS },
    );
    expect(h.state).toBe("contradictory");
    expect(h.contradictions.join(" ")).toMatch(/finished_at/);
    expect(h.correctionTip).toMatch(/Contradictory/);
  });

  it("projects clock-reversed updated_at as contradictory", () => {
    const h = projectReportAttempt(
      reportRow({ status: "ready", updated_at: iso(10 * MIN) }),
      { nowMs: NOW_MS },
    );
    expect(h.state).toBe("contradictory");
    expect(h.contradictions.join(" ")).toMatch(/updated_at precedes started_at/);
  });

  it("projects an out-of-vocabulary status as unknown, never success", () => {
    const h = projectReportAttempt(reportRow({ status: "completed" }), {
      nowMs: NOW_MS,
    });
    expect(h.state).toBe("unknown");
    expect(h.statusKnown).toBe(false);
    expect(h.correctionTip).toMatch(/not in the report-attempt vocabulary/);
  });
});

// ---------------------------------------------------------------------------
// Intelligence-run vocabulary (running/completed/failed)
// ---------------------------------------------------------------------------

describe("admin-run-health: intelligence-run vocabulary", () => {
  it("projects a completed run as completed", () => {
    const h = projectIntelligenceRun(intelligenceRow({ status: "completed" }), {
      nowMs: NOW_MS,
    });
    expect(h.owner).toBe("intelligence_run");
    expect(h.state).toBe("completed");
    expect(h.correctionTip).toBeNull();
  });

  it("projects a fresh running run as running", () => {
    const h = projectIntelligenceRun(intelligenceRow({ status: "running" }), {
      nowMs: NOW_MS,
    });
    expect(h.state).toBe("running");
  });

  it("projects a running run beyond threshold as delayed", () => {
    const h = projectIntelligenceRun(
      intelligenceRow({ status: "running", created_at: iso(12 * MIN) }),
      { nowMs: NOW_MS },
    );
    expect(h.state).toBe("delayed");
    expect(h.correctionTip).toMatch(/delayed threshold/);
  });

  it("projects a failed run as failed", () => {
    const h = projectIntelligenceRun(intelligenceRow({ status: "failed" }), {
      nowMs: NOW_MS,
    });
    expect(h.state).toBe("failed");
    expect(h.correctionTip).toMatch(/runtime-budget telemetry/);
  });

  it("projects a resumed run from cache_mode=resume", () => {
    const h = projectIntelligenceRun(
      intelligenceRow({ status: "running", cache_mode: "resume" }),
      { nowMs: NOW_MS },
    );
    expect(h.resumed).toBe(true);
  });

  it("projects latency-while-running as contradictory", () => {
    const h = projectIntelligenceRun(
      intelligenceRow({ status: "running", latency_ms: 42 }),
      { nowMs: NOW_MS },
    );
    expect(h.state).toBe("contradictory");
    expect(h.contradictions.join(" ")).toMatch(/latency_ms is set while status is running/);
  });

  it("projects clock-reversed updated_at as contradictory", () => {
    const h = projectIntelligenceRun(
      intelligenceRow({ status: "completed", updated_at: iso(10 * MIN) }),
      { nowMs: NOW_MS },
    );
    expect(h.state).toBe("contradictory");
  });

  it("projects a future created_at as contradictory", () => {
    const h = projectIntelligenceRun(
      intelligenceRow({ status: "completed", created_at: iso(-5 * MIN) }),
      { nowMs: NOW_MS },
    );
    expect(h.state).toBe("contradictory");
    expect(h.contradictions.join(" ")).toMatch(/in the future/);
  });

  it("projects an out-of-vocabulary status as unknown, never success", () => {
    const h = projectIntelligenceRun(intelligenceRow({ status: "ready" }), {
      nowMs: NOW_MS,
    });
    expect(h.state).toBe("unknown");
    expect(h.statusKnown).toBe(false);
    expect(h.correctionTip).toMatch(/not in the intelligence-run vocabulary/);
  });
});

// ---------------------------------------------------------------------------
// Unsupported signals: deadline + cancellation always UNKNOWN
// ---------------------------------------------------------------------------

describe("admin-run-health: unsupported deadline/cancellation", () => {
  it("always projects total-deadline as UNKNOWN with the exact correction path", () => {
    for (const h of [
      projectReportAttempt(reportRow({ status: "ready" }), { nowMs: NOW_MS }),
      projectIntelligenceRun(intelligenceRow({ status: "completed" }), { nowMs: NOW_MS }),
    ]) {
      const deadline = h.unsupported.find((u) => u.signal === "total_deadline");
      expect(deadline?.state).toBe("UNKNOWN");
      expect(deadline?.correctionTip).toContain(
        TOTAL_DEADLINE_UNSUPPORTED.correctionTip,
      );
      expect(deadline?.correctionTip).toMatch(/no deadline column/);
    }
  });

  it("always projects cancellation as UNKNOWN with the exact correction path", () => {
    for (const h of [
      projectReportAttempt(reportRow({ status: "failed" }), { nowMs: NOW_MS }),
      projectIntelligenceRun(intelligenceRow({ status: "failed" }), { nowMs: NOW_MS }),
    ]) {
      const cancellation = h.unsupported.find((u) => u.signal === "cancellation");
      expect(cancellation?.state).toBe("UNKNOWN");
      expect(cancellation?.correctionTip).toContain(
        CANCELLATION_UNSUPPORTED.correctionTip,
      );
      expect(cancellation?.correctionTip).toMatch(/no cancellation column/);
    }
  });

  it("never renders UNKNOWN as success in any fixture state", () => {
    const bundle = projectRunHealth(
      {
        reportAttempts: [
          reportRow({ status: "ready" }),
          reportRow({ status: "failed" }),
          reportRow({ status: "running" }),
        ],
        intelligenceRuns: [
          intelligenceRow({ status: "completed" }),
          intelligenceRow({ status: "failed" }),
        ],
      },
      { nowMs: NOW_MS },
    );
    for (const h of [...bundle.reportAttempts, ...bundle.intelligenceRuns]) {
      for (const u of h.unsupported) {
        expect(u.state).toBe("UNKNOWN");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Empty, ordering, deterministic age
// ---------------------------------------------------------------------------

describe("admin-run-health: empty, ordering, deterministic age", () => {
  it("projects an empty bundle as empty", () => {
    const bundle = projectRunHealth(
      { reportAttempts: [], intelligenceRuns: [] },
      { nowMs: NOW_MS },
    );
    expect(bundle.empty).toBe(true);
    expect(bundle.reportAttempts).toHaveLength(0);
    expect(bundle.intelligenceRuns).toHaveLength(0);
  });

  it("orders report attempts newest-first with a stable tie-break", () => {
    const bundle = projectRunHealth(
      {
        reportAttempts: [
          reportRow({ id: "aaaa", started_at: iso(10 * MIN) }),
          reportRow({ id: "bbbb", started_at: iso(2 * MIN) }),
          reportRow({ id: "cccc", started_at: iso(10 * MIN) }),
        ],
        intelligenceRuns: [],
      },
      { nowMs: NOW_MS },
    );
    expect(bundle.reportAttempts.map((h) => h.recordId)).toEqual([
      "bbbb", // newest (2m)
      "aaaa", // 10m
      "cccc", // 10m tie → id asc
    ]);
  });

  it("orders intelligence runs newest-first with a stable tie-break", () => {
    const bundle = projectRunHealth(
      {
        reportAttempts: [],
        intelligenceRuns: [
          intelligenceRow({ id: "dddd", created_at: iso(5 * MIN) }),
          intelligenceRow({ id: "eeee", created_at: iso(1 * MIN) }),
        ],
      },
      { nowMs: NOW_MS },
    );
    expect(bundle.intelligenceRuns.map((h) => h.recordId)).toEqual(["eeee", "dddd"]);
  });

  it("is deterministic for identical inputs and injected clock", () => {
    const a = projectRunHealth(
      { reportAttempts: [reportRow()], intelligenceRuns: [intelligenceRow()] },
      { nowMs: NOW_MS },
    );
    const b = projectRunHealth(
      { reportAttempts: [reportRow()], intelligenceRuns: [intelligenceRow()] },
      { nowMs: NOW_MS },
    );
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("reports unknown age when the reference timestamp is missing", () => {
    const h = projectReportAttempt(
      reportRow({ status: "running", started_at: null }),
      { nowMs: NOW_MS },
    );
    expect(h.ageKnown).toBe(false);
    expect(h.ageMs).toBeNull();
  });

  it("formats age deterministically and locale-independently", () => {
    expect(formatRunAge(null)).toBe("UNKNOWN");
    expect(formatRunAge(45_000)).toBe("45s");
    expect(formatRunAge(12 * MIN)).toBe("12m");
    expect(formatRunAge(3 * 3600_000 + 5 * MIN)).toBe("3h 5m");
    expect(formatRunAge(-1)).toBe("0s");
  });
});

// ---------------------------------------------------------------------------
// Redaction: serialized output excludes customer/trace payloads
// ---------------------------------------------------------------------------

describe("admin-run-health: redaction", () => {
  it("serializes report attempts to the allowlisted health surface only", () => {
    const h = projectReportAttempt(
      reportRow({ status: "failed", error_code: "provider_error" }),
      { nowMs: NOW_MS },
    );
    const json = JSON.stringify(serializeReportAttemptHealth(h));
    // No handles/emails/evidence bodies/stage payload values/credentials.
    expect(json).not.toMatch(/@/);
    expect(json).not.toMatch(/evidence\s*body|stage_timings|stage\s*payload/i);
    expect(json).not.toMatch(/traceback|exception|secret|service_role|eyJ/);
    expect(json).not.toContain("handle");
    expect(json).not.toContain("email");
  });

  it("serializes intelligence runs to the allowlisted health surface only", () => {
    const h = projectIntelligenceRun(
      intelligenceRow({ status: "completed", latency_ms: 42 }),
      { nowMs: NOW_MS },
    );
    const json = JSON.stringify(serializeIntelligenceRunHealth(h));
    expect(json).not.toMatch(/@/);
    expect(json).not.toMatch(/traceback|exception|secret|service_role|eyJ/);
    expect(json).not.toContain("handle");
    expect(json).not.toContain("email");
  });

  it("bounds error codes so raw tracebacks cannot leak", () => {
    const h = projectReportAttempt(
      reportRow({
        status: "failed",
        error_code:
          "Traceback (most recent call last):\nFile /opt/worker/core.py line 99\nraise RuntimeError(secret=eyJxxxx)",
      }),
      { nowMs: NOW_MS },
    );
    // The raw multi-line traceback is not a ≤200-char single-line code.
    expect(h.errorCode).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Contract artifact
// ---------------------------------------------------------------------------

describe("admin-run-health: contract artifact", () => {
  it("records provider_calls=0 and the verified owner matrix", () => {
    const c = buildAdminRunHealthContract();
    expect(c.contract).toBe("admin-run-health");
    expect(c.version).toBe(ADMIN_RUN_HEALTH_VERSION);
    expect(c.providerCalls).toBe(0);
    expect(c.owners.report_generation_run.statusVocabulary).toEqual([
      ...REPORT_RUN_STATUS_VOCABULARY,
    ]);
    expect(c.owners.intelligence_run.statusVocabulary).toEqual([
      ...INTELLIGENCE_RUN_STATUS_VOCABULARY,
    ]);
    expect(c.delayedThresholdMs).toBe(DEFAULT_DELAYED_THRESHOLD_MS);
  });

  it("names every required fixture case", () => {
    const cases = buildAdminRunHealthContract().fixtureCases;
    for (const name of [
      "ready",
      "running",
      "delayed",
      "failed",
      "crashed",
      "resumed",
      "empty",
      "contradictory",
      "deadline-UNKNOWN",
      "cancellation-UNKNOWN",
    ]) {
      expect(cases).toContain(name);
    }
  });

  it("is deterministic and free of env paths/timestamps/secrets", () => {
    const a = JSON.stringify(buildAdminRunHealthContract());
    const b = JSON.stringify(buildAdminRunHealthContract());
    expect(a).toBe(b);
    expect(a).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(a).not.toContain("/home/");
    expect(a).not.toContain("worktrees/");
    expect(a).not.toMatch(/secret|service_role|eyJ|password/);
  });
});
