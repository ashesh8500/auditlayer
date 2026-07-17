import { describe, expect, it } from "vitest";

import { authenticateSupabaseToken } from "../auth";

function unsignedJwt(payload: object): string {
  return [
    Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature",
  ].join(".");
}

describe("MCP bearer authentication", () => {
  it("uses server verified user identity and preserves OAuth client claims", async () => {
    const token = unsignedJwt({
      client_id: "chatgpt-client",
      scope: "openid email",
      exp: 1999999999,
    });

    await expect(
      authenticateSupabaseToken(token, async () => ({ id: "user-one" })),
    ).resolves.toEqual({
      userId: "user-one",
      clientId: "chatgpt-client",
      scopes: ["openid", "email"],
      expiresAt: 1999999999,
    });
  });

  it("rejects a token the Supabase Auth server does not validate", async () => {
    await expect(
      authenticateSupabaseToken("invalid", async () => null),
    ).resolves.toBeNull();
  });
});
