import { describe, expect, it } from "vitest";

import { summarizeProgression } from "./account-progress";

describe("summarizeProgression", () => {
  it("uses the newest two observations for score and follower deltas", () => {
    const summary = summarizeProgression([
      {
        score: 72,
        followers: 12500,
        engagement: 3.4,
        recorded_at: "2026-07-19T12:00:00Z",
      },
      {
        score: 66,
        followers: 11800,
        engagement: 3.1,
        recorded_at: "2026-06-19T12:00:00Z",
      },
    ]);

    expect(summary).toEqual({
      latestScore: 72,
      scoreDelta: 6,
      followers: 12500,
      followersDelta: 700,
      engagement: 3.4,
      observedAt: "2026-07-19T12:00:00Z",
    });
  });

  it("returns null deltas when there is no comparable prior observation", () => {
    const summary = summarizeProgression([
      {
        score: 51,
        followers: null,
        engagement: null,
        recorded_at: "2026-07-19T12:00:00Z",
      },
    ]);

    expect(summary.scoreDelta).toBeNull();
    expect(summary.followersDelta).toBeNull();
  });
});
