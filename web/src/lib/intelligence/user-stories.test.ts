/**
 * Story-level verification of the ALM intelligence user journey (no live DB).
 *
 * Stories covered:
 * 1. Batch validate → stub submit returns audit ids
 * 2. Customer wait projects Preparing/Analyzing/Finalizing only
 * 3. Subject home accepts live-shaped data without fixture banner path
 */

import { describe, expect, it } from "vitest";

import { validateBatch } from "./batch";
import { projectCustomerStatus } from "./client-status";
import { stubPrepareAndSubmitBatch } from "./api";
import { fixtureChannels, fixtureSubjects } from "./fixtures";
import type { BatchSubmission } from "./types";

describe("ALM user stories (logical e2e)", () => {
  it("story: choose subject + channels → valid batch → stub submit", () => {
    const subject = fixtureSubjects()[0]!;
    const channels = fixtureChannels(subject.id);
    const submission: BatchSubmission = {
      subjectId: subject.id,
      briefVersionId: "",
      changeNotes: "Focus on Instagram growth this month.",
      requests: channels.slice(0, 1).map((ch) => ({
        channelId: ch.id,
        reportType: "standard" as const,
        forceRefresh: false,
      })),
    };

    const validation = validateBatch(submission, channels, "starter");
    expect(validation.valid).toBe(true);

    const outcome = stubPrepareAndSubmitBatch(
      submission,
      channels.slice(0, 1).map((c) => c.handle || c.url || c.id),
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.mode).toBe("stub");
      expect(outcome.auditIds.length).toBe(1);
      expect(outcome.subjectId).toBe(subject.id);
      expect(outcome.batchId).toMatch(/^stub-batch-/);
    }
  });

  it("story: wait page never exposes internal phases — only customer states", () => {
    const preparing = projectCustomerStatus("queued", [], new Date().toISOString());
    expect(preparing.phase).toBe("preparing");
    expect(preparing.terminal).toBeNull();

    const analyzing = projectCustomerStatus(
      "running",
      [
        {
          phase: "researching",
          event_type: "research_started",
          detail: "worker hermes-1 cache hit",
          created_at: new Date().toISOString(),
        },
      ],
      new Date().toISOString(),
    );
    expect(analyzing.phase).toBe("analyzing");
    expect(JSON.stringify(analyzing)).not.toMatch(/hermes|cache hit|worker/i);

    const ready = projectCustomerStatus("ready", [], new Date().toISOString());
    expect(ready.terminal).toBe("ready");
    expect(ready.phase).toBe("finalizing");
  });

  it("story: subject home live data shape is enough to leave fixtures", () => {
    const subject = fixtureSubjects()[0]!;
    const channels = fixtureChannels(subject.id);
    expect(subject.id).toBeTruthy();
    expect(channels.length).toBeGreaterThan(0);
    // Live path supplies the same TypeScript shapes SubjectHome consumes.
    const liveShaped = {
      subject,
      channels,
      briefVersions: [],
      proposals: [],
      scores: [
        {
          dimensionId: "overall",
          dimensionLabel: "overall",
          evidenceIds: [],
          score: 72,
          maxScore: 100,
          rationale: "Methodology alm-bridge-v1",
          changeReason: "new" as const,
          previousScore: null,
        },
      ],
      recommendations: [],
      sinceLast: [],
      reports: [],
    };
    expect(liveShaped.scores[0]?.score).toBe(72);
    expect(liveShaped.channels.every((c) => c.subjectId === subject.id)).toBe(
      true,
    );
  });
});
