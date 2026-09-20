"use server";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parseCommercialWallet } from "@/lib/commercial-wallet";

type Result={data:unknown;error:unknown};
/** Explicit opt-in only; a prefetched page or wallet GET never grants credit. */
export async function claimFreeAllowance():Promise<{ok:true}|{ok:false;error:string}> {
  if(process.env.ALM_COMMERCIAL_FREE_ENABLED!=="1") return {ok:false,error:"Free credit enrollment is not available yet."};
  try {
    const profile=await requireProfile();
    const admin=createAdminClient() as unknown as {rpc(name:"commercial_free_grant",args:{p:{owner_id:string}}):Promise<Result>};
    const grant=await admin.rpc("commercial_free_grant",{p:{owner_id:profile.id}});
    if(grant.error || typeof grant.data!=="string") throw new Error("grant_failed");
    const session=await createClient() as unknown as {rpc(name:"commercial_credit_wallet"):Promise<Result>};
    const readback=await session.rpc("commercial_credit_wallet");
    if(readback.error) throw new Error("readback_failed");
    const wallet=parseCommercialWallet(readback.data);
    if(wallet.owner_id!==profile.id || wallet.commercial_plan!=="free" || Date.parse(wallet.period_end)<=Date.now()) throw new Error("grant_unverified");
    return {ok:true};
  } catch {
    return {ok:false,error:"Allowance could not be confirmed. Verify your email and try again. Existing purchases and gifts are unchanged."};
  }
}
