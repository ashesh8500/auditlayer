import { describe, expect, it } from "vitest";

import { isSentrySourceMapUploadConfigured, resolveSentryRuntimeIdentity } from "./sentry-config";

describe("resolveSentryRuntimeIdentity", () => {
  it("enables events only when both a DSN and an exact release are present", () => {
    expect(
      resolveSentryRuntimeIdentity({
        dsn: "https://public@example.ingest.sentry.io/1",
        environment: "production",
        release: "3548ec4004fe6796d479108c53683077834dc863",
      }),
    ).toEqual({
      dsn: "https://public@example.ingest.sentry.io/1",
      enabled: true,
      environment: "production",
      release: "3548ec4004fe6796d479108c53683077834dc863",
    });
    expect(
      resolveSentryRuntimeIdentity({
        dsn: "https://public@example.ingest.sentry.io/1",
        environment: "production",
      }).enabled,
    ).toBe(false);
  });
});

describe("isSentrySourceMapUploadConfigured", () => {
  it("requires upload credentials and the same exact release as runtime events", () => {
    const configured = {
      authToken: "configured",
      org: "auditlayer",
      project: "web",
      release: "3548ec4004fe6796d479108c53683077834dc863",
    };
    expect(isSentrySourceMapUploadConfigured(configured)).toBe(true);
    expect(isSentrySourceMapUploadConfigured({ ...configured, release: undefined })).toBe(false);
    expect(isSentrySourceMapUploadConfigured({ ...configured, authToken: undefined })).toBe(false);
  });
});
