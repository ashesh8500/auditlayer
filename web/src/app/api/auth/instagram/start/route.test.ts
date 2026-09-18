import { beforeEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import { getSession } from "@/lib/auth";
import {
  createInstagramOAuthState,
  instagramOAuthServerConfig,
} from "@/lib/instagram-oauth-config";
import { captureWebFailure } from "@/lib/sentry";
import { GET } from "./route";

import { createClient } from "@/lib/supabase/server";
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/instagram-oauth-config", () => ({
  createInstagramOAuthState: vi.fn(),
  INSTAGRAM_OAUTH_STATE_COOKIE: "alm_instagram_oauth_state",
  INSTAGRAM_OAUTH_STATE_MAX_AGE_SECONDS: 600,
  instagramOAuthServerConfig: vi.fn(),
}));
vi.mock("@/lib/sentry", () => ({ captureWebFailure: vi.fn() }));

const getSessionMock = vi.mocked(getSession);
const createInstagramOAuthStateMock = vi.mocked(createInstagramOAuthState);
const instagramOAuthServerConfigMock = vi.mocked(instagramOAuthServerConfig);
const captureWebFailureMock = vi.mocked(captureWebFailure);

beforeEach(() => {
  getSessionMock.mockReset();
  createInstagramOAuthStateMock.mockReset();
  instagramOAuthServerConfigMock.mockReset();
  captureWebFailureMock.mockReset();
});

describe("Instagram OAuth start route", () => {
  it("authorizes targeted reconnect and carries only safe return intent", async () => {
    getSessionMock.mockResolvedValue({ id: "owner-123" } as never);
    createInstagramOAuthStateMock.mockReturnValue("state-456");
    instagramOAuthServerConfigMock.mockReturnValue({ appId: "app", appSecret: "secret", redirectUri: "https://example.com/callback" });
    const eq = vi.fn().mockReturnThis();
    const query = { select: vi.fn().mockReturnThis(), eq, maybeSingle: vi.fn().mockResolvedValue({ data: { id: "11111111-1111-4111-8111-111111111111", ig_user_id: "ig-1" }, error: null }) };
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue(query) } as never);
    const response = await GET(new NextRequest("https://auditlayermedia.com/api/auth/instagram/start?connection_id=11111111-1111-4111-8111-111111111111&return_to=/subjects"));
    expect(query.select).toHaveBeenCalledWith("id,ig_user_id::text");
    expect(eq).toHaveBeenCalledWith("user_id", "owner-123");
    expect(JSON.parse(response.cookies.get("alm_instagram_oauth_state")!.value)).toMatchObject({ connectionId: "11111111-1111-4111-8111-111111111111", igUserId: "ig-1", returnTo: "/subjects" });
    query.maybeSingle.mockResolvedValue({ data: null as never, error: null });
    const denied = await GET(new NextRequest("https://auditlayermedia.com/api/auth/instagram/start?connection_id=11111111-1111-4111-8111-111111111111"));
    expect(new URL(denied.headers.get("location")!).searchParams.get("instagram_error")).toBe("connection_unavailable");
    expect(denied.cookies.get("alm_instagram_oauth_state")).toBeUndefined();
  });
  it.each(["https://evil.test", "//evil.test", "/admin", "/subjects/../admin", "/subjects?next=evil", "/settings/connections%0a"])("rejects unsafe return path %s", async (returnTo) => {
    getSessionMock.mockResolvedValue({ id: "owner-123" } as never);
    createInstagramOAuthStateMock.mockReturnValue("state-456");
    instagramOAuthServerConfigMock.mockReturnValue({ appId: "app", appSecret: "secret", redirectUri: "https://example.com/callback" });
    const response = await GET(new NextRequest(`https://auditlayermedia.com/api/auth/instagram/start?return_to=${encodeURIComponent(returnTo)}`));
    expect(JSON.parse(response.cookies.get("alm_instagram_oauth_state")!.value).returnTo).toBe("/settings/connections");
  });
  it("sets a short-lived secure user-bound state cookie and requests only approved scopes", async () => {
    getSessionMock.mockResolvedValue({ id: "owner-123" } as never);
    createInstagramOAuthStateMock.mockReturnValue("state-456");
    instagramOAuthServerConfigMock.mockReturnValue({
      appId: "1624742575301528",
      appSecret: "server-secret",
      redirectUri: "https://auditlayermedia.com/api/auth/instagram/callback",
    });

    const response = await GET(
      new NextRequest("https://auditlayermedia.com/api/auth/instagram/start"),
    );
    const location = new URL(response.headers.get("location") ?? "");
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(307);
    expect(location.origin).toBe("https://www.instagram.com");
    expect(location.searchParams.get("scope")).toBe(
      "instagram_business_basic,instagram_business_manage_insights",
    );
    expect(location.searchParams.get("state")).toBe("state-456");
    const intent = JSON.parse(response.cookies.get("alm_instagram_oauth_state")!.value);
    expect(intent).toMatchObject({ ownerId: "owner-123", state: "state-456", returnTo: "/settings/connections" });
    expect(intent.expiresAt).toBeGreaterThan(Date.now());
    expect(setCookie).toContain("Max-Age=600");
    expect(setCookie).toContain("Path=/api/auth/instagram/callback");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie).not.toContain("server-secret");
  });

  it("captures configuration failure with fixed safe Sentry dimensions", async () => {
    const error = new Error("private configuration detail");
    getSessionMock.mockResolvedValue({ id: "owner-123" } as never);
    instagramOAuthServerConfigMock.mockImplementation(() => {
      throw error;
    });

    const response = await GET(
      new NextRequest("https://auditlayermedia.com/api/auth/instagram/start"),
    );

    expect(new URL(response.headers.get("location") ?? "").searchParams.get("instagram_error")).toBe(
      "not_configured",
    );
    expect(captureWebFailureMock).toHaveBeenCalledWith(error, {
      surface: "instagram_oauth",
      operation: "oauth_start",
      status: "failed",
      errorClass: "OAuthConfigError",
    });
  });
});
