import { describe, expect, it } from "vitest";

import {
  canonicalizeWebsiteLocator,
  channelDedupeKey,
  dedupeChannels,
  inputLooksLikeWebsite,
  manualChannelFromInput,
  suggestChannelsForInput,
} from "./channel-locator";
import type { ChannelSummary } from "./types";

function ch(
  partial: Partial<ChannelSummary> & Pick<ChannelSummary, "id" | "platform">,
): ChannelSummary {
  return {
    handle: "",
    url: null,
    ownershipStatus: "managed",
    displayName: null,
    avatarUrl: null,
    connected: false,
    subjectId: "s1",
    ...partial,
  };
}

describe("canonicalizeWebsiteLocator", () => {
  it("collapses scheme and www variants", () => {
    expect(canonicalizeWebsiteLocator("auditlayermedia.com")).toBe(
      "https://auditlayermedia.com",
    );
    expect(canonicalizeWebsiteLocator("https://www.auditlayermedia.com/")).toBe(
      "https://auditlayermedia.com",
    );
    expect(canonicalizeWebsiteLocator("http://AuditLayerMedia.com")).toBe(
      "https://auditlayermedia.com",
    );
  });
});

describe("inputLooksLikeWebsite", () => {
  it("does not turn a dotted Instagram handle into a fake website", () => {
    expect(inputLooksLikeWebsite("muskann.kaurr")).toBe(false);
    expect(inputLooksLikeWebsite("@muskann.kaurr")).toBe(false);
  });

  it("still recognizes explicit and ordinary website locators", () => {
    expect(inputLooksLikeWebsite("https://auditlayermedia.com")).toBe(true);
    expect(inputLooksLikeWebsite("www.auditlayermedia.com")).toBe(true);
    expect(inputLooksLikeWebsite("auditlayermedia.com")).toBe(true);
  });
});

describe("manualChannelFromInput", () => {
  it("normalizes a dotted bare handle as Instagram", () => {
    expect(manualChannelFromInput("muskann.kaurr", "subject-1")).toMatchObject({
      platform: "instagram",
      handle: "muskann.kaurr",
      url: null,
    });
  });

  it("normalizes a domain as a website", () => {
    expect(manualChannelFromInput("auditlayermedia.com", "subject-1")).toMatchObject({
      platform: "website",
      handle: "",
      url: "https://auditlayermedia.com",
    });
  });

  it("preserves known social profile URLs as social channels", () => {
    expect(
      manualChannelFromInput(
        "https://instagram.com/muskann.kaurr",
        "subject-1",
      ),
    ).toMatchObject({
      platform: "instagram",
      handle: "muskann.kaurr",
      url: null,
    });
    expect(
      manualChannelFromInput("instagram.com/muskann.kaurr", "subject-1"),
    ).toMatchObject({ platform: "instagram", handle: "muskann.kaurr" });
    expect(
      manualChannelFromInput("https://youtube.com/@auditlayer", "subject-1"),
    ).toMatchObject({ platform: "youtube", handle: "auditlayer" });
  });

  it("rejects social content URLs instead of treating route names as handles", () => {
    expect(
      manualChannelFromInput("https://instagram.com/p/ABC123", "subject-1"),
    ).toBeNull();
    expect(
      manualChannelFromInput("https://youtube.com/watch?v=ABC123", "subject-1"),
    ).toBeNull();
  });
});

describe("dedupeChannels", () => {
  it("merges near-identical websites and prefers connected/https", () => {
    const out = dedupeChannels([
      ch({
        id: "1",
        platform: "website",
        url: "auditlayermedia.com",
        ownershipStatus: "managed",
      }),
      ch({
        id: "2",
        platform: "website",
        url: "https://auditlayermedia.com",
        ownershipStatus: "managed",
      }),
      ch({
        id: "3",
        platform: "instagram",
        handle: "auditlayermedia",
        ownershipStatus: "connected",
        connected: true,
      }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((c) => c.platform === "website")?.url).toBe(
      "https://auditlayermedia.com",
    );
  });

  it("uses stable dedupe keys", () => {
    expect(
      channelDedupeKey("website", "https://www.auditlayermedia.com/"),
    ).toBe(channelDedupeKey("website", "auditlayermedia.com"));
  });
});

describe("suggestChannelsForInput", () => {
  it("suggests matching website while typing", () => {
    const channels = [
      ch({
        id: "w",
        platform: "website",
        url: "https://auditlayermedia.com",
        displayName: "auditlayermedia.com",
      }),
    ];
    expect(suggestChannelsForInput("auditlayer", channels)[0]?.id).toBe("w");
    expect(suggestChannelsForInput("https://auditlayermedia.com", channels)[0]?.id).toBe(
      "w",
    );
  });
});
