import Link from "next/link";
import {requireProfile} from "@/lib/auth";
import {createClient} from "@/lib/supabase/server";
import {CommercialEnrollment,type CommercialSubject} from "@/components/commercial-enrollment";
export default async function CommercialPage() {
 const profile=await requireProfile();const db=await createClient();
 const {data,error}=await db.from("subjects").select("id,name,living_brief_versions(id,version,confirmed),subject_channels(id,locator,channel_type,managed)").eq("user_id",profile.id);
 if(error) throw new Error("Brand briefs could not be loaded.");
 const subjects:CommercialSubject[]=(data??[]).flatMap(s=>{
  const brief=[...s.living_brief_versions].filter(b=>b.confirmed).sort((a,b)=>b.version-a.version)[0];
  return brief?s.subject_channels.filter(c=>c.managed).map(c=>({id:s.id,name:`${s.name} · ${c.channel_type}: ${c.locator}`,brief_id:brief.id,channel_id:c.id})):[];
 });
 return <main className="mx-auto max-w-3xl space-y-6 px-4 py-10"><h1 className="text-3xl font-semibold">Credits and Reports</h1>{subjects.length === 0 && <p>No managed channels with a confirmed brief yet.</p>}<p><Link href="/settings/billing" className="alm-focus inline-flex min-h-11 items-center underline">Balance and billing</Link> · <Link href="/subjects" className="alm-focus inline-flex min-h-11 items-center underline">Brands</Link></p><CommercialEnrollment subjects={subjects} freeEnabled={process.env.ALM_COMMERCIAL_FREE_ENABLED==="1"} paidEnabled={process.env.ALM_COMMERCIAL_PAID_ENABLED==="1"}/></main>;
}
