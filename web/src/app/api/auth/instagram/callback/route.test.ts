import { beforeEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import { isSupabaseConfigured } from "@/lib/env";
import { completeInstagramOAuth } from "@/lib/instagram-oauth";
import { instagramOAuthServerConfig } from "@/lib/instagram-oauth-config";
import { captureWebFailure } from "@/lib/sentry";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { GET } from "./route";

vi.mock("@/lib/env", () => ({ isSupabaseConfigured: vi.fn() }));
vi.mock("@/lib/instagram-oauth", () => ({ completeInstagramOAuth: vi.fn() }));
vi.mock("@/lib/instagram-oauth-config", () => ({
  INSTAGRAM_OAUTH_STATE_COOKIE: "alm_instagram_oauth_state",
  instagramOAuthServerConfig: vi.fn(),
}));
vi.mock("@/lib/sentry", () => ({ captureWebFailure: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const isSupabaseConfiguredMock = vi.mocked(isSupabaseConfigured);
const createClientMock = vi.mocked(createClient);
const createAdminClientMock = vi.mocked(createAdminClient);
const completeInstagramOAuthMock = vi.mocked(completeInstagramOAuth);
const instagramOAuthServerConfigMock = vi.mocked(instagramOAuthServerConfig);
const captureWebFailureMock = vi.mocked(captureWebFailure);

function callbackRequest(query = "code=code-123&state=state-456") {
  return new NextRequest(
    `https://auditlayermedia.com/api/auth/instagram/callback?${query}`,
    {
      headers: {
        cookie: "alm_instagram_oauth_state=owner-123%3Astate-456",
      },
    },
  );
}

beforeEach(() => {
  isSupabaseConfiguredMock.mockReset();
  createClientMock.mockReset();
  createAdminClientMock.mockReset();
  completeInstagramOAuthMock.mockReset();
  instagramOAuthServerConfigMock.mockReset();
  captureWebFailureMock.mockReset();
  isSupabaseConfiguredMock.mockReturnValue(true);
});

describe("Instagram OAuth callback route", () => {
  it("clears secure state and fails closed when session lookup throws", async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockRejectedValue(new Error("auth provider unavailable")),
      },
    } as never);

    const response = await GET(callbackRequest());
    const location = new URL(response.headers.get("location") ?? "");
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("instagram_error")).toBe("not_authenticated");
    expect(setCookie).toContain("alm_instagram_oauth_state=");
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("Path=/api/auth/instagram/callback");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=lax");
    expect(completeInstagramOAuthMock).not.toHaveBeenCalled();
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(captureWebFailureMock).toHaveBeenCalledWith(expect.any(Error), {
      surface: "instagram_oauth",
      operation: "oauth_callback",
      status: "failed",
      errorClass: "OAuthExchangeError",
    });
  });

  it("rejects mismatched user-bound state before exchange and clears the cookie", async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "owner-123" } },
          error: null,
        }),
      },
    } as never);

    const response = await GET(callbackRequest("code=code-123&state=wrong-state"));
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.searchParams.get("instagram_error")).toBe("invalid_state");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(completeInstagramOAuthMock).not.toHaveBeenCalled();
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(captureWebFailureMock).toHaveBeenCalledWith(expect.any(Error), {
      surface: "instagram_oauth",
      operation: "oauth_callback",
      status: "rejected",
      errorClass: "OAuthExchangeError",
    });
  });

  it("returns a dedicated error and clears state when Insights permission is missing", async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "owner-123" } },
          error: null,
        }),
      },
    } as never);
    instagramOAuthServerConfigMock.mockReturnValue({
      appId: "1624742575301528",
      appSecret: "server-secret",
      redirectUri: "https://auditlayermedia.com/api/auth/instagram/callback",
    });
    completeInstagramOAuthMock.mockRejectedValue(
      new Error("instagram_permissions_not_granted"),
    );

    const response = await GET(callbackRequest());
    const location = new URL(response.headers.get("location") ?? "");
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(location.pathname).toBe("/dashboard");
    expect(location.searchParams.get("instagram_error")).toBe(
      "instagram_permissions_not_granted",
    );
    expect(setCookie).toContain("Max-Age=0");
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(captureWebFailureMock).toHaveBeenCalledWith(expect.any(Error), {
      surface: "instagram_oauth",
      operation: "permission_validation",
      status: "rejected",
      errorClass: "OAuthExchangeError",
    });
  });

  it("persists a validated professional connection through one owner-scoped RPC", async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "owner-123" } },
          error: null,
        }),
      },
    } as never);
    const config = {
      appId: "1624742575301528",
      appSecret: "server-secret",
      redirectUri: "https://auditlayermedia.com/api/auth/instagram/callback",
    };
    instagramOAuthServerConfigMock.mockReturnValue(config);
    completeInstagramOAuthMock.mockResolvedValue({
      accessToken: "IGA-long-secret",
      igUserId: "17841499999999999",
      igUsername: "reviewer_business",
      accountType: "BUSINESS",
      followersCount: 1200,
      mediaCount: 84,
      expiresIn: 5_184_000,
      grantedPermissions: [
        "instagram_business_basic",
        "instagram_business_manage_insights",
      ],
    });
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    createAdminClientMock.mockReturnValue({ rpc } as never);

    const response = await GET(callbackRequest());
    const location = new URL(response.headers.get("location") ?? "");
    const serializedResponse = `${response.headers.get("location")} ${response.headers.get("set-cookie")}`;

    expect(completeInstagramOAuthMock).toHaveBeenCalledWith("code-123", config);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("persist_instagram_connection", {
      p_user_id: "owner-123",
      p_ig_user_id: "17841499999999999",
      p_ig_username: "reviewer_business",
      p_long_lived_token: "IGA-long-secret",
      p_long_lived_expires_at: expect.any(String),
      p_account_type: "BUSINESS",
      p_followers_count: 1200,
      p_media_count: 84,
      p_graph_api_family: "instagram",
    });
    expect(location.searchParams.get("instagram_connected")).toBe("reviewer_business");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(serializedResponse).not.toContain("IGA-long-secret");
    expect(serializedResponse).not.toContain("server-secret");
  });

  it("captures transactional persistence failure without owner or token context", async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "owner-123" } },
          error: null,
        }),
      },
    } as never);
    instagramOAuthServerConfigMock.mockReturnValue({
      appId: "1624742575301528",
      appSecret: "server-secret",
      redirectUri: "https://auditlayermedia.com/api/auth/instagram/callback",
    });
    completeInstagramOAuthMock.mockResolvedValue({
      accessToken: "IGA-long-secret",
      igUserId: "17841499999999999",
      igUsername: "reviewer_business",
      accountType: "BUSINESS",
      followersCount: 1200,
      mediaCount: 84,
      expiresIn: 5_184_000,
      grantedPermissions: [
        "instagram_business_basic",
        "instagram_business_manage_insights",
      ],
    });
    createAdminClientMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "private-db-code" } }),
    } as never);

    const response = await GET(callbackRequest());

    expect(new URL(response.headers.get("location") ?? "").searchParams.get("instagram_error")).toBe(
      "instagram_connection_store_failed",
    );
    expect(captureWebFailureMock).toHaveBeenCalledWith(expect.any(Error), {
      surface: "instagram_persistence",
      operation: "connection_persist",
      status: "failed",
      errorClass: "InstagramConnectionStoreError",
    });
    expect(JSON.stringify(captureWebFailureMock.mock.calls)).not.toContain("owner-123");
    expect(JSON.stringify(captureWebFailureMock.mock.calls)).not.toContain("IGA-long-secret");
  });
});
