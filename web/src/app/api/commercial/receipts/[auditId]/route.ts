import {NextResponse} from "next/server";
import {requireProfile} from "@/lib/auth";
import {createClient} from "@/lib/supabase/server";
type ReadDB={from(name:string):{select(columns:string):{eq(k:string,v:string):{eq(k:string,v:string):{maybeSingle():Promise<{data:Record<string,unknown>|null;error:unknown}>}}}}};
/** Owner-session read only. Null provider liability remains unknown, never zero. */
export async function GET(_request:Request,{params}:{params:Promise<{auditId:string}>}) {
 const profile=await requireProfile();const {auditId}=await params;
 const db=await createClient() as unknown as ReadDB;
 const quote=await db.from("commercial_quotes").select("id").eq("audit_id",auditId).eq("owner_id",profile.id).maybeSingle();
 if(quote.error) return NextResponse.json({error:"receipt_unavailable"},{status:503});
 if(!quote.data || typeof quote.data.id!=="string") return NextResponse.json({error:"not_found"},{status:404});
 const receipt=await db.from("workspace_credit_reservations").select("state,retail_microusd,customer_debit_microusd,actual_upstream_microusd,terminal_payload").eq("id",quote.data.id).eq("owner_id",profile.id).maybeSingle();
 if(receipt.error || !receipt.data) return NextResponse.json({error:"receipt_unavailable"},{status:503});
 return NextResponse.json(receipt.data,{headers:{"Cache-Control":"private, no-store"}});
}
