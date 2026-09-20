import type Stripe from "stripe";
import {createHash} from "node:crypto";
import {createAdminClient} from "@/lib/supabase/admin";
import {commercial} from "./commercial";
import {commercialPlanForPrice,commercialPrice} from "./commercial-checkout";
import {reconcileWorkspacePayment} from "./workspace/payments";

type Result={data:unknown;error:unknown};
type DB={rpc(name:string,args:{p:Record<string,unknown>}):Promise<Result>;from(name:string):{select(columns:string):{eq(key:string,value:string):{maybeSingle():Promise<Result>}}}};
const pending={status:"pending_reconciliation"} as const;
const id=(v:string|{id:string}|null|undefined)=>typeof v==="string"?v:v?.id;
/** Signature verification is owned by the route. No redirect or metadata alone grants credit. */
export async function reconcileCommercialEvent(event:Stripe.Event,stripe:Stripe) {
 let subscription:Stripe.Subscription|undefined;
 let session:Stripe.Checkout.Session|undefined;
 let invoice:Stripe.Invoice|undefined;
 if(event.type.startsWith("checkout.session.")) {
  session=event.data.object as Stripe.Checkout.Session;
  if(session.metadata?.pricing_version!==commercial.version) return null;
  if(event.type==="checkout.session.expired") {
   const db=createAdminClient() as unknown as DB;
   const p={owner_id:session.metadata.profile_id,id:session.metadata.commercial_checkout_id,session_id:session.id};
   const r=await db.rpc("commercial_checkout_expire",{p});return r.error?pending:{status:"expired"};
  }
  if(event.type!=="checkout.session.completed" || !id(session.subscription)) return pending;
  subscription=await stripe.subscriptions.retrieve(id(session.subscription)!);
 } else if(event.type==="invoice.paid") {
  const object=event.data.object as Stripe.Invoice;
  // Legacy invoices continue through the unchanged adapter.
  if(object.parent?.subscription_details?.metadata?.pricing_version!==commercial.version) return null;
  invoice=await stripe.invoices.retrieve(object.id,{expand:["payments"]});
  const sid=id(invoice.parent?.subscription_details?.subscription);if(!sid) return pending;
  subscription=await stripe.subscriptions.retrieve(sid);
 } else if(event.type.startsWith("customer.subscription.")) {
  subscription=event.data.object as Stripe.Subscription;
  if(subscription.metadata?.pricing_version!==commercial.version) return null;
 } else return null;
 const metadata=subscription.metadata;
 if(metadata?.pricing_version!==commercial.version) return pending;
 const items=subscription.items.data;
 const plan=items.length===1?commercialPlanForPrice(items[0].price.id):null;
 if(!plan || plan!==metadata.commercial_plan || items[0].quantity!==1 || !metadata.profile_id || !metadata.commercial_checkout_id) return pending;
 const start=items[0].current_period_start,end=items[0].current_period_end;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=end) return pending;
 const db=createAdminClient() as unknown as DB;
 const p={owner_id:metadata.profile_id,checkout_id:metadata.commercial_checkout_id,session_id:session?.id??null,event_id:event.id,event_type:event.type,event_created:event.created,customer_id:id(subscription.customer),subscription_id:subscription.id,status:subscription.status,plan,period_start:start,period_end:end};
 const authority=await db.rpc("commercial_subscription_apply",{p:{...p,digest:createHash("sha256").update(JSON.stringify(p)).digest("hex")}});
 if(authority.error || !authority.data || typeof authority.data!=="object") return pending;
 const outcome=authority.data as {applied:boolean;code:string};
 if(!invoice) return outcome.code==="awaiting_checkout"?pending:{status:"reconciled",...outcome};
 // Exact profile/period checks in the grant RPC remain authoritative even on a
 // duplicate or same-second replay. Stale invoices cannot resurrect a cycle.
 if(!outcome.applied && !["duplicate","replay","profile_event_not_newer"].includes(outcome.code)) return pending;
 const hex=createHash("sha256").update(`commercial-invoice:${invoice.id}`).digest("hex");
 const commandId=`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
 const command={id:commandId,payload:{owner_id:metadata.profile_id,command_id:commandId,payment_id:invoice.id,customer_id:id(subscription.customer),subscription_id:subscription.id,period_start:start,period_end:end,kind:"included",amount_microusd:commercial.plans[plan].monthly_credits*10000,paid_microusd:commercialPrice(plan).cents*10000,policy_version:"P-01.v1",pricing_version:commercial.version,commercial_plan:plan,price_id:items[0].price.id,terms_version:commercial.version}};
 const stored=await db.rpc("workspace_credit_payment_command",{p:command.payload});if(stored.error) return pending;
 return reconcileWorkspacePayment({type:"invoice.paid",objectId:invoice.id},{lookup:async()=>command,invoice:async()=>invoice,payment:async pid=>stripe.paymentIntents.retrieve(pid),confirm:async facts=>{
  const confirmed=await db.rpc("workspace_credit_payment_confirm",{p:facts});if(confirmed.error || typeof confirmed.data!=="string") throw new Error("payment_confirm_failed");
  const read=await db.from("workspace_credit_payment_commands").select("lot_id").eq("id",commandId).maybeSingle();
  if(read.error || (read.data as {lot_id?:string}|null)?.lot_id!==confirmed.data) throw new Error("payment_confirmation_unverified");return confirmed.data;
 }});
}
