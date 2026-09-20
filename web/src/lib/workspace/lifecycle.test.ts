import { expect, it, vi } from "vitest";
import { cancelWorkspaceSubscription, requestWorkspaceRefund } from "./lifecycle";
const OWNER="11111111-1111-4111-8111-111111111111";
function setup(amount=70000000) {
 const freeze=vi.fn(async()=>({refundId:"freeze-1",amountMicrousd:amount}));
 const createRefund=vi.fn(async()=>({id:"re_1"}));
 const cancelProvider=vi.fn(async()=>({id:"sub_owned"}));
 const recordAction=vi.fn(async()=>"action-1");
 return {freeze,createRefund,cancelProvider,recordAction};
}
it("freezes liability, then refunds with a stable provider idempotency key bound to the freeze",async()=>{
 const p=setup();
 expect(await requestWorkspaceRefund({ownerId:OWNER,requestId:"pilot-cancel-1",subscriptionId:"sub_owned"},p)).toEqual({status:"applied",refundId:"freeze-1",providerRefundId:"re_1"});
 expect(p.createRefund).toHaveBeenCalledWith({amountMicrousd:70000000,idempotencyKey:"workspace-refund:freeze-1",requestId:"pilot-cancel-1"});
 expect(p.recordAction).toHaveBeenCalledWith(expect.objectContaining({ownerId:OWNER,kind:"refund",subjectId:"freeze-1",idempotencyKey:"workspace-refund:freeze-1",status:"succeeded",amountMicrousd:70000000,providerObjectId:"re_1"}));
 p.createRefund.mockClear();
 await requestWorkspaceRefund({ownerId:OWNER,requestId:"pilot-cancel-1",subscriptionId:"sub_owned"},p);
 expect(p.createRefund).toHaveBeenCalledWith(expect.objectContaining({idempotencyKey:"workspace-refund:freeze-1"}));
});
it("records an ambiguous provider refund as pending instead of claiming success or retrying blindly",async()=>{
 const p=setup(); p.createRefund.mockRejectedValue(new Error("transport"));
 expect(await requestWorkspaceRefund({ownerId:OWNER,requestId:"pilot-cancel-1",subscriptionId:"sub_owned"},p)).toEqual({status:"pending_reconciliation",refundId:"freeze-1"});
 expect(p.recordAction).toHaveBeenCalledWith(expect.objectContaining({status:"pending",providerObjectId:null,amountMicrousd:null}));
});
it("does not claim the refund is missing when only the local record write fails",async()=>{
 const p=setup(); p.recordAction.mockRejectedValue(new Error("db"));
 expect(await requestWorkspaceRefund({ownerId:OWNER,requestId:"pilot-cancel-1",subscriptionId:"sub_owned"},p)).toEqual({status:"pending_reconciliation",refundId:"freeze-1",providerRefundId:"re_1"});
});
it("skips the provider call when nothing is frozen",async()=>{
 const p=setup(0);
 expect(await requestWorkspaceRefund({ownerId:OWNER,requestId:"pilot-cancel-1",subscriptionId:"sub_owned"},p)).toEqual({status:"nothing_to_refund",refundId:"freeze-1"});
 expect(p.createRefund).not.toHaveBeenCalled();
});
it("cancels the credit contract first and records the provider cancellation with a stable key",async()=>{
 const p=setup();
 const cancelCredit=vi.fn(async()=>"sub_owned");
 expect(await cancelWorkspaceSubscription({ownerId:OWNER,subscriptionId:"sub_owned"},{...p,cancelCredit})).toEqual({status:"applied",providerSubscriptionId:"sub_owned"});
 expect(cancelCredit).toHaveBeenCalledWith({ownerId:OWNER,subscriptionId:"sub_owned"});
 expect(p.cancelProvider).toHaveBeenCalledWith({subscriptionId:"sub_owned",idempotencyKey:"workspace-cancel:sub_owned"});
 expect(p.recordAction).toHaveBeenCalledWith(expect.objectContaining({kind:"cancellation",subjectId:"sub_owned",status:"succeeded",amountMicrousd:null}));
});
it("records an ambiguous provider cancellation as pending and never unfreezes credit",async()=>{
 const p=setup(); p.cancelProvider.mockRejectedValue(new Error("transport"));
 const cancelCredit=vi.fn(async()=>"sub_owned");
 expect(await cancelWorkspaceSubscription({ownerId:OWNER,subscriptionId:"sub_owned"},{...p,cancelCredit})).toEqual({status:"pending_reconciliation"});
 expect(p.recordAction).toHaveBeenCalledWith(expect.objectContaining({status:"pending",amountMicrousd:null}));
});
it("refuses to touch the provider when the credit contract cannot be cancelled authoritatively",async()=>{
 const p=setup(); const cancelCredit=vi.fn(async()=>{throw new Error("cancel_authority");});
 expect(await cancelWorkspaceSubscription({ownerId:OWNER,subscriptionId:"sub_owned"},{...p,cancelCredit})).toEqual({status:"error"});
 expect(p.cancelProvider).not.toHaveBeenCalled();
});
