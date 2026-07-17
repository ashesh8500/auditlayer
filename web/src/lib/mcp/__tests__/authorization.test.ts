import { describe, expect, it } from "vitest";

import { parseAuthorizationId } from "../authorization";

describe("OAuth authorization IDs", () => {
  it("accepts Supabase URL safe authorization tokens", () => {
    expect(parseAuthorizationId("AbCdEfGhIjKlMnOpQrStUvWxYz_12345")).toBe(
      "AbCdEfGhIjKlMnOpQrStUvWxYz_12345",
    );
  });

  it("rejects missing, malformed, and oversized values", () => {
    expect(() => parseAuthorizationId("")).toThrow("Invalid authorization request");
    expect(() => parseAuthorizationId("contains spaces")).toThrow("Invalid authorization request");
    expect(() => parseAuthorizationId("a".repeat(201))).toThrow("Invalid authorization request");
  });
});
