import {it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({profile:vi.fn(),quote:vi.fn(),reservation:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireProfile:m.profile}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({from:(name:string)=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:name==="commercial_quotes"?m.quote:m.reservation})})})})})}));
import {GET} from "@/app/api/commercial/receipts/[auditId]/route";
it("reads owned receipt without mutation and distinguishes unknown provider cost",async()=>{
 m.profile.mockResolvedValue({id:"owner"});m.quote.mockResolvedValue({data:{id:"quote"},error:null});m.reservation.mockResolvedValue({data:{state:"released",retail_microusd:50000,customer_debit_microusd:0,actual_upstream_microusd:null,terminal_payload:{receipt_id:"receipt"}},error:null});
 const r=await GET(new Request("http://localhost/api/commercial/receipts/audit"),{params:Promise.resolve({auditId:"audit"})});
 expect(r.status).toBe(200);expect(await r.json()).toMatchObject({customer_debit_microusd:0,actual_upstream_microusd:null});
 m.quote.mockResolvedValue({data:null,error:null});expect((await GET(new Request("http://localhost"),{params:Promise.resolve({auditId:"foreign"})})).status).toBe(404);
});
