"use server";
import {z} from "zod";
import {requireProfile} from "@/lib/auth";
import {createAdminClient} from "@/lib/supabase/admin";
import {createClient} from "@/lib/supabase/server";
const request=z.object({subject_id:z.uuid(),brief_id:z.uuid(),channel_id:z.uuid(),goal:z.string().trim().min(1).max(200),report_type:z.literal("standard")});
const quote=z.object({id:z.uuid(),retail_microusd:z.number().int().positive(),expires_at:z.iso.datetime()});
type RPC={rpc(name:string,args:{p:Record<string,unknown>}):Promise<{data:unknown;error:unknown}>};
const unavailable={ok:false as const,error:"Report execution is not available until the evidence and bounded runtime checks pass."};
export async function quoteCommercialReport(input:unknown) {
 if(process.env.ALM_COMMERCIAL_EXECUTION_ENABLED!=="1") return unavailable;
 try {
  const profile=await requireProfile();const parsed=request.parse(input);
  const admin=createAdminClient() as unknown as RPC;
  const result=await admin.rpc("commercial_quote",{p:{...parsed,owner_id:profile.id}});
  if(result.error) throw new Error("quote_failed");
  return {ok:true as const,quote:quote.parse(result.data)};
 } catch {return {ok:false as const,error:"Quote unavailable. Enroll, confirm your brand brief, and retry. Only qualified models can run."};}
}
export async function submitCommercialReport(quoteId:string,consent:boolean) {
 if(process.env.ALM_COMMERCIAL_EXECUTION_ENABLED!=="1") return unavailable;
 try {
  const profile=await requireProfile();z.uuid().parse(quoteId);if(consent!==true) throw new Error("consent_required");
  const admin=createAdminClient() as unknown as RPC;
  const result=await admin.rpc("commercial_submit",{p:{owner_id:profile.id,quote_id:quoteId,consent:true}});
  if(result.error || typeof result.data!=="string") throw new Error("submit_failed");
  const session=await createClient();
  const read=await session.from("audits").select("id").eq("id",result.data).eq("user_id",profile.id).maybeSingle();
  if(read.error || read.data?.id!==result.data) throw new Error("submission_unverified");
  return {ok:true as const,auditId:result.data};
 } catch {return {ok:false as const,error:"Submission not confirmed. Retry the same quote; an accepted report will not be charged twice."};}
}
