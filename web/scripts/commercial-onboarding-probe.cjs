/* eslint-disable @typescript-eslint/no-require-imports -- Disposable CJS test harness. */
// Actual production actions against migrated disposable PostgreSQL. Only framework,
// authenticated identity and Supabase transport are adapted; no simulated RPCs.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {execFileSync} = require("node:child_process");
const assert = require("node:assert/strict");
const esbuild = require("esbuild");
const fixture = JSON.parse(fs.readFileSync(0, "utf8"));
assert.match(fixture.container, /^alm-brand-setup-[a-f0-9]{12}$/);
assert.match(fixture.owner, /^[a-f0-9-]{36}$/);
const root = path.resolve(__dirname, "..");
const literal = v => "'" + String(v).replaceAll("'", "''") + "'";
function sql(q) {
  try { return execFileSync("docker", ["exec", "-i", fixture.container, "psql", "-U", "postgres", "-XAtq", "-v", "ON_ERROR_STOP=1"], {input:q, encoding:"utf8", stdio:["pipe","pipe","pipe"]}).trim(); }
  catch (error) { console.error("Local SQL failed", error.stderr?.toString()); throw error; }
}
function db(role) {
  const prefix = `set role ${role};set request.jwt.claim.role=${literal(role)};set request.jwt.claim.sub=${literal(fixture.owner)};`;
  return {
    rpc: async (name,args) => {
      assert.match(name,/^[a-z_]+$/);
      try { return {data:JSON.parse(sql(prefix + `select to_jsonb(public.${name}(${args ? literal(JSON.stringify(args.p))+"::jsonb" : ""}))`)),error:null}; }
      catch(error) { console.error("Local RPC failed", name, String(error)); return {data:null,error:{message:String(error)}}; }
    },
    from: table => {
      assert(["subjects","audits"].includes(table));
      const filters=[];
      const query={select:()=>query,eq:(key,value)=>{assert(["id","user_id"].includes(key));filters.push(`${key}=${literal(value)}`);return query;},maybeSingle:async()=>{
        const projection = table === "audits" ? "jsonb_build_object('id',s.id)" : `to_jsonb(s)||jsonb_build_object('living_brief_versions',(select jsonb_agg(to_jsonb(b)) from living_brief_versions b where b.subject_id=s.id),'subject_channels',(select jsonb_agg(to_jsonb(c)) from subject_channels c where c.subject_id=s.id))`;
        const value=sql(prefix+`select ${projection} from ${table} s where ${filters.join(" and ")}`);
        return {data:value?JSON.parse(value):null,error:null};
      }};
      return query;
    },
  };
}
globalThis.__session=db("authenticated");globalThis.__admin=db("service_role");
globalThis.__owner=fixture.owner;globalThis.__revisions=[];
const mocks={
  "@/lib/auth":"export const requireProfile=async()=>({id:globalThis.__owner});",
  "@/lib/supabase/server":"export const createClient=async()=>globalThis.__session;",
  "@/lib/supabase/admin":"export const createAdminClient=()=>globalThis.__admin;",
  "@/lib/resources/mutation-revision":"export const bumpResourceRevision=async r=>globalThis.__revisions.push(r);",
  "next/cache":"export const revalidatePath=()=>{};",
};
async function bundle(name,dir) {
  const outfile=path.join(dir,name+".cjs");
  await esbuild.build({entryPoints:[path.join(root,"src/lib/actions",name+".ts")],outfile,bundle:true,platform:"node",format:"cjs",logLevel:"silent",plugins:[{name:"local-transport",setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:"adapter"}:undefined);b.onLoad({filter:/.*/,namespace:"adapter"},a=>({contents:mocks[a.path],loader:"js"}));}}]});
  return require(outfile);
}
(async()=>{
 const dir=fs.mkdtempSync(path.join(process.env.TMPDIR||os.tmpdir(),"commercial-onboarding-"));
 try {
  process.env.ALM_COMMERCIAL_FREE_ENABLED="1";process.env.ALM_COMMERCIAL_EXECUTION_ENABLED="1";
  const {claimFreeAllowance}=await bundle("commercial",dir);
  const {setupCommercialBrand}=await bundle("commercial-setup",dir);
  const {quoteCommercialReport,submitCommercialReport}=await bundle("commercial-report",dir);
  const unchanged=()=>sql(`select jsonb_build_object('gifts',gifted_audits,'plan',plan,'trial',trial_plan,'expires',trial_expires_at) from profiles where id=${literal(fixture.owner)}`);
  const before=unchanged();
  const count=()=>Number(sql(`select count(*) from audits where user_id=${literal(fixture.owner)}`));
  const initialCount=count();assert.equal(initialCount,fixture.expectedAudits);
  assert.deepEqual(await claimFreeAllowance(),{ok:true});
  assert.deepEqual(await claimFreeAllowance(),{ok:true});
  const setup=await setupCommercialBrand(fixture.request);
  assert.equal(setup.ok,true,JSON.stringify(setup));
  assert.deepEqual(await setupCommercialBrand(fixture.request),setup);
  assert.equal(unchanged(),before);
  assert.equal(count(),initialCount);
  const quoted=await quoteCommercialReport({subject_id:setup.subject_id,brief_id:setup.brief_id,channel_id:setup.channel_id,goal:"Grow",report_type:"standard"});
  assert.equal(quoted.ok,true,JSON.stringify(quoted));assert.equal(count(),initialCount);
  assert.equal((await submitCommercialReport(quoted.quote.id,false)).ok,false);assert.equal(count(),initialCount);
  const submitted=await submitCommercialReport(quoted.quote.id,true);
  assert.equal(submitted.ok,true,JSON.stringify(submitted));assert.equal(count(),initialCount+1);
  assert.deepEqual(await submitCommercialReport(quoted.quote.id,true),submitted);
  assert.equal(unchanged(),before);assert(globalThis.__revisions.includes("subjects"));
  console.log("PASS production actions + real SQL: explicit Free twice -> setup/readback/retry -> quote -> rejected non-consent -> one accepted/retried Standard audit, zero legacy allowance required");
 }finally {fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exit(1);});
