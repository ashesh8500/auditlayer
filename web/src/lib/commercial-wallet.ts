import { z } from "zod";
import { commercial } from "./commercial";
const money = z.object({currency:z.literal("USD"),microusd:z.number().int().safe().nonnegative()}).strict();
const date = z.string().datetime({precision:null});
const schema = z.object({
  owner_id:z.uuid(),policy_version:z.literal("P-01.v1"),currency:z.literal("USD"),
  pricing_version:z.literal(commercial.version),commercial_plan:z.enum(["free","brand","studio"]),
  period_source:z.enum(["calendar_month_utc","stripe"]),subscription_id:z.string().min(1).nullable(),
  period_start:date,period_end:date,balance:money,reserved:money,consumed_this_cycle:money,purchased_this_cycle:money,upstream_exposure_this_cycle:money,
  lots:z.array(z.object({id:z.uuid(),kind:z.enum(["included","purchased"]),granted:money,balance:money,reserved:money,consumed:money,granted_at:date,expires_at:date.nullable(),stripe_source_id:z.string().nullable()}).strict()),
}).strict().superRefine((w,ctx)=>{
  const validPeriod = w.commercial_plan==="free" ? w.period_source==="calendar_month_utc" && w.subscription_id===null : w.period_source==="stripe" && w.subscription_id!==null;
  if (!validPeriod || Date.parse(w.period_start)>=Date.parse(w.period_end) || w.reserved.microusd>w.balance.microusd) ctx.addIssue({code:"custom",message:"Invalid commercial authority or balance"});
});
export type CommercialWallet = z.infer<typeof schema>;
export const parseCommercialWallet = (value:unknown):CommercialWallet => schema.parse(value);
