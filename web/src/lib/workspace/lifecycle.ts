/** Owner-scoped refund/cancellation orchestration.
 *
 * Order is deliberate: the append-only freeze is written first, then the
 * provider is asked to move cash using an idempotency key derived from that
 * freeze row, then the provider fact is recorded. A lost or ambiguous provider
 * response is recorded as `pending`, never retried blindly and never reported as
 * success. A failed local record write is still reported as pending, because the
 * provider may already have moved money. Recording an action never unfreezes
 * liability: the customer's frozen amount stays unavailable until the fiscal
 * reconciliation resolves it.
 */
export type ProviderActionFacts={ownerId:string;kind:"refund"|"cancellation";subjectId:string;idempotencyKey:string;status:"pending"|"succeeded"|"failed";providerObjectId:string|null;amountMicrousd:number|null};
export type RefundPorts={
 freeze(input:{ownerId:string;requestId:string;subscriptionId:string}):Promise<{refundId:string;amountMicrousd:number}>;
 createRefund(input:{amountMicrousd:number;idempotencyKey:string;requestId:string}):Promise<{id:string}>;
 recordAction(facts:ProviderActionFacts):Promise<string>;
};
export type CancellationPorts={recordAction(facts:ProviderActionFacts):Promise<string>;cancelProvider(input:{subscriptionId:string;idempotencyKey:string}):Promise<{id:string}>;cancelCredit(input:{ownerId:string;subscriptionId:string}):Promise<string>};
export const refundIdempotencyKey=(refundId:string)=>`workspace-refund:${refundId}`;
export const cancellationIdempotencyKey=(subscriptionId:string)=>`workspace-cancel:${subscriptionId}`;

export async function requestWorkspaceRefund(input:{ownerId:string;requestId:string;subscriptionId:string},ports:RefundPorts) {
 try {
  const freeze=await ports.freeze({ownerId:input.ownerId,requestId:input.requestId,subscriptionId:input.subscriptionId});
  if(freeze.amountMicrousd<=0) return {status:"nothing_to_refund" as const,refundId:freeze.refundId};
  let providerRefundId:string|null=null;
  try { providerRefundId=(await ports.createRefund({amountMicrousd:freeze.amountMicrousd,idempotencyKey:refundIdempotencyKey(freeze.refundId),requestId:input.requestId})).id; }
  catch { /* ambiguous: the provider may or may not have refunded. */ }
  try {
   await ports.recordAction({ownerId:input.ownerId,kind:"refund",subjectId:freeze.refundId,idempotencyKey:refundIdempotencyKey(freeze.refundId),status:providerRefundId?"succeeded":"pending",providerObjectId:providerRefundId,amountMicrousd:providerRefundId?freeze.amountMicrousd:null});
  } catch {
   return providerRefundId ? {status:"pending_reconciliation" as const,refundId:freeze.refundId,providerRefundId} : {status:"pending_reconciliation" as const,refundId:freeze.refundId};
  }
  return providerRefundId ? {status:"applied" as const,refundId:freeze.refundId,providerRefundId} : {status:"pending_reconciliation" as const,refundId:freeze.refundId};
 } catch {
  return {status:"error" as const};
 }
}

export async function cancelWorkspaceSubscription(input:{ownerId:string;subscriptionId:string},ports:CancellationPorts) {
 try {
  await ports.cancelCredit({ownerId:input.ownerId,subscriptionId:input.subscriptionId});
 } catch {
  // No authoritative credit-side cancellation: never touch the provider.
  return {status:"error" as const};
 }
 let providerSubscriptionId:string|null=null;
 try { providerSubscriptionId=(await ports.cancelProvider({subscriptionId:input.subscriptionId,idempotencyKey:cancellationIdempotencyKey(input.subscriptionId)})).id; }
 catch { /* ambiguous */ }
 try {
  await ports.recordAction({ownerId:input.ownerId,kind:"cancellation",subjectId:input.subscriptionId,idempotencyKey:cancellationIdempotencyKey(input.subscriptionId),status:providerSubscriptionId?"succeeded":"pending",providerObjectId:providerSubscriptionId,amountMicrousd:null});
 } catch {
  return {status:"pending_reconciliation" as const};
 }
 return providerSubscriptionId ? {status:"applied" as const,providerSubscriptionId} : {status:"pending_reconciliation" as const};
}
