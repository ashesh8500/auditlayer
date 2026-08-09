import { describe, expect, it } from "vitest";

import { progressStepState } from "./progress-step-state";

describe("progressStepState", () => {
  it("does not mark unfinished phases complete for founder review", () => {
    expect(progressStepState("preparing", "needs_review")).toEqual([
      "stopped",
      "pending",
      "pending",
    ]);
  });

  it("marks every phase complete only when the report is ready", () => {
    expect(progressStepState("finalizing", "ready")).toEqual([
      "complete",
      "complete",
      "complete",
    ]);
  });

  it("marks the active phase without completing future phases", () => {
    expect(progressStepState("analyzing", null)).toEqual([
      "complete",
      "current",
      "pending",
    ]);
  });
});
