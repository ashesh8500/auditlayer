import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({profile:vi.fn(),rpc:vi.fn(),read:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireProfile:m.profile}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({rpc:m.rpc})}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({rpc:m.read})}));
import { freeWallet } from "../commercial-wallet.fixture";
import { claimFreeAllowance } from "./commercial";
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("ALM_COMMERCIAL_FREE_ENABLED","1");m.profile.mockResolvedValue({id:"owner"});});
it("fails closed before writes when enrollment is disabled",async()=>{
 vi.stubEnv("ALM_COMMERCIAL_FREE_ENABLED",""); expect((await claimFreeAllowance()).ok).toBe(false);expect(m.rpc).not.toHaveBeenCalled();
});
it("binds only the signed-in owner and never reports an unverified grant",async()=>{
 m.rpc.mockResolvedValue({data:"cycle",error:null});m.read.mockResolvedValue({data:null,error:null});
 expect((await claimFreeAllowance()).ok).toBe(false);
 expect(m.rpc).toHaveBeenCalledWith("commercial_free_grant",{p:{owner_id:"owner"}});
});
it("does not write on an expired session",async()=>{
 m.profile.mockRejectedValue(new Error("expired"));expect((await claimFreeAllowance()).ok).toBe(false);expect(m.rpc).not.toHaveBeenCalled();
});
it("confirms only a current owner-scoped Free wallet after the grant",async()=>{
 m.profile.mockResolvedValue({id:freeWallet.owner_id});
 m.rpc.mockResolvedValue({data:"cycle",error:null});
 m.read.mockResolvedValue({data:{...freeWallet,period_end:"2033-10-01T00:00:00Z"},error:null});
 expect(await claimFreeAllowance()).toEqual({ok:true});
 expect(m.read).toHaveBeenCalledWith("commercial_credit_wallet");
});
