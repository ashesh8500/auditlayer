import {it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({profile:vi.fn(),rpc:vi.fn(),read:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireProfile:m.profile}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({rpc:m.rpc})}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:m.read})})})})})}));
import {quoteCommercialReport,submitCommercialReport} from "./commercial-report";
it("binds authenticated owner, only returns durable quotes, and reads back accepted audit",async()=>{
 vi.stubEnv("ALM_COMMERCIAL_EXECUTION_ENABLED","1");
 m.profile.mockResolvedValue({id:"11111111-1111-4111-8111-111111111111"});
 const input={subject_id:"22222222-2222-4222-8222-222222222222",brief_id:"33333333-3333-4333-8333-333333333333",channel_id:"55555555-5555-4555-8555-555555555555",goal:"growth",report_type:"standard",owner_id:"attacker"};
 m.rpc.mockResolvedValueOnce({data:{id:"44444444-4444-4444-8444-444444444444",retail_microusd:100000,expires_at:"2030-01-01T00:00:00Z"},error:null});
 expect((await quoteCommercialReport(input)).ok).toBe(true);
 expect(m.rpc.mock.calls[0][1].p.owner_id).toBe("11111111-1111-4111-8111-111111111111");
 m.rpc.mockResolvedValueOnce({data:"audit",error:null});m.read.mockResolvedValueOnce({data:{id:"audit"},error:null});
 expect(await submitCommercialReport("44444444-4444-4444-8444-444444444444",true)).toEqual({ok:true,auditId:"audit"});
 expect(m.rpc.mock.calls[1][0]).toBe("commercial_submit");
 vi.unstubAllEnvs();
});
it("closed execution gate cannot enqueue or quote",async()=>{
 m.rpc.mockClear();expect((await quoteCommercialReport({})).ok).toBe(false);expect((await submitCommercialReport("id",true)).ok).toBe(false);expect(m.rpc).not.toHaveBeenCalled();
});
