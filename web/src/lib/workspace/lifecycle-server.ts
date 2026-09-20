import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import {
  cancelWorkspaceSubscription as orchestrateCancellation,
  requestWorkspaceRefund as orchestrateRefund,
  type ProviderActionFacts,
} from "./lifecycle";
type Result={data:unknown;error:unknown};
type RefundRow={id:string;amount_microusd:number};
type WorkspaceLifecycleDatabase={
 rpc(name:"workspace_credit_refund_reserve",args:{p:{owner_id:string;request_id:string;subscription_id:string}}):Promise<Result>;
 rpc(name:"workspace_credit_cancel",args:{p:{owner_id:string;subscription_id:string}}):Promise<Result>;
 rpc(name:"workspace_credit_provider_action",args:{p:ProviderActionFacts&{action_id:string}}):Promise<Result>;
};
export type WorkspaceLifecyclePorts={
 freeze(input:{ownerId:string;requestId:string;subscriptionId:string}):Promise<{refundId:string;amountMicrousd:number}>;
 createRefund(input:{amountMicrousd:number;idempotencyKey:string;requestId:string}):Promise<{id:string}>;
 cancelProvider(input:{subscriptionId:string;idempotencyKey:string}):Promise<{id:string}>;
 cancelCredit(input:{ownerId:string;subscriptionId:string}):Promise<string>;
 recordAction(facts:ProviderActionFacts):Promise<string>;
};
const refundRow=(value:unknown):RefundRow=>{
 if(typeof value!=="object"||value===null||!("id" in value)||!("amount_microusd" in value)) throw new Error("refund_reserve_unverified");
 const row=value as RefundRow;
 if(typeof row.id!=="string"||typeof row.amount_microusd!=="number") throw new Error("refund_reserve_unverified");
 return row;
};
/** Service-role composition. The provider's idempotency keys are derived from
 * the durable freeze row, so a transport retry cannot double-refund. */
export function workspaceLifecyclePorts(stripe:Stripe=getStripe() as Stripe):WorkspaceLifecyclePorts {
 const db=createAdminClient() as unknown as WorkspaceLifecycleDatabase;
 return {
  freeze:async input=>{
   const {data,error}=await db.rpc("workspace_credit_refund_reserve",{p:{owner_id:input.ownerId,request_id:input.requestId,subscription_id:input.subscriptionId}});
   if(error) throw new Error("refund_reserve_failed");
   const row=refundRow(data);
   return {refundId:row.id,amountMicrousd:row.amount_microusd};
  },
  createRefund:async input=>{
   // The provider expects integer cents; a fractional microusd amount fails closed.
   if(input.amountMicrousd%10000!==0) throw new Error("unsupported_refund_granularity");
   const refund=await stripe.refunds.create({amount:input.amountMicrousd/10000,metadata:{workspace_freeze:input.requestId}},{idempotencyKey:input.idempotencyKey});
   return {id:refund.id};
  },
  cancelProvider:async input=>{
   const subscription=await stripe.subscriptions.cancel(input.subscriptionId,{}, {idempotencyKey:input.idempotencyKey});
   return {id:subscription.id};
  },
  cancelCredit:async input=>{
   const {data,error}=await db.rpc("workspace_credit_cancel",{p:{owner_id:input.ownerId,subscription_id:input.subscriptionId}});
   if(error||typeof data!=="string") throw new Error("cancel_failed");
   return data;
  },
  recordAction:async facts=>{
   const {data,error}=await db.rpc("workspace_credit_provider_action",{p:{...facts,action_id:crypto.randomUUID()}});
   if(error||typeof data!=="string") throw new Error("provider_action_failed");
   return data;
  },
 };
}
export const requestWorkspaceRefund=(input:{ownerId:string;requestId:string;subscriptionId:string})=>orchestrateRefund(input,workspaceLifecyclePorts());
export const cancelWorkspaceSubscription=(input:{ownerId:string;subscriptionId:string})=>orchestrateCancellation(input,workspaceLifecyclePorts());
