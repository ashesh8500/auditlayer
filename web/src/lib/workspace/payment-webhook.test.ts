import { expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({construct:vi.fn(),retrieve:vi.fn(),invoice:vi.fn(),rpc:vi.fn(),read:vi.fn()}));
vi.mock("@/lib/stripe",()=>({getStripe:()=>({webhooks:{constructEvent:mocks.construct},paymentIntents:{retrieve:mocks.retrieve},invoices:{retrieve:mocks.invoice}})}));
vi.mock("@/lib/env",()=>({isSupabaseAdminConfigured:()=>true}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({rpc:mocks.rpc,from:()=>({select:()=>({eq:()=>({maybeSingle:mocks.read})})})})}));
import { POST } from "@/app/api/webhooks/stripe/route";
import { NextRequest } from "next/server";
it("verified Stripe payment enters the durable credit confirm RPC and verifies its receipt",async()=>{
 vi.stubEnv("STRIPE_WEBHOOK_SECRET","offline-test-secret");
 mocks.construct.mockReturnValue({type:"payment_intent.succeeded",data:{object:{id:"pi_owned"}}});
 const command={id:"11111111-1111-4111-8111-111111111111",payload:{kind:"purchased",payment_id:"pi_owned",customer_id:"cus_owned",paid_microusd:10000000,price_id:"price_topup",subscription_id:"sub_owned",period_start:1700000000,period_end:2000000000}};
 mocks.read.mockResolvedValueOnce({data:command,error:null}).mockResolvedValueOnce({data:{lot_id:"lot"},error:null});
 mocks.retrieve.mockResolvedValue({id:"pi_owned",status:"succeeded",currency:"usd",amount_received:1000,customer:"cus_owned"});
 mocks.rpc.mockResolvedValue({data:"lot",error:null});
 try {
 const response=await POST(new NextRequest("https://app.invalid/api/webhooks/stripe",{method:"POST",headers:{"stripe-signature":"offline"},body:"{}"}));
 expect(await response.json()).toMatchObject({outcome:{status:"applied",lotId:"lot"}});
 expect(mocks.rpc).toHaveBeenCalledWith("workspace_credit_payment_confirm",{p:expect.objectContaining({payment_id:"pi_owned",paid_microusd:10000000})});
 expect(mocks.read).toHaveBeenCalledTimes(2);
 } finally {vi.unstubAllEnvs();}
});
it("verified paid invoice mints the included allowance only from retrieved period facts",async()=>{
 vi.stubEnv("STRIPE_WEBHOOK_SECRET","offline-test-secret");
 mocks.construct.mockReturnValue({type:"invoice.paid",data:{object:{id:"in_owned"}}});
 const command={id:"22222222-2222-4222-8222-222222222222",payload:{kind:"included",payment_id:"in_owned",customer_id:"cus_owned",price_id:"price_access",paid_microusd:129000000,subscription_id:"sub_owned",period_start:1700000000,period_end:2000000000}};
 mocks.read.mockReset().mockResolvedValueOnce({data:command,error:null}).mockResolvedValueOnce({data:{lot_id:"lot2"},error:null});
 mocks.rpc.mockResolvedValue({data:"lot2",error:null});
 mocks.invoice.mockResolvedValue({id:"in_owned",status:"paid",currency:"usd",amount_paid:12900,amount_remaining:0,customer:"cus_owned",parent:{subscription_details:{subscription:"sub_owned"}},lines:{has_more:false,data:[{amount:12900,quantity:1,period:{start:1700000000,end:2000000000},pricing:{price_details:{price:"price_access"}}}]},payments:{has_more:false,data:[{status:"paid",amount_paid:12900,payment:{payment_intent:"pi_invoice"}}]}});
 mocks.retrieve.mockResolvedValue({id:"pi_invoice",status:"succeeded",currency:"usd",amount_received:12900,customer:"cus_owned"});
 try {
 const response=await POST(new NextRequest("https://app.invalid/api/webhooks/stripe",{method:"POST",headers:{"stripe-signature":"offline"},body:"{}"}));
 expect(await response.json()).toMatchObject({outcome:{status:"applied",lotId:"lot2"}});
 expect(mocks.rpc).toHaveBeenCalledWith("workspace_credit_payment_confirm",{p:expect.objectContaining({payment_id:"in_owned",paid_microusd:129000000})});
 } finally {vi.unstubAllEnvs();}
});
it("subscription status alone never mints credit",async()=>{
 vi.stubEnv("STRIPE_WEBHOOK_SECRET","offline-test-secret");
 mocks.construct.mockReturnValue({type:"customer.subscription.updated",data:{object:{id:"sub_owned",customer:"cus_owned",status:"active",metadata:{},items:{data:[]}}}});
 mocks.read.mockReset(); mocks.rpc.mockClear();
 try {
 const response=await POST(new NextRequest("https://app.invalid/api/webhooks/stripe",{method:"POST",headers:{"stripe-signature":"offline"},body:"{}"}));
 expect(mocks.rpc).not.toHaveBeenCalled();
 expect((await response.json()).outcome.applied).toBe(false);
 } finally {vi.unstubAllEnvs();}
});
