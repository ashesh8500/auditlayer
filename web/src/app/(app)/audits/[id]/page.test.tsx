import { beforeEach, expect, it, vi } from "vitest";
import { isValidElement, type ReactNode } from "react";

const state = vi.hoisted(() => ({
  authorized: false,
  found: true,
  auditOwner: "owner",
  handle: "example",
  reportPath: "reports/owned.html" as string|null,
  selections: [] as Array<[string,string]>,
  started: [] as string[],
  filters: [] as Array<[string, string, unknown]>,
  resolve: {} as Record<string, (value: unknown) => void>,
  reject: {} as Record<string, (reason: Error) => void>,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireProfile: async () => { state.authorized = true; return { id: "owner", role: "admin" }; } }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/components/report-viewer", () => ({ ReportViewer: () => null }));
vi.mock("@/components/share-links", () => ({ ShareLinks: () => null }));
vi.mock("@/components/intelligence/customer-wait-state", () => ({ CustomerWaitState: () => null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: (table: string) => {
    expect(state.authorized).toBe(true);
    const query = {
      select: (fields:string) => {state.selections.push([table,fields]);return query;},
      eq: (key: string, value: unknown) => { state.filters.push([table, key, value]); return query; },
      maybeSingle: async () => ({ data: state.found ? { id: "audit", user_id: state.auditOwner, status: "ready", handle: state.handle, platform: "instagram", limitations: [], report_path:state.reportPath } : null }),
      order: () => ({ then: (resolve: (value: unknown) => void, reject: (reason: Error) => void) => {
        state.started.push(table); state.resolve[table] = resolve; state.reject[table] = reject;
      } }),
    };
    return query;
  } }),
}));
import { renderToStaticMarkup } from "react-dom/server";
const contextRead=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/audit-context",()=>({loadAuditContext:contextRead}));
const artifact=vi.hoisted(()=>({html:'<section><h2>Executive Summary</h2><p>Evidence</p></section>' as string|null}));
vi.mock("@/lib/env",()=>({isSupabaseAdminConfigured:()=>true}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({storage:{from:()=>({download:async()=>({data:artifact.html===null?null:{text:async()=>artifact.html},error:artifact.html===null?{message:'private missing path'}:null})})}})}));
import AuditDetailPage from "./page";

function readyElement(node: ReactNode, name="ReadyReport"): { type: (props: unknown) => Promise<ReactNode>; props: unknown } | undefined {
  if (Array.isArray(node)) return node.map(child=>readyElement(child,name)).find(Boolean);
  if (!isValidElement<{ children?: ReactNode }>(node)) return;
  if (typeof node.type === "function" && node.type.name === name) return node as never;
  return readyElement(node.props.children,name);
}
beforeEach(() => { state.handle="example"; state.authorized = false; state.found = true; state.auditOwner = "owner"; state.reportPath="reports/owned.html"; state.selections=[]; state.started = []; state.filters = []; state.resolve = {}; state.reject = {}; });

it("preserves website report titles without inventing a social handle",async()=>{
 state.handle="https://example.com/a-very-long-website-report-path";
 const root=await AuditDetailPage({params:Promise.resolve({id:"audit"})});
 function heading(node:ReactNode):ReactNode {
  if(Array.isArray(node))return node.map(heading).find(Boolean);
  if(!isValidElement<{children?:ReactNode}>(node))return null;
  return node.type==='h1'?node.props.children:heading(node.props.children);
 }
 expect([heading(root)].flat().join('')).toBe(state.handle);
});
it("owner-scopes the customer detail query even for an admin", async () => {
  await AuditDetailPage({ params: Promise.resolve({ id: "audit" }) });
  expect(state.filters).toContainEqual(["audits", "user_id", "owner"]);
});
it("rejects a foreign audit under broad admin visibility before metadata", async () => {
  state.auditOwner = "foreign-owner";
  await expect(AuditDetailPage({ params: Promise.resolve({ id: "foreign" }) })).rejects.toThrow("NOT_FOUND");
  expect(state.started).toEqual([]);
});
it("starts all independent report metadata reads together after authorization", async () => {
  const element = readyElement(await AuditDetailPage({ params: Promise.resolve({ id: "audit" }) }));
  expect(element).toBeDefined();
  const pending = element!.type(element!.props);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect([...state.started].sort()).toEqual(["audit_report_versions", "refinements", "share_links"]);
  for (const table of state.started) state.resolve[table]({ data: [] });
  await expect(pending).resolves.toBeDefined();
});

it("keeps the authorized report available if optional share metadata throws", async () => {
  const element = readyElement(await AuditDetailPage({ params: Promise.resolve({ id: "audit" }) }));
  const pending = element!.type(element!.props);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(state.started).toContain("share_links");
  state.reject.share_links(new Error("temporary share outage"));
  state.resolve.refinements({ data: [] });
  state.resolve.audit_report_versions({ data: [] });
  await expect(pending).resolves.toBeDefined();
});

