import { describe, expect, it } from "vitest";

import {
  buildInstagramAuthUrl,
  instagramOAuthStateMatches,
} from "./instagram-oauth-url";

describe("buildInstagramAuthUrl", () => {
  it("builds the direct Instagram Business Login authorization URL", () => {
    const url = new URL(
      buildInstagramAuthUrl({
        appId: "1624742575301528",
        redirectUri: "https://auditlayermedia.com/api/auth/instagram/callback",
        state: "secure-state",
      }),
    );

    expect(url.origin).toBe("https://www.instagram.com");
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("1624742575301528");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://auditlayermedia.com/api/auth/instagram/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("instagram_business_basic");
    expect(url.searchParams.get("state")).toBe("secure-state");
  });

  it("rejects incomplete OAuth configuration", () => {
    expect(() =>
      buildInstagramAuthUrl({
        appId: "",
        redirectUri: "https://auditlayermedia.com/api/auth/instagram/callback",
        state: "secure-state",
      }),
    ).toThrow("instagram_oauth_not_configured");
  });
});

describe("instagramOAuthStateMatches", () => {
  it("accepts only equal non-empty state values", () => {
    expect(instagramOAuthStateMatches("expected", "expected")).toBe(true);
    expect(instagramOAuthStateMatches("expected", "different")).toBe(false);
    expect(instagramOAuthStateMatches("", "")).toBe(false);
    expect(instagramOAuthStateMatches(undefined, "expected")).toBe(false);
  });
});
