import { commercial } from "./commercial";
export type PaidCommercialPlan = "brand" | "studio";
export function commercialPrice(plan:PaidCommercialPlan) {
 return {id:process.env[plan === "brand" ? "STRIPE_PRICE_BRAND_MONTHLY" : "STRIPE_PRICE_STUDIO_MONTHLY"],cents:commercial.plans[plan].monthly_usd*100};
}
export function commercialPlanForPrice(id:string|null|undefined):PaidCommercialPlan|null {
 if(!id) return null;
 const matches=(["brand","studio"] as const).filter(p=>commercialPrice(p).id===id);
 return matches.length===1 ? matches[0] : null;
}
type Price={id:string;currency:string;unit_amount:number|null;recurring:{interval:string;interval_count:number}|null};
export type CommercialCheckoutDeps={
 reserve(owner:string,plan:PaidCommercialPlan):Promise<{id:string;customer_id:string|null;session_id?:string|null}>;
 existing?(sessionId:string):Promise<{status:string|null;url:string|null}>;
 price(id:string):Promise<Price>;
 session(params:{mode:"subscription";customer?:string;client_reference_id:string;line_items:{price:string;quantity:number}[];metadata:Record<string,string>;subscription_data:{metadata:Record<string,string>};success_url:string;cancel_url:string;allow_promotion_codes:false},key:string):Promise<{id:string;url:string|null}>;
 bind(id:string,sessionId:string):Promise<void>;origin:string;
};
/** Reserve one owner-wide pending enrollment BEFORE creating a chargeable session.
 * Ambiguous network failures retain that intent; retries use the same Stripe key.
 * Release only after signed expiry, never from a browser cancellation redirect. */
export async function runCommercialCheckout(owner:string,plan:PaidCommercialPlan,deps:CommercialCheckoutDeps) {
 if(plan!=="brand" && plan!=="studio") throw new Error("unsupported_plan");
 const configured=commercialPrice(plan); if(!configured.id) throw new Error("price_unconfigured");
 const price=await deps.price(configured.id);
 if(price.id!==configured.id || price.currency!=="usd" || price.unit_amount!==configured.cents || price.recurring?.interval!=="month" || price.recurring.interval_count!==1) throw new Error("price_mismatch");
 const intent=await deps.reserve(owner,plan);
 if(intent.session_id) {
  const existing=await deps.existing?.(intent.session_id);
  if(existing?.status!=="open" || !existing.url) throw new Error("checkout_requires_reconciliation");
  return existing.url;
 }
 const metadata={profile_id:owner,commercial_plan:plan,pricing_version:commercial.version,commercial_checkout_id:intent.id};
 const session=await deps.session({mode:"subscription",...(intent.customer_id ? {customer:intent.customer_id}:{}),client_reference_id:owner,line_items:[{price:configured.id,quantity:1}],metadata,subscription_data:{metadata},success_url:`${deps.origin}/settings/billing?commercial=processing`,cancel_url:`${deps.origin}/settings/billing?commercial=cancelled`,allow_promotion_codes:false},`commercial:checkout:${intent.id}`);
 await deps.bind(intent.id,session.id);
 if(!session.url) throw new Error("checkout_url_missing");
 return session.url;
}
