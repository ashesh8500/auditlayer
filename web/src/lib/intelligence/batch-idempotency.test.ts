import { describe, expect, it } from "vitest";

import {
  buildBatchFingerprint,
  type BatchAuditIntent,
} from "./batch-idempotency";

function audit(overrides: Partial<BatchAuditIntent> = {}): BatchAuditIntent {
  return {
    channelId: "instagram-channel",
    channelType: "instagram",
    channelLocator: "auditlayermedia",
    platform: "instagram",
    reportType: "standard",
    forceRefresh: false,
    ...overrides,
  };
}

function fingerprint(
  audits: BatchAuditIntent[],
  overrides: { briefVersionId?: string; changeNotes?: string } = {},
): string {
  return buildBatchFingerprint({
    subjectIdentity: "subject:11111111-1111-4111-8111-111111111111",
    briefVersionId: overrides.briefVersionId ?? "brief-v1",
    changeNotes: overrides.changeNotes ?? "Initial notes",
    audits,
  });
}

describe("buildBatchFingerprint", () => {
  it("is stable for an identical semantic payload regardless of audit order", () => {
    const first = audit();
    const second = audit({
      channelId: "youtube-channel",
      channelType: "youtube",
      channelLocator: "UC123",
      platform: "youtube",
      reportType: "pulse",
    });
    expect(fingerprint([first, second])).toBe(fingerprint([second, first]));
  });

  it.each([
    ["channel id", { channelId: "other-channel" }],
    ["channel type", { channelType: "website" }],
    ["channel locator", { channelLocator: "other-handle" }],
    ["platform", { platform: "youtube" }],
    ["report type", { reportType: "pulse" }],
    ["force refresh", { forceRefresh: true }],
  ])("changes when %s changes", (_label, overrides) => {
    expect(fingerprint([audit()])).not.toBe(fingerprint([audit(overrides)]));
  });

  it("does not truncate change notes when identifying the payload", () => {
    const prefix = "x".repeat(80);
    expect(fingerprint([audit()], { changeNotes: `${prefix}a` })).not.toBe(
      fingerprint([audit()], { changeNotes: `${prefix}b` }),
    );
  });

  it("uses a fixed-size SHA-256 key suitable for database indexing", () => {
    expect(fingerprint([audit({ channelLocator: "x".repeat(10_000) })])).toMatch(
      /^alm-batch-v4:[a-f0-9]{64}$/,
    );
  });
});
