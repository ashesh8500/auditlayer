import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.join(process.cwd(), "src/components/instagram-connect.tsx"),
  "utf8",
);

describe("Instagram reviewer-visible connection state", () => {
  it("states the read-only Insights purpose, limits, provenance, and partial-grant error", () => {
    expect(source).toContain("profile, recent-content, and reach insights");
    expect(source).toContain("Connected Instagram Graph API data");
    expect(source).toContain("only when Instagram granted Insights access and returned it");
    expect(source).toContain("cannot publish, edit, comment, follow, message, or manage advertising");
    expect(source).toContain("instagram_permissions_not_granted");
    expect(source).not.toContain("Tokens stay server-side");
  });

  it("renders nullable counts truthfully instead of coercing missing metrics to zero", () => {
    expect(source).toContain('formatMetric(connectedAccount.followers_count, "followers")');
    expect(source).toContain('formatMetric(connectedAccount.media_count, "posts")');
    expect(source).toContain('return `${label} unavailable`');
  });
});
