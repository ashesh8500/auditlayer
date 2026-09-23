import { describe,it,expect,vi } from "vitest";
import { commercialPrice, commercialPlanForPrice, runCommercialCheckout } from "./commercial-checkout";

describe("commercial checkout",()=>{
 it("uses distinct canonical prices and never aliases legacy",()=>{
  vi.stubEnv("STRIPE_PRICE_BRAND_MONTHLY","price_brand"); vi.stubEnv("STRIPE_PRICE_STUDIO_MONTHLY","price_studio");
  expect(commercialPrice("brand")).toEqual({id:"price_brand",cents:19900});
  expect(commercialPrice("studio")).toEqual({id:"price_studio",cents:49900});
  expect(commercialPlanForPrice("price_studio")).toBe("studio");
  expect(commercialPlanForPrice(undefined)).toBeNull();
 });
 it("reserves capacity before touching Stripe and uses the durable intent key on retry",async()=>{
  const calls:string[]=[];
  const deps={reserve:vi.fn(async()=>{calls.push("reserve");return {id:"intent",customer_id:"cus_owner"};}),price:async()=>({id:"price_brand",currency:"usd",unit_amount:19900,recurring:{interval:"month",interval_count:1}}),session:vi.fn(async(p:unknown,key:string)=>{calls.push(key);return {id:"cs_local",url:"https://checkout.stripe.com/local"};}),bind:vi.fn(async()=>{calls.push("bind");}),origin:"http://localhost:3000"};
  expect(await runCommercialCheckout("owner","brand",deps)).toBe("https://checkout.stripe.com/local");
  expect(calls).toEqual(["reserve","commercial:checkout:intent","bind"]);
  expect(deps.session.mock.calls[0][0]).toMatchObject({mode:"subscription",line_items:[{price:"price_brand",quantity:1}],allow_promotion_codes:false,subscription_data:{metadata:{profile_id:"owner",commercial_plan:"brand",pricing_version:"ALM-2026-09.v1",commercial_checkout_id:"intent"}}});
  deps.reserve.mockRejectedValueOnce(new Error("existing_contract_preserved"));
  await expect(runCommercialCheckout("owner","brand",deps)).rejects.toThrow("existing_contract_preserved"); expect(deps.session).toHaveBeenCalledTimes(1);
 });
 it("reuses a bound hosted session instead of creating another chargeable session",async()=>{
  vi.stubEnv("STRIPE_PRICE_BRAND_MONTHLY","price_brand");
  const session=vi.fn();const existing=vi.fn(async()=>({status:"open",url:"https://checkout.stripe.com/existing"}));
  expect(await runCommercialCheckout("owner","brand",{reserve:async()=>({id:"intent",customer_id:"cus_owner",session_id:"cs_existing"}),price:async()=>({id:"price_brand",currency:"usd",unit_amount:19900,recurring:{interval:"month",interval_count:1}}),session,existing,bind:async()=>{},origin:"http://localhost:3000"})).toBe("https://checkout.stripe.com/existing");
  expect(session).not.toHaveBeenCalled();
 });
 it("rejects misconfigured live price before charging",async()=>{
  const session=vi.fn();
  await expect(runCommercialCheckout("owner","brand",{reserve:async()=>({id:"intent",customer_id:"cus_owner"}),price:async()=>({id:"price_brand",currency:"usd",unit_amount:30,recurring:{interval:"month",interval_count:1}}),session,bind:async()=>{},origin:"http://localhost:3000"})).rejects.toThrow("price_mismatch");
  expect(session).not.toHaveBeenCalled();
 });
});
