import { expect, it, vi } from "vitest";
import { reconcileWorkspacePayment } from "./payments";
const command={id:"11111111-1111-4111-8111-111111111111",payload:{kind:"purchased",customer_id:"cus_owned",price_id:"price_topup",paid_microusd:10000000,payment_id:"pi_owned",subscription_id:"sub_owned",period_start:1700000000,period_end:2000000000}};
function setup() {
 const lookup=vi.fn<() => Promise<unknown|null>>(async()=>command);
 const confirm=vi.fn(async()=>"lot");
 const payment=vi.fn(async()=>({id:"pi_owned",status:"succeeded",currency:"usd",amount_received:1000,customer:"cus_owned"}));
 return {lookup,confirm,payment,invoice:vi.fn()};
}
it("confirms only retrieved paid facts against a persisted payment command",async()=>{
 const deps=setup();
 expect(await reconcileWorkspacePayment({type:"payment_intent.succeeded",objectId:"pi_owned"},deps)).toEqual({status:"applied",lotId:"lot"});
 expect(deps.confirm).toHaveBeenCalledWith({command_id:command.id,payment_id:"pi_owned",customer_id:"cus_owned",currency:"usd",paid_microusd:10000000,status:"succeeded",price_id:"price_topup"});
});
it("does not grant from checkout redirects, subscription active, or an unbound payment",async()=>{
 const deps=setup();
 expect(await reconcileWorkspacePayment({type:"checkout.session.completed",objectId:"cs_any"},deps)).toBeNull();
 expect(deps.lookup).not.toHaveBeenCalled();
 deps.lookup.mockResolvedValue(null as unknown as typeof command);
 expect(await reconcileWorkspacePayment({type:"payment_intent.succeeded",objectId:"pi_unbound"},deps)).toBeNull();
 expect(deps.payment).not.toHaveBeenCalled();expect(deps.confirm).not.toHaveBeenCalled();
});
it.each([{status:"processing"},{customer:"cus_foreign"},{amount_received:999},{currency:"eur"},{id:"pi_foreign"}])("retains pending review for mismatched or ambiguous retrieved facts %j",async patch=>{
 const deps=setup();deps.payment.mockResolvedValue({id:"pi_owned",status:"succeeded",currency:"usd",amount_received:1000,customer:"cus_owned",...patch});
 expect(await reconcileWorkspacePayment({type:"payment_intent.succeeded",objectId:"pi_owned"},deps)).toEqual({status:"pending_reconciliation"});
 expect(deps.confirm).not.toHaveBeenCalled();
});
it("includes allowance only for a paid invoice with the exact stored price and billing interval",async()=>{
 const deps=setup();
 deps.lookup.mockResolvedValue({id:command.id,payload:{...command.payload,kind:"included",payment_id:"in_paid",paid_microusd:129000000,price_id:"price_access",subscription_id:"sub_owned",period_start:1700000000,period_end:2000000000}});
 deps.invoice.mockResolvedValue({id:"in_paid",status:"paid",currency:"usd",amount_paid:12900,amount_remaining:0,customer:"cus_owned",billing_reason:"subscription_cycle",parent:{subscription_details:{subscription:"sub_owned"}},lines:{has_more:false,data:[{amount:12900,quantity:1,period:{start:1700000000,end:2000000000},pricing:{price_details:{price:"price_access"}}}]},payments:{has_more:false,data:[{status:"paid",amount_paid:12900,payment:{payment_intent:"pi_invoice"}}]}});
 deps.payment.mockResolvedValue({id:"pi_invoice",status:"succeeded",currency:"usd",amount_received:12900,customer:"cus_owned"});
 expect(await reconcileWorkspacePayment({type:"invoice.paid",objectId:"in_paid"},deps)).toEqual({status:"applied",lotId:"lot"});
 expect(deps.confirm).toHaveBeenCalledWith(expect.objectContaining({payment_id:"in_paid",paid_microusd:129000000}));
 deps.confirm.mockClear(); deps.lookup.mockResolvedValue({id:command.id,payload:{...command.payload,kind:"included",payment_id:"in_paid",paid_microusd:129000000,price_id:"price_access",subscription_id:"sub_owned",period_start:1700000001,period_end:2000000000}});
 expect(await reconcileWorkspacePayment({type:"invoice.paid",objectId:"in_paid"},deps)).toEqual({status:"pending_reconciliation"});expect(deps.confirm).not.toHaveBeenCalled();
});
it("provider lookup failure and lost database response are pending, never fabricated success",async()=>{
 const deps=setup();deps.payment.mockRejectedValue(new Error("transport"));
 expect(await reconcileWorkspacePayment({type:"payment_intent.succeeded",objectId:"pi_owned"},deps)).toEqual({status:"pending_reconciliation"});
 expect(deps.confirm).not.toHaveBeenCalled();
});
