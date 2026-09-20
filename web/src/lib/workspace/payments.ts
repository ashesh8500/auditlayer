import { z } from "zod";
const commandSchema=z.object({id:z.uuid(),payload:z.object({kind:z.enum(["included","purchased"]),customer_id:z.string().min(1),price_id:z.string().min(1),paid_microusd:z.number().int().safe().positive(),payment_id:z.string().min(1),subscription_id:z.string().min(1),period_start:z.number().int().safe(),period_end:z.number().int().safe()})});
const paymentSchema=z.object({id:z.string(),status:z.string(),currency:z.string(),amount_received:z.number().int().safe().nonnegative(),customer:z.string()});
const invoiceSchema=z.object({
 id:z.string(),status:z.string(),currency:z.string(),amount_paid:z.number().int().safe().nonnegative(),amount_remaining:z.number().int().safe().nonnegative(),
 customer:z.string(),parent:z.object({subscription_details:z.object({subscription:z.string()}).nullable()}).nullable(),
 lines:z.object({has_more:z.boolean(),data:z.array(z.object({amount:z.number().int().safe(),quantity:z.number().int().nullable(),period:z.object({start:z.number().int().safe(),end:z.number().int().safe()}),pricing:z.object({price_details:z.object({price:z.string()}).nullable()}).nullable()}))}),
 payments:z.object({has_more:z.boolean(),data:z.array(z.object({status:z.string(),amount_paid:z.number().int().safe(),payment:z.object({payment_intent:z.string().nullable()})}))}),
});
export type PaymentConfirmation={command_id:string;payment_id:string;customer_id:string;currency:"usd";paid_microusd:number;status:"succeeded";price_id:string};
export type PaymentPorts={
 lookup(paymentId:string):Promise<unknown|null>;
 payment(paymentId:string):Promise<unknown>;
 invoice(invoiceId:string):Promise<unknown>;
 confirm(facts:PaymentConfirmation):Promise<string>;
};
const PENDING={status:"pending_reconciliation"} as const;
const micro=(cents:number)=>cents*10000;
/** Called only after signature verification, or by a trusted reconciliation job.
 * Payment identity is bound to a durable server-authored command; a browser
 * return parameter, Stripe metadata string or `active` subscription status can
 * never mint credit.
 */
export async function reconcileWorkspacePayment(event:{type:string;objectId:string},ports:PaymentPorts):Promise<null|{status:"applied";lotId:string}|typeof PENDING> {
 if(event.type!=="payment_intent.succeeded" && event.type!=="invoice.paid") return null;
 try {
  const stored=await ports.lookup(event.objectId);
  if(stored===null) return null; // unrelated legacy provider object
  const command=commandSchema.parse(stored);
  if(event.type==="payment_intent.succeeded") {
   if(command.payload.kind!=="purchased" || command.payload.payment_id!==event.objectId) return null;
   const payment=paymentSchema.parse(await ports.payment(event.objectId));
   if(payment.id!==command.payload.payment_id || payment.status!=="succeeded" || payment.currency!=="usd" || payment.customer!==command.payload.customer_id) return PENDING;
   if(micro(payment.amount_received)!==command.payload.paid_microusd) return PENDING;
   return {status:"applied",lotId:await ports.confirm({command_id:command.id,payment_id:payment.id,customer_id:payment.customer,currency:"usd",paid_microusd:command.payload.paid_microusd,status:"succeeded",price_id:command.payload.price_id})};
  }
  if(command.payload.kind!=="included" || command.payload.payment_id!==event.objectId) return null;
  const invoice=invoiceSchema.parse(await ports.invoice(event.objectId));
  const subscription=invoice.parent?.subscription_details?.subscription;
  if(subscription===undefined) return null;
  const expected=command.payload.paid_microusd;
  if(invoice.status!=="paid" || invoice.currency!=="usd" || invoice.amount_remaining!==0 || micro(invoice.amount_paid)!==expected
   || invoice.customer!==command.payload.customer_id || subscription!==command.payload.subscription_id || invoice.lines.has_more || invoice.payments.has_more) return PENDING;
  const line=invoice.lines.data.filter(entry=>entry.pricing?.price_details?.price===command.payload.price_id);
  if(invoice.lines.data.length!==1 || line.length!==1 || line[0].quantity!==1 || micro(line[0].amount)!==expected || line[0].period.start!==command.payload.period_start || line[0].period.end!==command.payload.period_end) return PENDING;
  const settled=invoice.payments.data.filter(entry=>entry.status==="paid" && micro(entry.amount_paid)===expected);
  if(invoice.payments.data.length!==1 || settled.length!==1 || settled[0].payment.payment_intent===null) return PENDING;
  const payment=paymentSchema.parse(await ports.payment(settled[0].payment.payment_intent));
  if(payment.id!==settled[0].payment.payment_intent || payment.status!=="succeeded" || payment.currency!=="usd" || payment.customer!==command.payload.customer_id || micro(payment.amount_received)!==expected) return PENDING;
  return {status:"applied",lotId:await ports.confirm({command_id:command.id,payment_id:invoice.id,customer_id:invoice.customer,currency:"usd",paid_microusd:expected,status:"succeeded",price_id:command.payload.price_id})};
 } catch { return PENDING; }
}
