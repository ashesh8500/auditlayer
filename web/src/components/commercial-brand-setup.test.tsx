// @vitest-environment jsdom
import React, {act} from "react";
import {createRoot} from "react-dom/client";
import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({setup:vi.fn(),push:vi.fn(),refresh:vi.fn()}));
vi.mock("@/lib/actions/commercial-setup",()=>({setupCommercialBrand:m.setup}));
vi.mock("next/navigation",()=>({useRouter:()=>({push:m.push,refresh:m.refresh})}));
import {CommercialBrandSetup} from "./commercial-brand-setup";
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});});
it("requires explicit brief and channel confirmation, retries the same command and returns to quote, never submits",async()=>{
 const host=document.createElement("div");const root=createRoot(host);
 try {
  await act(async()=>root.render(<CommercialBrandSetup/>));
  expect(m.setup).not.toHaveBeenCalled();
  expect(host.textContent).toContain("No report is queued");
  const form=host.querySelector("form")!;
  for(const [name,value] of Object.entries({name:"Fresh",locator:"fresh.brand",identity:"Education brand",audience:"Creators",goal:"Growth"})) (form.elements.namedItem(name) as HTMLInputElement).value=value;
  const checks=Array.from(host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
  expect(checks).toHaveLength(2);for(const c of checks){expect(c.checked).toBe(false);expect(c.required).toBe(true);}
  await act(async()=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(m.setup).not.toHaveBeenCalled();
  for(const c of checks)c.checked=true;
  m.setup.mockResolvedValueOnce({ok:false,error:"Retry same setup"});
  await act(async()=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(host.textContent).toContain("Retry same setup");expect(m.push).not.toHaveBeenCalled();
  const first=m.setup.mock.calls[0][0];expect(first).toMatchObject({confirmed:true,managed:true,name:"Fresh"});
  m.setup.mockResolvedValueOnce({ok:true,channel_id:"channel",subject_id:"brand",brief_id:"brief"});
  await act(async()=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(m.setup.mock.calls[1][0]).toEqual(first);
  expect(m.push).toHaveBeenCalledWith("/commercial?channel=channel");expect(m.refresh).toHaveBeenCalled();
 }finally{await act(async()=>root.unmount());}
});
