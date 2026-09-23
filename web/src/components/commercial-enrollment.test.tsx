// @vitest-environment jsdom
import React from "react";
import {createRoot} from "react-dom/client";
import {act} from "react";
import {it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({free:vi.fn(),quote:vi.fn(),submit:vi.fn(),paid:vi.fn()}));
vi.mock("@/lib/actions/commercial",()=>({claimFreeAllowance:m.free}));
vi.mock("@/lib/actions/commercial-report",()=>({quoteCommercialReport:m.quote,submitCommercialReport:m.submit}));
vi.mock("@/lib/actions/commercial-billing",()=>({startCommercialCheckout:m.paid}));
import {CommercialEnrollment} from "./commercial-enrollment";
it("explains paused paid enrollment while keeping Free available",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const el=document.createElement("div");const root=createRoot(el);
 try {
  await act(async()=>root.render(<CommercialEnrollment subjects={[]} freeEnabled paidEnabled={false}/>));
  expect(el.textContent?.includes("Paid subscriptions are not available yet. You can start with Free.")).toBe(true);
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
