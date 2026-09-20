import { describe, expect, it, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), get: vi.fn(), set: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/env", () => ({ isSupabaseAdminConfigured: () => true }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.get, set: mocks.set }) }));
import { decideShareAccess } from "./access-boundary";
import { getShareSession } from "./share-access";
const state = { exists: true, mode: "email" as const, revokedAt: null, expiresAt: null, verifiedAt: "2026-01-01", hasVerifiedSession: false, auditReady: true };
describe("share security regressions", () => {
  beforeEach(() => vi.clearAllMocks());
  it("global verified_at never grants a stranger access", () => {
    expect(decideShareAccess(state)).toEqual({ allow: false, reason: "needs_verification" });
  });
  it("malformed expiry fails closed", () => {
    expect(decideShareAccess({ ...state, mode: "public", expiresAt: "bad" }).allow).toBe(false);
  });
  it("literal forged verified cookie is denied without DB access", async () => {
    mocks.get.mockReturnValue({ value: "verified" });
    expect(await getShareSession("valid_token")).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([{ data: true, error: null, expected: true }, { data: true, error: {}, expected: false }, { data: "true", error: null, expected: false }])("only an authoritative boolean session result grants access", async ({ data, error, expected }) => {
    mocks.get.mockReturnValue({ value: "a".repeat(43) });
    mocks.rpc.mockResolvedValue({ data, error });
    expect(await getShareSession("valid_token")).toBe(expected);
  });
  it("DB outages fail closed", async () => {
    mocks.get.mockReturnValue({ value: "a".repeat(43) }); mocks.rpc.mockRejectedValue(new Error("offline"));
    expect(await getShareSession("valid_token")).toBe(false);
  });
  it("opaque sessions require authoritative token-bound DB validation", async () => {
    mocks.get.mockReturnValue({ value: "a".repeat(43) });
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect(await getShareSession("other_token")).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledWith("share_session_valid", expect.objectContaining({ p_token: "other_token" }));
  });
});
