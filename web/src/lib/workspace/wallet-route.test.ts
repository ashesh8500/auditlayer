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
  it("returns a validated non-Stripe Free wallet without a legacy read", async () => {
    const money={currency:"USD",microusd:0};
    const wallet={owner_id:"00000000-0000-4000-8000-000000000001",policy_version:"P-01.v1",currency:"USD",pricing_version:"ALM-2026-09.v1",commercial_plan:"free",period_source:"calendar_month_utc",subscription_id:null,period_start:"2026-09-01T00:00:00Z",period_end:"2026-10-01T00:00:00Z",balance:money,reserved:money,consumed_this_cycle:money,purchased_this_cycle:money,upstream_exposure_this_cycle:money,lots:[]};
    mocks.profile.mockResolvedValue({id:wallet.owner_id}); mocks.rpc.mockClear();
    mocks.rpc.mockImplementation(async (name:string)=>({data:name==="commercial_credit_wallet"?wallet:null,error:null}));
    const response=await GET(); expect(response.status).toBe(200);
    expect((await response.json()).wallet).toEqual(wallet);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("does not return malformed or foreign service data", async () => {
    mocks.rpc.mockResolvedValue({ data: { owner_id: "foreign" }, error: null });
    expect((await GET()).status).toBe(503);
  });
});
