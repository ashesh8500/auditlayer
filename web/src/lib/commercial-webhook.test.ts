import {it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({rpc:vi.fn(),read:vi.fn()}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({rpc:m.rpc,from:()=>({select:()=>({eq:()=>({maybeSingle:m.read})})})})}));
import {reconcileCommercialEvent} from "./commercial-webhook";
import type Stripe from "stripe";
it("paid Brand invoice composes ordered authority then payment command and exact confirmation",async()=>{
 vi.stubEnv("STRIPE_PRICE_BRAND_MONTHLY","price_brand");
 const metadata={profile_id:"11111111-1111-4111-8111-111111111111",commercial_checkout_id:"22222222-2222-4222-8222-222222222222",commercial_plan:"brand",pricing_version:"ALM-2026-09.v1"};
 const subscription={id:"sub_b",customer:"cus_b",status:"active",metadata,items:{data:[{price:{id:"price_brand"},quantity:1,current_period_start:1700000000,current_period_end:2000000000}]}};
 const invoice={id:"in_b",status:"paid",currency:"usd",amount_paid:19900,amount_remaining:0,customer:"cus_b",parent:{subscription_details:{subscription:"sub_b",metadata}},lines:{has_more:false,data:[{amount:19900,quantity:1,period:{start:1700000000,end:2000000000},pricing:{price_details:{price:"price_brand"}}}]},payments:{has_more:false,data:[{status:"paid",amount_paid:19900,payment:{payment_intent:"pi_b"}}]}};
 const stripe={subscriptions:{retrieve:vi.fn(async()=>subscription)},invoices:{retrieve:vi.fn(async()=>invoice)},paymentIntents:{retrieve:vi.fn(async()=>({id:"pi_b",status:"succeeded",currency:"usd",amount_received:19900,customer:"cus_b"}))}} as unknown as Stripe;
 m.rpc.mockImplementation(async(name:string,args:{p:Record<string,unknown>})=>({data:name==="commercial_subscription_apply"?{applied:true}:name==="workspace_credit_payment_command"?args.p.command_id:"lot_b",error:null}));
 m.read.mockResolvedValue({data:{lot_id:"lot_b"},error:null});
 const result=await reconcileCommercialEvent({id:"evt_b",created:1800000000,type:"invoice.paid",data:{object:invoice}} as unknown as Stripe.Event,stripe);
 expect(result).toEqual({status:"applied",lotId:"lot_b"});
 expect(m.rpc.mock.calls.map(c=>c[0])).toEqual(["commercial_subscription_apply","workspace_credit_payment_command","workspace_credit_payment_confirm"]);
 expect(m.rpc.mock.calls[1][1].p).toMatchObject({commercial_plan:"brand",paid_microusd:199000000,amount_microusd:50000000});
 vi.unstubAllEnvs();
});
