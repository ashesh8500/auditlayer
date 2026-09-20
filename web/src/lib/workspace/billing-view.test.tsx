// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { WorkspaceResources } from "@/components/workspace-resources";
import { freeWallet } from "@/lib/commercial-wallet.fixture";
import { WorkspaceBilling } from "./billing-view";
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } }) }));
it("mounts honest unavailable catalog and legacy wallet in the retained owner cache", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host=document.createElement("div"); const root=createRoot(host);
  vi.stubGlobal("fetch",vi.fn(async () => ({ ok:true,json:async()=>({ ownerId:"a",wallet:null,fetchedAt:"2026-09-19T00:00:00Z" }) })));
  const tree = (show:boolean) => <WorkspaceResources ownerId="a" revisions={{reports:"0",subjects:"0",connections:"0"}}>{show && <WorkspaceBilling />}</WorkspaceResources>;
  try {
    await act(async()=>root.render(tree(true)));
    await act(async()=>{await new Promise(r=>setTimeout(r,30));});
    expect(host.textContent).toContain("Existing reports, gifts and trial access are unchanged");
    expect(host.textContent).toContain("View Enrollment");
    expect(host.querySelector("select")).toBeNull();
    expect(host.textContent).toContain("deepseek-v4-flash");
    expect(host.textContent).toContain("gpt-5.6-sol");
    await act(async()=>root.render(tree(false)));
    await act(async()=>root.render(tree(true)));
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally { await act(async()=>root.unmount()); vi.unstubAllGlobals(); }
});
it("renders Free allowance as a UTC calendar period, never Stripe billing", async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement("div"); const root=createRoot(host);
 vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({ownerId:freeWallet.owner_id,wallet:freeWallet,fetchedAt:"2026-09-20T00:00:00Z"})})));
 try {
  await act(async()=>root.render(<WorkspaceResources ownerId={freeWallet.owner_id} revisions={{reports:"0",subjects:"0",connections:"0"}}><WorkspaceBilling /></WorkspaceResources>));
  await act(async()=>{await new Promise(r=>setTimeout(r,50));});
  expect(host.textContent).toContain("Free allowance period (UTC calendar month)");
  expect(host.textContent).toContain("$10.00");
  expect(host.textContent).not.toContain("Last confirmed billing period");
 } finally {await act(async()=>root.unmount());vi.unstubAllGlobals();}
});
