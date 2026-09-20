import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconcileWorkspacePayment, type PaymentConfirmation } from "./payments";
type Result={data:unknown;error:unknown};
type Query={select(columns:string):{eq(column:string,value:string):{maybeSingle():Promise<Result>}}};
type PaymentDatabase={from(table:"workspace_credit_payment_commands"):Query;rpc(name:"workspace_credit_payment_confirm",args:{p:PaymentConfirmation}):Promise<Result>};
/** Invoice retrieval shape actually consumed; kept narrow to avoid `any`. */
const retrieveInvoice=(stripe:Stripe,id:string)=>stripe.invoices.retrieve(id,{expand:["payments"]}) as unknown as Promise<unknown>;
/** Verified Stripe events only. Returns null for provider objects that are not
 * bound to a durable server-authored workspace payment command.
 */
export async function reconcilePaidWorkspaceEvent(event:Stripe.Event,stripe:Stripe) {
 if(event.type!=="payment_intent.succeeded" && event.type!=="invoice.paid") return null;
 const db=createAdminClient() as unknown as PaymentDatabase;
 return reconcileWorkspacePayment({type:event.type,objectId:event.data.object.id},{
  lookup:async paymentId=>{
   const {data,error}=await db.from("workspace_credit_payment_commands").select("id,payload").eq("payment_id",paymentId).maybeSingle();
   if(error) throw new Error("payment_command_read_failed");
   return data;
  },
  payment:paymentId=>stripe.paymentIntents.retrieve(paymentId) as unknown as Promise<unknown>,
  invoice:invoiceId=>retrieveInvoice(stripe,invoiceId),
  confirm:async facts=>{
   const {data,error}=await db.rpc("workspace_credit_payment_confirm",{p:facts});
   if(error || typeof data!=="string") throw new Error("payment_confirm_failed");
   const receipt=await db.from("workspace_credit_payment_commands").select("lot_id").eq("id",facts.command_id).maybeSingle();
   if(receipt.error || !receipt.data || typeof receipt.data!=="object" || !("lot_id" in receipt.data) || receipt.data.lot_id!==data) throw new Error("payment_confirmation_unverified");
   return data;
  },
 });
}
