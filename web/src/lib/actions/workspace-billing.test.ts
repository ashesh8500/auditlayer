import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({profile:vi.fn(),cycle:vi.fn(),refund:vi.fn(),cancel:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/auth",()=>({requireProfile:mocks.profile}));
vi.mock("@/lib/env",()=>({isSupabaseAdminConfigured:()=>true}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({from:()=>({select:()=>({eq:()=>({order:()=>({limit:()=>({maybeSingle:mocks.cycle})})})})})})}));
vi.mock("@/lib/workspace/lifecycle-server",()=>({requestWorkspaceRefund:mocks.refund,cancelWorkspaceSubscription:mocks.cancel}));
import { requestPilotCancellationAction } from "./workspace-billing";
beforeEach(()=>{vi.clearAllMocks();mocks.profile.mockResolvedValue({id:"owner-1"});});
it("refuses without a session before any provider or credit call",async()=>{
 mocks.profile.mockRejectedValueOnce(new Error("unauthenticated"));
 expect(await requestPilotCancellationAction({subscriptionId:"sub_owned"})).toEqual({ok:false,error:"Sign in again to manage billing."});
 expect(mocks.refund).not.toHaveBeenCalled();expect(mocks.cancel).not.toHaveBeenCalled();
});
it("refuses a subscription that is not the owner's current workspace contract",async()=>{
 mocks.cycle.mockResolvedValue({data:{subscription_id:"sub_owned"},error:null});
 expect(await requestPilotCancellationAction({subscriptionId:"sub_foreign"})).toEqual({ok:false,error:"No workspace credit contract on this account. Your existing report access is unchanged."});
 expect(mocks.refund).not.toHaveBeenCalled();expect(mocks.cancel).not.toHaveBeenCalled();
});
it("refuses when the account has no workspace contract at all",async()=>{
 mocks.cycle.mockResolvedValue({data:null,error:null});
 expect(await requestPilotCancellationAction({subscriptionId:"sub_owned"})).toEqual({ok:false,error:"No workspace credit contract on this account. Your existing report access is unchanged."});
 expect(mocks.refund).not.toHaveBeenCalled();
});
it("uses the session owner and a stable request id, and never reports pending as success",async()=>{
 mocks.cycle.mockResolvedValue({data:{subscription_id:"sub_owned"},error:null});
 mocks.refund.mockResolvedValue({status:"pending_reconciliation",refundId:"freeze-1"});
 mocks.cancel.mockResolvedValue({status:"applied",providerSubscriptionId:"sub_owned"});
 const result=await requestPilotCancellationAction({subscriptionId:"sub_owned"});
 expect(result).toEqual({ok:true,status:"pending_reconciliation",cancellation:"applied",refundId:"freeze-1"});
 expect(mocks.refund).toHaveBeenCalledWith({ownerId:"owner-1",requestId:"workspace-pilot-cancel:owner-1:sub_owned",subscriptionId:"sub_owned"});
 expect(mocks.cancel).toHaveBeenCalledWith({ownerId:"owner-1",subscriptionId:"sub_owned"});
});
it("reports a bounded error when the freeze itself fails",async()=>{
 mocks.cycle.mockResolvedValue({data:{subscription_id:"sub_owned"},error:null});
 mocks.refund.mockResolvedValue({status:"error"});
 mocks.cancel.mockResolvedValue({status:"error"});
 expect(await requestPilotCancellationAction({subscriptionId:"sub_owned"})).toEqual({ok:false,error:"We couldn't start the cancellation. No new charges were made; contact support to finish it."});
});
