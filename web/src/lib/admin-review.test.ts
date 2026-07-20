import { describe, expect, it } from "vitest";

import { needsFounderAction } from "./admin-review";

describe("needsFounderAction", () => {
  it.each(["needs_review", "blocked", "failed"])(
    "returns true for %s",
    (status) => {
      expect(needsFounderAction(status)).toBe(true);
    },
  );

  it.each(["queued", "running", "ready"])("returns false for %s", (status) => {
    expect(needsFounderAction(status)).toBe(false);
  });
});
