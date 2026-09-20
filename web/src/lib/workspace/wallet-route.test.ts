import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/resources/wallet/route";
const mocks = vi.hoisted(() => ({ profile: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getProfile: mocks.profile }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
describe("owner wallet resource", () => {
  it("denies anonymous reads before SQL", async () => {
    mocks.profile.mockResolvedValue(null); mocks.rpc.mockClear();
    expect((await GET()).status).toBe(401); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("uses the session RPC without a browser owner argument; preserves legacy absence", async () => {
    mocks.profile.mockResolvedValue({ id: "owner" }); mocks.rpc.mockResolvedValue({ data: null, error: null });
    const response = await GET(); const data = await response.json();
    expect(mocks.rpc).toHaveBeenCalledWith("workspace_credit_wallet");
    expect(data).toMatchObject({ ownerId: "owner", wallet: null });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("does not return malformed or foreign service data", async () => {
    mocks.rpc.mockResolvedValue({ data: { owner_id: "foreign" }, error: null });
    expect((await GET()).status).toBe(503);
  });
});
