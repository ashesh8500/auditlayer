import { afterEach, describe, expect, it, vi } from "vitest";

import { completeInstagramOAuth } from "./instagram-oauth";

const config = {
  appId: "1624742575301528",
  appSecret: "test-secret",
  redirectUri: "https://auditlayermedia.com/api/auth/instagram/callback",
};

describe("completeInstagramOAuth", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs only safe response diagnostics for a failed exchange", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({
      error_type: "OAuthException", code: 400,
      error_message: "Invalid client_secret: VERY_PRIVATE_SECRET",
      access_token: "VERY_PRIVATE_TOKEN", user_id: "PRIVATE_USER_ID",
    }), { status: 400 }));
    await expect(completeInstagramOAuth("PRIVATE_CODE", { ...config, fetchImpl }))
      .rejects.toThrow("instagram_token_exchange_failed");
    expect(warning).toHaveBeenCalledWith("Instagram OAuth response rejected", expect.objectContaining({
      httpStatus: 400, upstreamCode: 400, category: "app_secret", hasToken: true, hasUserId: true,
    }));
    expect(JSON.stringify(warning.mock.calls)).not.toContain("PRIVATE");
  });
  it.each(["flat", "envelope"])("parses the %s token response and validates both granted permissions", async (shape) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(shape === "flat" ? {
            access_token: "IGA-short",
            user_id: 17841453481788956,
            permissions: ["instagram_business_basic", "instagram_business_manage_insights"],
          } : {
            data: [{
              access_token: "IGA-short",
              user_id: "17841499999999999",
              permissions: "instagram_business_basic,instagram_business_manage_insights",
            }],
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
            user_id: "17841499999999999",
            username: "auditlayermedia",
            account_type: "Media_Creator",
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
      grantedPermissions: [
        "instagram_business_basic",
        "instagram_business_manage_insights",
      ],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(String(fetchImpl.mock.calls[0]?.[1]?.body)).toContain(
      "client_id=1624742575301528",
    );
    expect(String(fetchImpl.mock.calls[0]?.[1]?.body)).toContain(
      "redirect_uri=https%3A%2F%2Fauditlayermedia.com%2Fapi%2Fauth%2Finstagram%2Fcallback",
    );
    expect(fetchImpl.mock.calls.every((call) => call[1]?.signal instanceof AbortSignal)).toBe(
      true,
    );
    expect(fetchImpl.mock.calls[2]?.[0]).toContain(
      "fields=user_id%2Cusername%2Caccount_type%2Cfollowers_count%2Cmedia_count",
    );
  });

  it.each(["flat", "envelope"])("rejects the %s connection before token extension when Insights was not granted", async (shape) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify(shape === "flat" ? {
          access_token: "IGA-short", user_id: "123", permissions: "instagram_business_basic",
        } : { data: [{
          access_token: "IGA-short", user_id: "123", permissions: "instagram_business_basic",
        }] }),
        { status: 200 },
      ),
    );

    await expect(
      completeInstagramOAuth("authorization-code", { ...config, fetchImpl }),
    ).rejects.toThrow("instagram_permissions_not_granted");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed records and ambiguous token envelopes", async () => {
    const canonicalRecord = {
      access_token: "IGA-short",
      user_id: "123",
      permissions: "instagram_business_basic,instagram_business_manage_insights",
    };
    const malformedPayloads = [
      { data: [] },
      { data: [canonicalRecord, { ...canonicalRecord, user_id: "456" }] },
      null, [], {}, { data: null }, { data: [null] },
      { ...canonicalRecord, data: [] },
      { ...canonicalRecord, access_token: 123 },
      { ...canonicalRecord, user_id: {} },
    ];

    for (const payload of malformedPayloads) {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
        new Response(JSON.stringify(payload), { status: 200 }),
      );

      await expect(
        completeInstagramOAuth("authorization-code", { ...config, fetchImpl }),
      ).rejects.toThrow("instagram_token_exchange_failed");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it("maps a bounded short-token network failure to a safe error class", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("socket failed with sensitive upstream detail"));

    await expect(
      completeInstagramOAuth("authorization-code", {
        ...config,
        fetchImpl,
        timeoutMs: 25,
      }),
    ).rejects.toThrow("instagram_token_exchange_failed");
  });

  it("keeps unavailable profile counts distinct from real zero values", async () => {
    const fetchForProfile = (profile: Record<string, unknown>) =>
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              data: [
                {
                  access_token: "IGA-short",
                  user_id: "123",
                  permissions:
                    "instagram_business_basic,instagram_business_manage_insights",
                },
              ],
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
              user_id: "123",
              username: "professionalaccount",
              account_type: "BUSINESS",
              ...profile,
            }),
            { status: 200 },
          ),
        );

    const unavailable = await completeInstagramOAuth("authorization-code", {
      ...config,
      fetchImpl: fetchForProfile({}),
    });
    const zero = await completeInstagramOAuth("authorization-code", {
      ...config,
      fetchImpl: fetchForProfile({ followers_count: 0, media_count: 0 }),
    });

    expect(unavailable.followersCount).toBeNull();
    expect(unavailable.mediaCount).toBeNull();
    expect(zero.followersCount).toBe(0);
    expect(zero.mediaCount).toBe(0);
  });

  it("rejects accounts that are not professional accounts", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                access_token: "IGA-short",
                user_id: "123",
                permissions:
                  "instagram_business_basic,instagram_business_manage_insights",
              },
            ],
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
            user_id: "123",
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
