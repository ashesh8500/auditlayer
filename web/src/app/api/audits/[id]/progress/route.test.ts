import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: { id: "owner-a" } as {id:string}|null, audit: {status:"running",created_at:new Date().toISOString(),claimed_at:null}, auditError:null as null|{message:string}, eventError:null as null|{message:string}, filters:[] as [string,string,unknown][], tables:[] as string[] }));
vi.mock("@/lib/supabase/server", () => ({ createClient:async()=>({ auth:{getUser:async()=>({data:{user:state.user}})}, from:(table:string)=>{
  state.tables.push(table);
  const result = () => table === "audits" ? {data:state.audit,error:state.auditError}
    : table === "audit_events" ? {data:[{phase:"research",event_type:"research_started",detail:"audit=private-internal-id",created_at:new Date().toISOString()}],error:state.eventError}
    : table === "batch_audits" ? {data:{batch_id:"new-batch",audit_batches:{subject_id:"shared-subject"}},error:null}
    : {data:{customer_state:"succeeded",detail:"audit=OTHER-AUDIT",updated_at:new Date().toISOString()},error:null};
  const chain = { select:vi.fn(()=>chain),eq:vi.fn((key:string,value:unknown)=>{state.filters.push([table,key,value]);return chain;}),order:vi.fn(()=>chain),limit:vi.fn(()=>chain),maybeSingle:async()=>result(),then:(resolve:(value:ReturnType<typeof result>)=>void)=>Promise.resolve(result()).then(resolve) };
  return chain;
}}) }));
import { GET } from "./route";
const request = () => GET(new Request("https://alm.test/api/audits/a/progress"),{params:Promise.resolve({id:"audit-a"})});
beforeEach(()=>{state.user={id:"owner-a"};state.audit={status:"running",created_at:new Date().toISOString(),claimed_at:null};state.auditError=null;state.eventError=null;state.filters=[];state.tables=[];});
describe("customer audit progress boundary",()=>{
 it("never uses a previous or sibling subject run as this audit's terminal status",async()=>{
  const response=await request();const body=await response.json();
  expect(response.status).toBe(200);expect(body.terminal).toBeNull();
  expect(JSON.stringify(body)).not.toContain("audit=");
  expect(state.tables).not.toContain("intelligence_run_progress");
 });
 it("scopes the root to the signed-in owner even when the DB user is an admin",async()=>{
  await request();expect(state.filters).toContainEqual(["audits","user_id","owner-a"]);
 });
 it("returns no private diagnostic database error",async()=>{
  state.auditError={message:"secret SQL and private row"};const response=await request();
  expect(response.status).toBe(500);expect(JSON.stringify(await response.json())).not.toContain("secret SQL");
 });
 it("does not disguise event read failure as healthy empty progress",async()=>{
  state.eventError={message:"private error"};expect((await request()).status).toBe(503);
 });
 it("denies before querying when signed out",async()=>{
  state.user=null;expect((await request()).status).toBe(401);expect(state.tables).toEqual([]);
 });
 it("takes terminal status from the audit itself",async()=>{
  state.audit.status="needs_review";expect((await (await request()).json()).terminal).toBe("needs_review");
 });
});
