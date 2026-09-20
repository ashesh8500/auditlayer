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
it("Free allowance is an explicit user command, never a render effect",async()=>{
 (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const el=document.createElement("div");const root=createRoot(el);m.free.mockResolvedValue({ok:true});
 await act(async()=>{root.render(<CommercialEnrollment subjects={[]} freeEnabled paidEnabled={false}/>);});
 expect(m.free).not.toHaveBeenCalled();
 const button=Array.from(el.querySelectorAll("button")).find(b=>b.textContent?.includes("Free"))!;
 await act(async()=>button.click());expect(m.free).toHaveBeenCalledTimes(1);expect(el.textContent).toContain("Allowance confirmed");
 await act(async()=>root.unmount());
});
