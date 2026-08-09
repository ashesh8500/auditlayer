/**
 * Canonical channel locators for dedupe + autocomplete.
 * Websites collapse to https://host[/path] (no trailing slash).
 * Social handles collapse to lowercase bare username (no @).
 */

import type { ChannelPlatform, ChannelSummary } from "./types";

export function canonicalizeWebsiteLocator(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "");
    const cleanPath = path === "/" ? "" : path;
    return `https://${host}${cleanPath}`;
  } catch {
    return trimmed
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/+$/, "");
  }
}

export function canonicalizeSocialLocator(raw: string): string {
  return raw
    .trim()
    .replace(/^@+/, "")
    .replace(/^https?:\/\/(www\.)?(instagram|tiktok|x|twitter|linkedin|youtube)\.com\//i, "")
    .replace(/\/+$/, "")
    .split(/[/?#]/)[0]
    ?.toLowerCase() ?? "";
}

export function channelDedupeKey(
  platform: ChannelPlatform,
  locator: string,
): string {
  if (platform === "website") {
    return `website:${canonicalizeWebsiteLocator(locator)}`;
  }
  return `${platform}:${canonicalizeSocialLocator(locator)}`;
}

export function displayWebsiteHost(locator: string): string {
  return canonicalizeWebsiteLocator(locator).replace(/^https?:\/\//, "");
}

/**
 * Prefer connected > managed > observed; then prefer https:// form; then oldest id.
 */
export function dedupeChannels(channels: ChannelSummary[]): ChannelSummary[] {
  const rank = (c: ChannelSummary) => {
    if (c.ownershipStatus === "connected" || c.connected) return 0;
    if (c.ownershipStatus === "managed") return 1;
    return 2;
  };

  const byKey = new Map<string, ChannelSummary>();
  for (const channel of channels) {
    const locator =
      channel.platform === "website"
        ? channel.url || channel.displayName || ""
        : channel.handle || channel.displayName || "";
    const key = channelDedupeKey(channel.platform, locator);
    if (!key.endsWith(":")) {
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, normalizeChannelSummary(channel));
        continue;
      }
      const preferNew =
        rank(channel) < rank(existing) ||
        (rank(channel) === rank(existing) &&
          channel.platform === "website" &&
          (channel.url ?? "").startsWith("https://") &&
          !(existing.url ?? "").startsWith("https://"));
      if (preferNew) byKey.set(key, normalizeChannelSummary(channel));
    }
  }
  return [...byKey.values()];
}

function normalizeChannelSummary(channel: ChannelSummary): ChannelSummary {
  if (channel.platform === "website") {
    const url = canonicalizeWebsiteLocator(
      channel.url || channel.displayName || "",
    );
    return {
      ...channel,
      url,
      handle: "",
      displayName: displayWebsiteHost(url),
    };
  }
  const handle = canonicalizeSocialLocator(
    channel.handle || channel.displayName || "",
  );
  return {
    ...channel,
    handle,
    displayName: channel.displayName || handle,
  };
}

/** Match typed input against known channels for autocomplete. */
export function suggestChannelsForInput(
  input: string,
  channels: ChannelSummary[],
  limit = 5,
): ChannelSummary[] {
  const q = input.trim().toLowerCase();
  if (q.length < 2) return [];
  const websiteKey = canonicalizeWebsiteLocator(q);
  const socialKey = canonicalizeSocialLocator(q);

  return channels
    .filter((ch) => {
      if (ch.platform === "website") {
        const host = displayWebsiteHost(ch.url || "");
        return (
          host.includes(q.replace(/^https?:\/\//, "").replace(/^www\./, "")) ||
          (websiteKey &&
            canonicalizeWebsiteLocator(ch.url || "") === websiteKey)
        );
      }
      const handle = ch.handle.toLowerCase();
      return (
        handle.includes(socialKey || q.replace(/^@/, "")) ||
        (ch.displayName || "").toLowerCase().includes(q)
      );
    })
    .slice(0, limit);
}

export function inputLooksLikeWebsite(input: string): boolean {
  const t = input.trim().toLowerCase();
  if (!t || t.startsWith("@")) return false;
  if (t.includes(" ") && !t.includes(".")) return false;
  if (
    t.startsWith("http://") ||
    t.startsWith("https://") ||
    t.startsWith("www.")
  ) {
    return true;
  }
  if (!/^[a-z0-9.-]+$/i.test(t) || !t.includes(".")) return false;

  // Dots are valid in Instagram usernames. Keep the platform detector's
  // conservative domain heuristic here too: short suffixes look like TLDs,
  // while a longer final segment (muskann.kaurr) is a social handle.
  const lastSegment = t.split(".").pop() ?? "";
  return lastSegment.length >= 2 && lastSegment.length <= 4;
}

function knownSocialProfile(input: string): {
  platform: Exclude<ChannelPlatform, "website">;
  handle: string;
} | null {
  const raw = input.trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const platformByHost: Record<
      string,
      Exclude<ChannelPlatform, "website">
    > = {
      "instagram.com": "instagram",
      "tiktok.com": "tiktok",
      "x.com": "x",
      "twitter.com": "x",
      "linkedin.com": "linkedin",
      "youtube.com": "youtube",
    };
    const platform = platformByHost[host];
    if (!platform) return null;

    const parts = url.pathname.split("/").filter(Boolean);
    let candidate = parts[0] ?? "";
    if (
      (platform === "linkedin" &&
        ["in", "company", "school"].includes(candidate.toLowerCase())) ||
      (platform === "youtube" &&
        ["channel", "c", "user"].includes(candidate.toLowerCase()))
    ) {
      candidate = parts[1] ?? "";
    }
    const handle = canonicalizeSocialLocator(candidate.replace(/^@/, ""));
    return handle ? { platform, handle } : null;
  } catch {
    return null;
  }
}

export function manualChannelFromInput(
  input: string,
  subjectId: string,
): ChannelSummary | null {
  const raw = input.trim();
  if (!raw) return null;
  const socialProfile = knownSocialProfile(raw);
  if (socialProfile) {
    return {
      id: "pending-channel",
      platform: socialProfile.platform,
      handle: socialProfile.handle,
      url: null,
      ownershipStatus: "managed",
      displayName: socialProfile.handle,
      avatarUrl: null,
      connected: false,
      subjectId: subjectId || "pending",
    };
  }
  if (inputLooksLikeWebsite(raw)) {
    const url = canonicalizeWebsiteLocator(raw);
    if (!url) return null;
    return {
      id: "pending-channel",
      platform: "website",
      handle: "",
      url,
      ownershipStatus: "managed",
      displayName: displayWebsiteHost(url),
      avatarUrl: null,
      connected: false,
      subjectId: subjectId || "pending",
    };
  }

  const handle = canonicalizeSocialLocator(raw);
  if (!/^[a-z0-9._]{1,30}$/i.test(handle)) return null;
  return {
    id: "pending-channel",
    platform: "instagram",
    handle,
    url: null,
    ownershipStatus: "managed",
    displayName: handle,
    avatarUrl: null,
    connected: false,
    subjectId: subjectId || "pending",
  };
}
