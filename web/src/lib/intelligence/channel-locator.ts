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
  if (!t) return false;
  if (t.includes(" ") && !t.includes(".")) return false;
  return (
    t.includes(".") ||
    t.startsWith("http://") ||
    t.startsWith("https://") ||
    t.startsWith("www.")
  );
}
