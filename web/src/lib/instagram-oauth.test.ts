import { describe, expect, it, vi } from "vitest";

import { completeInstagramOAuth } from "./instagram-oauth";

const config = {
  appId: "1624742575301528",
  appSecret: "test-secret",
  redirectUri: "https://auditlayermedia.com/api/auth/instagram/callback",
};

describe("completeInstagramOAuth", () => {
  it("exchanges a direct Instagram code without losing a large scoped user id", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "IGA-short",
            user_id: "17841499999999999",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "IGA-long", expires_in: 5_184_000 }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "17841499999999999",
            username: "auditlayermedia",
            account_type: "MEDIA_CREATOR",
            followers_count: 1234,
            media_count: 87,
          }),
          { status: 200 },
        ),
      );

    const result = await completeInstagramOAuth("authorization-code", {
      ...config,
      fetchImpl,
    });

    expect(result).toEqual({
      accessToken: "IGA-long",
      igUserId: "17841499999999999",
      igUsername: "auditlayermedia",
      accountType: "CREATOR",
      followersCount: 1234,
      mediaCount: 87,
      expiresIn: 5_184_000,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(String(fetchImpl.mock.calls[0]?.[1]?.body)).toContain(
      "client_id=1624742575301528",
    );
    expect(String(fetchImpl.mock.calls[0]?.[1]?.body)).toContain(
      "redirect_uri=https%3A%2F%2Fauditlayermedia.com%2Fapi%2Fauth%2Finstagram%2Fcallback",
    );
  });

  it("rejects accounts that are not professional accounts", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "IGA-short", user_id: "123" }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "IGA-long", expires_in: 5_184_000 }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "123",
            username: "personalaccount",
            account_type: "PERSONAL",
          }),
          { status: 200 },
        ),
      );

    await expect(
      completeInstagramOAuth("authorization-code", { ...config, fetchImpl }),
    ).rejects.toThrow("instagram_professional_account_required");
  });
});
