import { describe, expect, it } from "vitest";

import { reportHtmlToText } from "../report-text";

describe("MCP report extraction", () => {
  it("removes active content and preserves readable section text", () => {
    const html = `<!doctype html><html><head><style>.x{color:red}</style></head><body><h2>Executive Summary</h2><p>Strong authority &amp; trust.</p><script>steal()</script><h2>Quick Wins</h2></body></html>`;

    expect(reportHtmlToText(html)).toBe(
      "Executive Summary Strong authority & trust. Quick Wins",
    );
  });
});
