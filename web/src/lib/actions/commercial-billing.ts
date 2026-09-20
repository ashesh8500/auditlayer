"use server";
import {redirect} from "next/navigation";
import {requireProfile} from "@/lib/auth";
import {createAdminClient} from "@/lib/supabase/admin";
import {getStripe} from "@/lib/stripe";
import {siteUrl} from "@/lib/env";
import {runCommercialCheckout,type PaidCommercialPlan} from "@/lib/commercial-checkout";
type DB={rpc(name:string,args:{p:Record<string,unknown>}):Promise<{data:unknown;error:unknown}>;from(name:string):{select(columns:string):{eq(k:string,v:string):{maybeSingle():Promise<{data:unknown;error:unknown}>}}}};
export async function startCommercialCheckout(plan:PaidCommercialPlan):Promise<void> {
 const profile=await requireProfile();
 let url="/commercial?payment=unavailable";
 if(process.env.ALM_COMMERCIAL_PAID_ENABLED==="1") {
  try {
   const stripe=getStripe();if(!stripe) throw new Error("stripe_unconfigured");
   const db=createAdminClient() as unknown as DB;
   url=await runCommercialCheckout(profile.id,plan,{origin:siteUrl(),existing:sid=>stripe.checkout.sessions.retrieve(sid),price:pid=>stripe.prices.retrieve(pid),session:(params,key)=>stripe.checkout.sessions.create(params,{idempotencyKey:key}),reserve:async(owner,selected)=>{
    const r=await db.rpc("commercial_checkout_reserve",{p:{owner_id:owner,plan:selected}});
    if(r.error || !r.data) throw new Error("checkout_admission_failed");
    return r.data as {id:string;customer_id:string|null};
   },bind:async(intent,session)=>{
    const r=await db.rpc("commercial_checkout_bind",{p:{owner_id:profile.id,id:intent,session_id:session}});if(r.error) throw new Error("checkout_bind_failed");
    const read=await db.from("commercial_checkouts").select("session_id,owner_id").eq("id",intent).maybeSingle();
    const row=read.data as {session_id?:string;owner_id?:string}|null;
    if(read.error || row?.session_id!==session || row.owner_id!==profile.id) throw new Error("checkout_unverified");
   }});
  } catch {url="/commercial?payment=unconfirmed";}
 }
 redirect(url);
}
