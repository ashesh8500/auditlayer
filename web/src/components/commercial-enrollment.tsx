"use client";
import React,{useState} from "react";
import Link from "next/link";
import {Button} from "@/components/ui/button";
import {claimFreeAllowance} from "@/lib/actions/commercial";
import {quoteCommercialReport,submitCommercialReport} from "@/lib/actions/commercial-report";
import {startCommercialCheckout} from "@/lib/actions/commercial-billing";
export type CommercialSubject={id:string;name:string;brief_id:string;channel_id:string};
export function CommercialEnrollment({subjects,freeEnabled,paidEnabled,selectedChannel}:{subjects:CommercialSubject[];freeEnabled:boolean;paidEnabled:boolean;selectedChannel?:string}) {
 const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
 const [quote,setQuote]=useState<{id:string;retail_microusd:number;expires_at:string}|null>(null);
 return <div className="space-y-6">
  <section className="alm-panel space-y-3 p-5"><h2 className="text-xl font-semibold">Enrollment</h2>
   <p>Free: 500 credits each UTC calendar month, plus 500 welcome credits once. Both expire at the end of the grant month. Renewal happens only when you request it or submit a report, never when viewing a page.</p>
   <Button disabled={!freeEnabled||busy} onClick={async()=>{setBusy(true);try{const r=await claimFreeAllowance();setMessage(r.ok?"Allowance confirmed. You can request a quote.":r.error);}finally{setBusy(false);}}}>Enroll or Renew Free</Button>
   <div className="flex flex-wrap gap-3"><Button disabled={!paidEnabled||busy} onClick={()=>startCommercialCheckout("brand")}>Brand — $199 / Month</Button><Button disabled={!paidEnabled||busy} onClick={()=>startCommercialCheckout("studio")}>Studio — $499 / Month</Button></div>
   {!paidEnabled && <p className="text-sm text-muted-foreground">Paid subscriptions are not available yet.{freeEnabled ? " You can start with Free." : " Please check back."}</p>}
   <p className="text-sm text-muted-foreground">Paid top-ups are closed pending expiry and refund terms. No automatic overages. Existing subscriptions and gifts are not converted.</p>
  </section>
  <section className="alm-panel space-y-3 p-5"><h2 className="text-xl font-semibold">Quote a Report</h2>
  {subjects.length===0?<p><Link href="/commercial/setup" className="alm-focus inline-flex min-h-11 items-center underline">Create a brand and confirm its brief</Link> before requesting a report.</p>:<form className="space-y-3" onChange={()=>setQuote(null)} onSubmit={async e=>{e.preventDefault();setBusy(true);const data=new FormData(e.currentTarget);const subject=subjects.find(s=>s.channel_id===data.get("subject"));try{const r=await quoteCommercialReport({subject_id:subject?.id,brief_id:subject?.brief_id,channel_id:subject?.channel_id,goal:data.get("goal"),report_type:"standard"});if(r.ok){setQuote(r.quote);setMessage("");}else setMessage(r.error);}finally{setBusy(false);}}}>
   <label className="block">Brand<select className="alm-focus ml-3 min-h-11 max-w-full border p-2" name="subject" defaultValue={subjects.some(s=>s.channel_id===selectedChannel)?selectedChannel:subjects[0]?.channel_id}>{subjects.map(s=><option key={s.channel_id} value={s.channel_id}>{s.name}</option>)}</select></label>
   <label className="block">Goal<input className="alm-focus ml-3 min-h-11 max-w-full border p-2" name="goal" required maxLength={200}/></label>
   <Button disabled={busy}>Request Quote</Button>
  </form>}
  {quote&&<div className="space-y-3"><p>Maximum {(quote.retail_microusd/10000).toLocaleString()} credits. Quote expires {new Date(quote.expires_at).toLocaleString()}. Failed reports have no customer debit.</p><Button disabled={busy} onClick={async()=>{setBusy(true);try{const r=await submitCommercialReport(quote.id,true);if(r.ok) window.location.assign(`/audits/${r.auditId}`);else setMessage(r.error);}finally{setBusy(false);}}}>Accept Maximum and Submit</Button></div>}
  </section>
  {message&&<p role="status">{message}</p>}
 </div>;
}
