import {beforeEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({profile:vi.fn(),rpc:vi.fn(),read:vi.fn(),create:vi.fn(),price:vi.fn(),existing:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireProfile:m.profile}));
vi.mock("next/navigation",()=>({redirect:(url:string)=>{throw new Error(`REDIRECT:${url}`);}}));
vi.mock("@/lib/env",()=>({siteUrl:()=>"http://localhost:3000"}));
vi.mock("@/lib/stripe",()=>({getStripe:()=>({prices:{retrieve:m.price},checkout:{sessions:{create:m.create,retrieve:m.existing}}})}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({rpc:m.rpc,from:()=>({select:()=>({eq:()=>({maybeSingle:m.read})})})})}));
import {startCommercialCheckout} from "./commercial-billing";
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("ALM_COMMERCIAL_PAID_ENABLED","1");vi.stubEnv("STRIPE_PRICE_STUDIO_MONTHLY","price_studio");m.profile.mockResolvedValue({id:"owner"});m.price.mockResolvedValue({id:"price_studio",currency:"usd",unit_amount:49900,recurring:{interval:"month",interval_count:1}});});
it("actual server action reserves then binds and reads back hosted session before redirect",async()=>{
 m.rpc.mockResolvedValueOnce({data:{id:"intent",customer_id:null,session_id:null},error:null}).mockResolvedValueOnce({data:"intent",error:null});
 m.create.mockResolvedValue({id:"cs_test",url:"https://checkout.stripe.com/test"});m.read.mockResolvedValue({data:{session_id:"cs_test",owner_id:"owner"},error:null});
 await expect(startCommercialCheckout("studio")).rejects.toThrow("REDIRECT:https://checkout.stripe.com/test");
 expect(m.rpc.mock.calls.map(c=>c[0])).toEqual(["commercial_checkout_reserve","commercial_checkout_bind"]);
 expect(m.create.mock.calls[0][0]).toMatchObject({line_items:[{price:"price_studio",quantity:1}],subscription_data:{metadata:{commercial_plan:"studio"}}});
});
it("failed readback never redirects to a chargeable session",async()=>{
 m.rpc.mockResolvedValueOnce({data:{id:"intent",customer_id:null},error:null}).mockResolvedValueOnce({data:"intent",error:null});m.create.mockResolvedValue({id:"cs_test",url:"https://checkout.stripe.com/test"});m.read.mockResolvedValue({data:null,error:null});
 await expect(startCommercialCheckout("studio")).rejects.toThrow("REDIRECT:/commercial?payment=unconfirmed");
});
