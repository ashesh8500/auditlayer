// @vitest-environment jsdom
import React from "react";
import {createRoot} from "react-dom/client";
import {act} from "react";
import {it,expect,vi,beforeEach} from "vitest";
const m=vi.hoisted(()=>({free:vi.fn(),quote:vi.fn(),submit:vi.fn(),paid:vi.fn()}));
vi.mock("@/lib/actions/commercial",()=>({claimFreeAllowance:m.free}));
vi.mock("@/lib/actions/commercial-report",()=>({quoteCommercialReport:m.quote,submitCommercialReport:m.submit}));
vi.mock("@/lib/actions/commercial-billing",()=>({startCommercialCheckout:m.paid}));
import {CommercialEnrollment} from "./commercial-enrollment";
beforeEach(()=>vi.clearAllMocks());
it("returns from setup to the selected channel and queues nothing until maximum acceptance",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const el=document.createElement("div");const root=createRoot(el);
 const subjects=[{id:"brand-one",name:"Other",brief_id:"brief-one",channel_id:"one"},{id:"brand-two",name:"Fresh",brief_id:"brief-two",channel_id:"two"}];
 m.quote.mockResolvedValue({ok:true,quote:{id:"quote",retail_microusd:600000,expires_at:"2030-10-01T00:00:00Z"}});
 m.submit.mockResolvedValue({ok:false,error:"Retry the same quote"});
 try {
  await act(async()=>root.render(<CommercialEnrollment subjects={subjects} selectedChannel="two" freeEnabled paidEnabled={false}/>));
  expect((el.querySelector('select[name="subject"]') as HTMLSelectElement).value).toBe("two");
  expect(m.quote).not.toHaveBeenCalled();expect(m.submit).not.toHaveBeenCalled();
  (el.querySelector('input[name="goal"]') as HTMLInputElement).value="Grow";
  await act(async()=>el.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(m.quote).toHaveBeenCalledWith({subject_id:"brand-two",brief_id:"brief-two",channel_id:"two",goal:"Grow",report_type:"standard"});
  expect(el.textContent).toContain("Maximum 60 credits");expect(m.submit).not.toHaveBeenCalled();
  const accept=Array.from(el.querySelectorAll("button")).find(b=>b.textContent==="Accept Maximum and Submit")!;
  await act(async()=>accept.click());
  expect(m.submit).toHaveBeenCalledExactlyOnceWith("quote",true);
  await act(async()=>accept.click());expect(m.submit).toHaveBeenLastCalledWith("quote",true);
 } finally {await act(async()=>root.unmount());}
});
it("explains paused paid enrollment while keeping Free available",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const el=document.createElement("div");const root=createRoot(el);
 try {
  await act(async()=>root.render(<CommercialEnrollment subjects={[]} freeEnabled paidEnabled={false}/>));
  expect(el.textContent?.includes("Paid subscriptions are not available yet. You can start with Free.")).toBe(true);
  expect(el.querySelector('a[href="/commercial/setup"]')).not.toBeNull();
  for(const label of ["Brand", "Studio"]) expect(Array.from(el.querySelectorAll("button")).find(b=>b.textContent?.startsWith(label))?.disabled).toBe(true);
  expect(Array.from(el.querySelectorAll("button")).find(b=>b.textContent?.includes("Free"))?.disabled).toBe(false);
  await act(async()=>root.render(<CommercialEnrollment subjects={[]} freeEnabled paidEnabled/>));
  expect(el.textContent?.includes("Paid subscriptions are not available yet.")).toBe(false);
 } finally {await act(async()=>root.unmount());}
});
it("Free allowance is an explicit user command, never a render effect",async()=>{
 (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const el=document.createElement("div");const root=createRoot(el);m.free.mockResolvedValue({ok:true});
 await act(async()=>{root.render(<CommercialEnrollment subjects={[]} freeEnabled paidEnabled={false}/>);});
 expect(m.free).not.toHaveBeenCalled();
 const button=Array.from(el.querySelectorAll("button")).find(b=>b.textContent?.includes("Free"))!;
 await act(async()=>button.click());expect(m.free).toHaveBeenCalledTimes(1);expect(el.textContent).toContain("Allowance confirmed");
 await act(async()=>root.unmount());
});