it("does not serialize share verification material into client props",async()=>{
 const element=readyElement(await AuditDetailPage({params:Promise.resolve({id:"audit"})}));
 const pending=element!.type(element!.props);await new Promise(resolve=>setTimeout(resolve,0));
 for(const table of state.started)state.resolve[table]({data:table==='share_links'?[{id:'link',token:'capability',verification_code:'DO-NOT-SERIALIZE',verification_expires_at:'PRIVATE',mode:'email'}]:[]});
 const result=JSON.stringify(await pending,(key,value)=>key==='type'||key==='_owner'?undefined:value);
 expect(result).not.toContain('DO-NOT-SERIALIZE');expect(result).not.toContain('verification_expires_at');
 expect(state.selections.find(([table])=>table==='share_links')?.[1]).not.toBe('*');
});

it("shows a share load failure rather than a false empty list",async()=>{
 const element=readyElement(await AuditDetailPage({params:Promise.resolve({id:"audit"})}));
 const pending=element!.type(element!.props);await new Promise(resolve=>setTimeout(resolve,0));
 for(const table of state.started)state.resolve[table]({data:[],error:table==='share_links'?{message:'private DB failure'}:null});
 const result=JSON.stringify(await pending,(key,value)=>key==='type'||key==='_owner'?undefined:value);
 expect(result).toContain('Sharing is temporarily unavailable');expect(result).not.toContain('private DB failure');
});

it("offers no report actions when ready status has no artifact",async()=>{
 state.reportPath=null;
 const element=readyElement(await AuditDetailPage({params:Promise.resolve({id:"audit"})}));
 const pending=element!.type(element!.props);await new Promise(resolve=>setTimeout(resolve,0));
 for(const table of state.started)state.resolve[table]({data:[]});
 const result=JSON.stringify(await pending,(key,value)=>key==='type'||key==='_owner'?undefined:value);
 expect(result).toContain('Report unavailable');expect(result).not.toContain('/audits/audit/read');
});

it("restores subject and sibling navigation for multi-channel submissions",async()=>{
 contextRead.mockResolvedValue({subject:{id:'s',name:'Brand'},audits:[{id:'audit',handle:'brand',status:'running'},{id:'sibling',handle:'website.example',status:'ready'}]});
 const element=readyElement(await AuditDetailPage({params:Promise.resolve({id:'audit'})}),"AuditContext");
 expect(element).toBeDefined();
 const html=renderToStaticMarkup(await element!.type(element!.props));
 expect(html).toContain('href="/subjects/s"');expect(html).toContain('href="/audits/sibling"');expect(html).toContain('website.example');
 expect(contextRead.mock.calls[0].slice(1)).toEqual(['audit','owner']);
});

it("keeps internal method versions out of customer report chrome",async()=>{
 const root=await AuditDetailPage({params:Promise.resolve({id:'audit'})});
 expect(JSON.stringify(root,(key,value)=>key==='type'||key==='_owner'?undefined:value)).not.toContain('Method');
});

it("binds refinement choices to the stored artifact and current report version",async()=>{
 const element=readyElement(await AuditDetailPage({params:Promise.resolve({id:'audit'})}));
 const pending=element!.type(element!.props);await new Promise(r=>setTimeout(r,0));
 for(const table of state.started)state.resolve[table]({data:[]});
 const viewer=readyElement(await pending,'ReportViewer');
 expect(viewer?.props).toMatchObject({editableSections:['Executive Summary'],reportVersion:0,reportReady:true});
});
it("withholds all ready controls when Storage cannot supply the artifact",async()=>{
 artifact.html=null;
 try{
 const element=readyElement(await AuditDetailPage({params:Promise.resolve({id:'audit'})}));
 const pending=element!.type(element!.props);await new Promise(r=>setTimeout(r,0));
 for(const table of state.started)state.resolve[table]({data:[]});
 const result=await pending;
 expect(readyElement(result,'ShareLinks')).toBeUndefined();expect(readyElement(result,'ReportViewer')).toBeUndefined();
 expect(JSON.stringify(result,(k,v)=>k==='type'||k==='_owner'?undefined:v)).toContain('Report unavailable');
 }finally{artifact.html='<section><h2>Executive Summary</h2><p>Evidence</p></section>';}
});

it("does not start report metadata when the authorized audit is absent", async () => {
  state.found = false;
  await expect(AuditDetailPage({ params: Promise.resolve({ id: "foreign" }) })).rejects.toThrow("NOT_FOUND");
  expect(state.started).toEqual([]);
});
