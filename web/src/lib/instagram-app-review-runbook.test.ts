import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const runbook = readFileSync(
  path.join(process.cwd(), "..", "docs", "instagram-app-review.md"),
  "utf8",
);

describe("Instagram App Review runbook", () => {
  it("requires known failed connections to reconnect without public fallback", () => {
    expect(runbook).toContain(
      "A known connection that is expired, malformed, missing its explicit Graph API family, or fails token/profile validation must fail closed and require reconnect.",
    );
    expect(runbook).toContain(
      "Known failed connections never fall back to public signals.",
    );
    expect(runbook).toContain(
      "Public-signal fallback is allowed only when no owner-scoped Instagram connection exists.",
    );
  });

  it("makes denominator and unavailable reach proof visible in recording and release checks", () => {
    const denominatorProof =
      "average reach with its explicit successful/eligible denominator";
    const unavailableProof =
      "reach unavailable rather than zero when no eligible Insights succeed";

    expect(runbook.match(new RegExp(denominatorProof, "g"))).toHaveLength(2);
    expect(runbook.match(new RegExp(unavailableProof, "g"))).toHaveLength(2);
    expect(runbook).toContain("8 of 10 eligible posts");
  });

  it("documents the durable auth-failure transition and successful reconnect reset", () => {
    expect(runbook).toContain(
      "An auth/permission failure durably marks only that owner's connection `reconnect_required`.",
    );
    expect(runbook).toContain(
      "Later audits read that state before any Meta request and require reconnect without public fallback.",
    );
    expect(runbook).toContain(
      "Successful owner-scoped OAuth persistence resets the connection to `connected`.",
    );
  });
});
