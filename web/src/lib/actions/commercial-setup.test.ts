import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({profile:vi.fn(),rpc:vi.fn(),read:vi.fn(),eq:vi.fn(),bump:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireProfile:m.profile}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({rpc:m.rpc,from:()=>({select:()=>({eq:m.eq})})})}));
vi.mock("@/lib/resources/mutation-revision",()=>({bumpResourceRevision:m.bump}));
vi.mock("next/cache",()=>({revalidatePath:m.revalidate}));
import { setupCommercialBrand } from "./commercial-setup";
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const result={subject_id:id,channel_id:id,brief_id:id};
const input={request_id:id,name:"Fresh",subject_type:"brand",platform:"instagram",locator:"@Fresh.Brand",identity:"Independent education",audience:"New creators",goal:"Growth",confirmed:true,managed:true};
beforeEach(()=>{
 vi.clearAllMocks();m.profile.mockResolvedValue({id});m.rpc.mockResolvedValue({data:result,error:null});
 m.eq.mockReturnValue({eq:m.eq,maybeSingle:m.read});
 m.read.mockResolvedValue({data:{id,user_id:id,living_brief_versions:[{id,confirmed:true,created_by:id}],subject_channels:[{id,managed:true}]},error:null});
});
it("creates only session-owned setup and verifies its immutable brief before continuation",async()=>{
 expect(await setupCommercialBrand(input)).toEqual({ok:true,...result});
 expect(m.rpc).toHaveBeenCalledExactlyOnceWith("commercial_brand_setup",{p:{...input,locator:"fresh.brand"}});
 expect(m.eq).toHaveBeenCalledWith("user_id",id);
 expect(m.bump).toHaveBeenCalledExactlyOnceWith("subjects");
 expect(m.revalidate).toHaveBeenCalledWith("/commercial");
});
it.each([{confirmed:false},{managed:false},{owner_id:id},{subject_id:id},{platform:"invalid"},{identity:""},{locator:"https://evil.invalid/x"}])("rejects invalid or forged input before mutation: %j",async(change)=>{
 expect((await setupCommercialBrand({...input,...change})).ok).toBe(false);expect(m.rpc).not.toHaveBeenCalled();
});
it("requires authenticated profile",async()=>{
 m.profile.mockRejectedValue(new Error("expired"));expect((await setupCommercialBrand(input)).ok).toBe(false);expect(m.rpc).not.toHaveBeenCalled();
});
it("does not claim success for a missing or foreign readback",async()=>{
 m.read.mockResolvedValue({data:null,error:null});expect((await setupCommercialBrand(input)).ok).toBe(false);expect(m.bump).not.toHaveBeenCalled();
});
it("keeps retry failures bounded and private",async()=>{
 m.rpc.mockResolvedValue({data:null,error:{message:"setup_request_conflict secret"}});
 const outcome=await setupCommercialBrand(input);expect(outcome).toMatchObject({ok:false});expect(JSON.stringify(outcome)).not.toContain("secret");
});
it("normalizes explicit websites without interpreting them as social handles",async()=>{
 expect((await setupCommercialBrand({...input,platform:"website",locator:"https://www.example.com/brand/"})).ok).toBe(true);
 expect(m.rpc).toHaveBeenCalledWith("commercial_brand_setup",{p:{...input,platform:"website",locator:"https://example.com/brand"}});
});
