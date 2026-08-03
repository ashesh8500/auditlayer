import { describe, expect, it } from "vitest";

import {
  canonicalizeWebsiteLocator,
  channelDedupeKey,
  dedupeChannels,
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
