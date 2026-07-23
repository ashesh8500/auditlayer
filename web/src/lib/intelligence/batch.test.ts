import { describe, it, expect } from "vitest";
import {
  validateBatch,
  checkInFlightChannels,
  summarizeBatchTypes,
  estimateBatchDuration,
} from "./batch";
import type { BatchSubmission, ChannelSummary } from "./types";

// ---- Helpers ----

function mkChannel(
  id: string,
  platform: "instagram" | "website" = "instagram",
): ChannelSummary {
  return {
    id,
    platform,
    handle: platform === "instagram" ? `user_${id}` : "",
    url: platform === "website" ? `https://${id}.com` : null,
    ownershipStatus: "managed",
    displayName: `Channel ${id}`,
    avatarUrl: null,
    connected: false,
    subjectId: "subj-1",
  };
}

function mkBatch(requests: { channelId: string; reportType?: string }[]): BatchSubmission {
  return {
    subjectId: "subj-1",
    briefVersionId: "bv-1",
    changeNotes: "No changes.",
    requests: requests.map((r) => ({
      channelId: r.channelId,
      reportType: (r.reportType as any) ?? "standard",
      forceRefresh: false,
    })),
  };
}

// ---- Tests ----

describe("validateBatch", () => {
  it("rejects empty batch", () => {
    const result = validateBatch(
      mkBatch([]),
      [mkChannel("ch-1")],
      "starter",
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Select at least one channel to audit.");
  });

  it("validates a single valid request", () => {
    const channels = [mkChannel("ch-1")];
    const result = validateBatch(mkBatch([{ channelId: "ch-1" }]), channels, "starter");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.review).not.toBeNull();
    expect(result.review!.auditCount).toBe(1);
  });

  it("rejects channel not in subject", () => {
    const channels = [mkChannel("ch-1")];
    const result = validateBatch(
      mkBatch([{ channelId: "ch-missing" }]),
      channels,
      "starter",
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("not found");
  });

  it("detects duplicate channels within batch", () => {
    const channels = [mkChannel("ch-1")];
    const result = validateBatch(
      mkBatch([
        { channelId: "ch-1" },
        { channelId: "ch-1" },
      ]),
      channels,
      "starter",
    );
    // Still valid but review shows duplicates
    expect(result.review?.duplicateChannelNames.length).toBeGreaterThan(0);
  });

  it("detects in-flight channel conflicts", () => {
    const channels = [mkChannel("ch-1"), mkChannel("ch-2")];
    const inFlight = new Set(["ch-1"]);
    const result = validateBatch(
      mkBatch([{ channelId: "ch-1" }, { channelId: "ch-2" }]),
      channels,
      "starter",
      inFlight,
    );
    expect(result.review?.duplicateChannelNames).toContain("Channel ch-1");
  });

  it("warns when report type exceeds plan limits", () => {
    const channels = [mkChannel("ch-1")];
    const result = validateBatch(
      mkBatch([{ channelId: "ch-1", reportType: "extended" }]),
      channels,
      "starter", // starter only gets pulse + standard
    );
    // valid=false because entitlement warning
    expect(result.valid).toBe(false);
    expect(result.review?.entitlementWarnings?.length).toBeGreaterThan(0);
  });
});

describe("checkInFlightChannels", () => {
  it("returns channels that are currently in-flight", () => {
    const inFlight = new Set(["ch-1", "ch-3"]);
    const result = checkInFlightChannels(["ch-1", "ch-2", "ch-3"], inFlight);
    expect(result).toEqual(["ch-1", "ch-3"]);
  });

  it("returns empty array when none are in-flight", () => {
    const result = checkInFlightChannels(["ch-1", "ch-2"], new Set());
    expect(result).toHaveLength(0);
  });
});

describe("summarizeBatchTypes", () => {
  it("counts report types correctly", () => {
    const result = summarizeBatchTypes([
      { channelId: "a", reportType: "pulse", forceRefresh: false },
      { channelId: "b", reportType: "standard", forceRefresh: false },
      { channelId: "c", reportType: "pulse", forceRefresh: false },
    ]);
    expect(result).toEqual({ pulse: 2, standard: 1 });
  });
});

describe("estimateBatchDuration", () => {
  it("returns ~2 min for 1 audit", () => {
    expect(estimateBatchDuration(1)).toContain("2 minutes");
  });

  it("returns ~4 min for 2 audits", () => {
    expect(estimateBatchDuration(2)).toContain("4 minutes");
  });

  it("returns ~6 min for 3+ audits", () => {
    expect(estimateBatchDuration(5)).toContain("6 minutes");
  });
});
