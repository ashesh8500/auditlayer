import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({ legacy:vi.fn(), retry:vi.fn(), profile:vi.fn() }));
vi.mock("server-only",()=>({}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireProfile:mocks.profile}));
vi.mock("@/lib/env",()=>({isSupabaseAdminConfigured:()=>true}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({})}));
vi.mock("@/lib/intelligence/subjects",()=>({listChannelsForSubject:vi.fn(),listBriefVersionsForSubject:vi.fn()}));
vi.mock("@/lib/intelligence/api",async original=>({...await original<typeof import("@/lib/intelligence/api")>(),rpcSubmitEntitledAuditBatch:mocks.legacy,rpcLookupEntitledAuditBatchRetry:mocks.retry}));
import { prepareAndSubmitIntelligenceBatch } from "@/lib/actions/intelligence";
beforeEach(()=>{vi.clearAllMocks();mocks.profile.mockResolvedValue({id:"11111111-1111-4111-8111-111111111111"});});
it("does not silently route explicit workspace payment consent into legacy audit admission",async()=>{
 const input={submission:{subjectId:"11111111-1111-4111-8111-111111111111",briefVersionId:"",changeNotes:"",requests:[{channelId:"ig",reportType:"standard" as const,forceRefresh:false}]},channelLocators:["brand"],workspaceIntent:{quote:{customer_max:{microusd:0}}}};
 const outcome=await prepareAndSubmitIntelligenceBatch(input);
 expect(outcome).toMatchObject({ok:false,error:"Invalid workspace quote or consent."});
 expect(mocks.legacy).not.toHaveBeenCalled(); expect(mocks.retry).not.toHaveBeenCalled();
});
