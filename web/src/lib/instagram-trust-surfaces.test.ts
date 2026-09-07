import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Instagram public trust surfaces", () => {
  it("describes optional read-only reach use and truthful unavailable metrics", () => {
    const privacy = read("src/app/privacy/page.tsx");
    const support = read("src/app/support/page.tsx");

    expect(privacy).toContain("profile, recent-content, and reach metrics");
    expect(privacy).toContain("we show it as unavailable rather than zero");
    expect(support).toContain(
      "Approve both read-only profile access and read-only Insights access",
    );
  });

  it("keeps implementation and exact permission codes out of public copy", () => {
    const publicCopy = [
      read("src/app/privacy/page.tsx"),
      read("src/app/data-deletion/page.tsx"),
      read("src/app/support/page.tsx"),
    ].join("\n");

    for (const internalTerm of [
      "access token",
      "connection metadata",
      "server-side",
      "owner-scoped",
      "instagram_business_basic",
      "instagram_business_manage_insights",
    ]) {
      expect(publicCopy).not.toContain(internalTerm);
    }
  });
});

describe("Instagram App Review runbook", () => {
  it("records the exact permissions, current token shape, validation, and reviewer path", () => {
    const runbook = read("../docs/instagram-app-review.md");

    expect(runbook).toContain("`instagram_business_basic`");
    expect(runbook).toContain("`instagram_business_manage_insights`");
    expect(runbook).toContain("exactly one `data` record");
    expect(runbook).toContain("Its `access_token`, `user_id`, and `permissions`");
    expect(runbook).toContain("reject the connection before persistence");
    expect(runbook).toContain("/dashboard");
    expect(runbook).toContain("Disconnect and delete access");
  });
});
