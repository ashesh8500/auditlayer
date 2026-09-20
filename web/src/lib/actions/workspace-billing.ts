"use server";

import { requireProfile } from "@/lib/auth";
import { isSupabaseAdminConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelWorkspaceSubscription, requestWorkspaceRefund } from "@/lib/workspace/lifecycle-server";

const NO_CONTRACT="No workspace credit contract on this account. Your existing report access is unchanged.";
const CANCEL_FAILED="We couldn't start the cancellation. No new charges were made; contact support to finish it.";
type CycleRow={subscription_id:string};
type CycleQuery={select(columns:string):{eq(column:string,value:string):{order(column:string,options:{ascending:boolean}):{limit(count:number):{maybeSingle():Promise<{data:CycleRow|null;error:unknown}>}}}}};
type CycleClient={from(table:"workspace_credit_cycles"):CycleQuery};
// Narrow boundary until the parent-owned generated database types include the new tables.
const cycleReader=()=>createAdminClient() as unknown as CycleClient;

/** Pilot cancellation request: freezes unconsumed purchased credit, then stops
 * the provider subscription. The owner and the subscription both come from the
 * session and the durable cycle row — never from the browser alone. Ambiguous
 * provider outcomes are surfaced as pending, never as completed cancellation.
 */
export async function requestPilotCancellationAction(input:{subscriptionId:string}):Promise<
 |{ok:true;status:string;cancellation:string;refundId?:string}
 |{ok:false;error:string}> {
 let ownerId:string;
 try { ownerId=(await requireProfile()).id; }
 catch { return {ok:false,error:"Sign in again to manage billing."}; }
 if(!isSupabaseAdminConfigured()) return {ok:false,error:CANCEL_FAILED};
 try {
  const {data,error}=await cycleReader().from("workspace_credit_cycles")
   .select("subscription_id").eq("owner_id",ownerId).order("period_end",{ascending:false}).limit(1).maybeSingle();
  const subscription=data as {subscription_id:string}|null;
  if(error || !subscription || subscription.subscription_id!==input.subscriptionId) return {ok:false,error:NO_CONTRACT};
  const refund=await requestWorkspaceRefund({ownerId,requestId:`workspace-pilot-cancel:${ownerId}:${input.subscriptionId}`,subscriptionId:input.subscriptionId});
  const cancellation=await cancelWorkspaceSubscription({ownerId,subscriptionId:input.subscriptionId});
  if(refund.status==="error" && cancellation.status==="error") return {ok:false,error:CANCEL_FAILED};
  return {
   ok:true,
   status:refund.status,
   cancellation:cancellation.status,
   ...(refund.status==="nothing_to_refund"?{}:{refundId:refund.refundId}),
  };
 } catch {
  return {ok:false,error:CANCEL_FAILED};
 }
}
