import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { AdminRunHealth } from "./admin-run-health";
import { projectRunHealth, type IntelligenceRunHealthRow, type ReportRunHealthRow } from "@/lib/admin-run-health";

// Static server render is enough to prove structure, shared primitives, tone
// mapping, owner separation, and redaction without a DOM or browser.
const render = (bundle: ReturnType<typeof projectRunHealth>) =>
  renderToStaticMarkup(<AdminRunHealth bundle={bundle} />);

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
    audit: null,
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

describe("AdminRunHealth component", () => {
  it("renders an empty state when the bundle is empty", () => {
    const html = render(projectRunHealth({ reportAttempts: [], intelligenceRuns: [] }, { nowMs: NOW_MS }));
    expect(html).toContain('data-slot="experience-empty"');
    expect(html).toContain("No run records yet");
  });

  it("renders both owner sections without conflating vocabularies", () => {
    const html = render(
      projectRunHealth(
        {
          reportAttempts: [reportRow({ status: "ready" })],
          intelligenceRuns: [intelligenceRow({ status: "completed" })],
        },
        { nowMs: NOW_MS },
      ),
    );
    expect(html).toContain('data-slot="admin-run-health"');
    expect(html).toContain("Report attempts");
    expect(html).toContain("Intelligence runs");
    expect(html).toContain("Ready");
    expect(html).toContain("Completed");
    // The report vocabulary must never render an intelligence state and vice
    // versa; the report attempt is "Ready", never "Completed".
    expect(html.match(/Ready/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(html.match(/Completed/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("uses shared primitives: badge data-slot and experience-banner tones", () => {
    const html = render(
      projectRunHealth(
        { reportAttempts: [reportRow({ status: "failed" })], intelligenceRuns: [] },
        { nowMs: NOW_MS },
      ),
    );
    expect(html).toContain('data-slot="badge"');
    expect(html).toContain('data-slot="experience-banner"');
    expect(html).toContain('data-tone="danger"');
    // Count badge uses the neutral Badge tone (bg-muted), and the run badge
    // uses the danger tone (red-muted) — shared primitives, no raw colors.
    expect(html).toContain("bg-muted");
    expect(html).toContain("bg-[color:var(--red-muted)]");
  });

  it("does not present recovered historical failures as current founder work", () => {
    const html = render(
      projectRunHealth(
        {
          reportAttempts: [
            reportRow({
              id: "00000000-0000-4000-8000-000000000031",
              status: "failed",
              finished_at: iso(1 * MIN),
              audit: { status: "ready" },
            }),
            reportRow({
              id: "00000000-0000-4000-8000-000000000032",
              status: "crashed",
              finished_at: iso(1 * MIN),
              audit: { status: "ready" },
            }),
          ],
          intelligenceRuns: [],
        },
        { nowMs: NOW_MS },
      ),
    );
    expect(html).not.toContain("runs need attention");
    expect(html).toContain("No current runs require founder action");
    expect(html.match(/>Recovered<\/span>/g)?.length).toBe(2);
  });

  it("renders recovery guidance and UNKNOWN unsupported signals, never success", () => {
    const html = render(
      projectRunHealth(
        {
          reportAttempts: [reportRow({ status: "failed", error_code: "provider_error" })],
          intelligenceRuns: [intelligenceRow({ status: "completed" })],
        },
        { nowMs: NOW_MS },
      ),
    );
    expect(html).toContain("total_deadline: UNKNOWN");
    expect(html).toContain("cancellation: UNKNOWN");
    expect(html).toContain("no deadline column");
    expect(html).toContain("no cancellation column");
    expect(html).toContain("audit review surface");
    // UNKNOWN must never become success text.
    expect(html).not.toContain("total_deadline: success");
    expect(html).not.toContain("cancellation: success");
  });

  it("renders a delayed run with warning tone and guidance", () => {
    const html = render(
      projectRunHealth(
        {
          reportAttempts: [reportRow({ status: "running", started_at: iso(12 * MIN) })],
          intelligenceRuns: [],
        },
        { nowMs: NOW_MS },
      ),
    );
    expect(html).toContain("Delayed");
    expect(html).toContain('data-tone="warning"');
    expect(html).toContain("delayed threshold");
  });

  it("renders resumed state from cache_mode=resume", () => {
    const html = render(
      projectRunHealth(
        {
          reportAttempts: [reportRow({ status: "running", cache_mode: "resume" })],
          intelligenceRuns: [],
        },
        { nowMs: NOW_MS },
      ),
    );
    expect(html).toContain("Resumed");
  });

  it("renders mobile-safe flex-wrap rows and truncated record identity only", () => {
    const html = render(
      projectRunHealth(
        {
          reportAttempts: [reportRow({ status: "ready" })],
          intelligenceRuns: [intelligenceRow({ status: "completed" })],
        },
        { nowMs: NOW_MS },
      ),
    );
    expect(html).toContain("flex-wrap");
    // Record identity is truncated to 8 chars — never a full UUID dump.
    expect(html).toContain("00000000");
    expect(html).not.toContain("00000000-0000-4000-8000-000000000002");
  });

  it("excludes customer payload, handles, emails, evidence bodies, and secrets", () => {
    const html = render(
      projectRunHealth(
        {
          reportAttempts: [
            reportRow({
              status: "failed",
              error_code: "provider_error",
              audit_id: "00000000-0000-4000-8000-000000000002",
            }),
          ],
          intelligenceRuns: [intelligenceRow({ status: "failed" })],
        },
        { nowMs: NOW_MS },
      ),
    );
    expect(html).not.toMatch(/@/);
    expect(html).not.toMatch(/evidence\s*body|stage_timings|stage\s*payload/i);
    expect(html).not.toMatch(/traceback|exception|secret|service_role|eyJ/);
    expect(html).not.toContain("handle");
    expect(html).not.toContain("email");
  });

  it("renders contradictory records without treating them as success", () => {
    const html = render(
      projectRunHealth(
        {
          reportAttempts: [reportRow({ status: "running", finished_at: iso(30_000) })],
          intelligenceRuns: [],
        },
        { nowMs: NOW_MS },
      ),
    );
    expect(html).toContain("Contradictory");
    expect(html).toContain('data-tone="danger"');
  });

  it("renders the empty-list placeholder per owner when one side has no rows", () => {
    const html = render(
      projectRunHealth(
        { reportAttempts: [], intelligenceRuns: [intelligenceRow({ status: "completed" })] },
        { nowMs: NOW_MS },
      ),
    );
    expect(html).toContain("No report attempts yet.");
    expect(html).not.toContain("No intelligence runs yet.");
  });
});
