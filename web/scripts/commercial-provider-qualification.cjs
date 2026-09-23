/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Node qualification harness. */
// Real Stripe TEST API + production POST/action bundles + owned full migration SQL.
// Never loads production Stripe credentials or sends to deployed webhook endpoints.
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {randomUUID} = require('node:crypto');
const assert = require('node:assert/strict');
const Stripe = require('stripe');
const esbuild = require('esbuild');
const web = path.resolve(__dirname, '..'), root = path.dirname(web);
const runId = randomUUID(), container = `alm-real-stripe-${runId.slice(0, 12)}`;
const scratch = process.env.TMPDIR;
assert(scratch && path.isAbsolute(scratch), 'TMPDIR must name owned scratch');
const dir = fs.mkdtempSync(path.join(scratch, 'alm-provider-'));
const receiptPath = process.env.ALM_QA_RECEIPT || path.join(dir, 'receipt.json');
const receipt = {runId, apiVersion:'2026-05-27.dahlia', signature:'locally generated SDK testing signature; NOT provider delivery', browserCheckout:'NOT EXERCISED; no fabricated checkout completion', plans:[], cleanup:[], gates:[]};
const owned = {customers:[], subscriptions:[], sessions:[]};
receipt.owned = owned;
const prices = {brand:'price_1UIrktEoGcKPcVcdBsLCUpMs', studio:'price_1UIrkuEoGcKPcVcdxTNhdFKP'};
let stripe, started = false;
function save() { fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2), {mode:0o600}); }
function command(bin,args,input) { return execFileSync(bin,args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim(); }
function sql(q) { assert(started); return command('docker',['exec','-i',container,'psql','-U','postgres','-XAtq','-v','ON_ERROR_STOP=1'],q); }
function lit(s) { return `'${String(s).replaceAll("'", "''")}'`; }
function rpc(name,p) { assert(/^[a-z_]+$/.test(name)); return JSON.parse(sql(`set role service_role;select to_jsonb(${name}(${lit(JSON.stringify(p))}::jsonb))`)); }
function row(table,key,value) { assert(['profiles','commercial_checkouts','workspace_credit_payment_commands'].includes(table)); assert(['id'].includes(key)); const result=sql(`${table==='profiles'?'':'set role service_role;'}select to_jsonb(t) from ${table} t where ${key}=${lit(value)}`); return result ? JSON.parse(result) : null; }
async function absentProduction(owner) {
  // This credential is used ONLY for a read-only, exact-UUID production lookup.
  const file = process.env.ALM_QA_PRODUCTION_ENV;
  assert(file, 'ALM_QA_PRODUCTION_ENV required for production owner-absence check');
  const env={}; for(const line of fs.readFileSync(file,'utf8').split('\n')) {const m=line.match(/^([A-Z_]+)=(.*)$/); if(m) env[m[1]]=m[2].trim().replace(/^['"]|['"]$/g,'');}
  const base = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
  assert(base.protocol==='https:' && base.hostname.endsWith('.supabase.co'), 'must verify hosted production owner absence');
  const url = new URL('/rest/v1/profiles',base); url.searchParams.set('select','id'); url.searchParams.set('id',`eq.${owner}`);
  const r = await fetch(url,{headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`}});
  assert.equal(r.status,200,'production read-only owner absence lookup failed'); assert.deepEqual(await r.json(),[]);
}
const replacements = {
  '@/lib/supabase/admin':'export const createAdminClient=()=>globalThis.__qaDB;',
  '@/lib/auth':'export const requireProfile=async()=>globalThis.__qaProfile;',
  '@/lib/supabase/server':'export const createClient=async()=>globalThis.__qaDB;',
  '@/lib/stripe':'export const getStripe=()=>globalThis.__qaStripe;',
  '@/lib/env':'export const isSupabaseAdminConfigured=()=>true;export const siteUrl=()=>"https://example.invalid";',
  'next/navigation':'export const redirect=url=>{throw Object.assign(new Error("qa_redirect"),{redirectUrl:url})};',
  'next/server':'export class NextResponse {static json(data,init){return Response.json(data,init)}}'
};
async function bundle(entry,label) { const out=path.join(dir,`${label}.cjs`); await esbuild.build({entryPoints:[path.join(web,entry)],outfile:out,bundle:true,platform:'node',format:'cjs',logLevel:'silent',plugins:[{name:'local-transport-only',setup(b){b.onResolve({filter:/.*/},a=>replacements[a.path]?{path:a.path,namespace:'qa'}:undefined); b.onLoad({filter:/.*/,namespace:'qa'},a=>({contents:replacements[a.path],loader:'js'}));}}]}); return require(out); }
async function main() {
  const key=command('python',['-c','import tomllib,pathlib; print(tomllib.loads((pathlib.Path.home()/".config/stripe/config.toml").read_text())["default"]["api_key"])']);
  assert(/^(sk|rk)_test_/.test(key), 'TEST key required');
  stripe = new Stripe(key,{apiVersion:receipt.apiVersion,maxNetworkRetries:1});
  const account=await stripe.accounts.retrieve(); assert.equal(account.id,'acct_1J3tIuEoGcKPcVcd'); receipt.account=account.id;
  for(const [plan,id] of Object.entries(prices)) {const p=await stripe.prices.retrieve(id); assert.equal(p.livemode,false);assert.equal(p.unit_amount,plan==='brand'?19900:49900);assert.equal(p.currency,'usd');assert.equal(p.recurring.interval,'month');}
  // Complete safety preflight BEFORE creating any provider object.
  const owners={brand:randomUUID(),studio:randomUUID()};
  for(const owner of Object.values(owners)) await absentProduction(owner);
  receipt.productionOwnerAbsence=owners; save();
  command('docker',['run','--rm','-d','--name',container,'-e','POSTGRES_HOST_AUTH_METHOD=trust','pgvector/pgvector@sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b']); started=true;
  for(let i=0;i<100;i++) {try {command('docker',['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres']);break;}catch{await new Promise(r=>setTimeout(r,100));}}
  sql(fs.readFileSync(path.join(root,'supabase/tests/commercial-local-bootstrap.sql'),'utf8'));
  const migrations=fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort();
  for(const f of migrations) sql(fs.readFileSync(path.join(root,'supabase/migrations',f),'utf8'));
  receipt.migrations=migrations.length;
  globalThis.__qaStripe=stripe;
  globalThis.__qaDB={rpc:async(name,{p})=>{try{return {data:rpc(name,p),error:null};}catch{return {data:null,error:'disposable_sql_rejected'};}},from:table=>({select:()=>({eq:(key,value)=>({maybeSingle:async()=>({data:row(table,key,value),error:null})})})})};
  process.env.STRIPE_WEBHOOK_SECRET=`whsec_local_qa_${randomUUID()}`;
  process.env.STRIPE_PRICE_BRAND_MONTHLY=prices.brand;process.env.STRIPE_PRICE_STUDIO_MONTHLY=prices.studio;process.env.ALM_COMMERCIAL_PAID_ENABLED='1';
  const {POST}=await bundle('src/app/api/webhooks/stripe/route.ts','route');
  const {startCommercialCheckout}=await bundle('src/lib/actions/commercial-billing.ts','action');
  async function deliver(type,object,created) {
    // Local event envelope, unmodified real API object. Not a Stripe delivery receipt.
    const event={id:`evt_qa_${randomUUID().replaceAll('-','')}`,object:'event',api_version:receipt.apiVersion,livemode:false,type,created:created??Math.floor(Date.now()/1000),data:{object}};
    const payload=JSON.stringify(event), signature=stripe.webhooks.generateTestHeaderString({payload,secret:process.env.STRIPE_WEBHOOK_SECRET});
    const invoke=async()=>{const r=await POST(new Request('http://localhost/api/webhooks/stripe',{method:'POST',headers:{'stripe-signature':signature},body:payload}));return {status:r.status,body:await r.json()};};
    return {eventId:event.id,first:await invoke(),replay:invoke};
  }
  async function checkout(plan) {try {await startCommercialCheckout(plan);throw Error('missing redirect');}catch(e){if(e.message!=='qa_redirect')throw e;return e.redirectUrl;}}
  for(const plan of ['brand','studio']) {
    const owner=owners[plan]; sql(`insert into auth.users(id,email,email_confirmed_at) values(${lit(owner)},${lit(owner+'@example.invalid')},now())`);
    const customer=await stripe.customers.create({description:`ALM disposable qualification ${runId}`,metadata:{qa_run:runId,profile_id:owner}});owned.customers.push(customer.id);save();assert.equal(customer.livemode,false);
    sql(`update profiles set stripe_customer_id=${lit(customer.id)} where id=${lit(owner)}`);globalThis.__qaProfile=row('profiles','id',owner);
    const firstUrl=await checkout(plan);assert(firstUrl.startsWith('https://checkout.stripe.com/'),'real hosted session not admitted');
    const intent=JSON.parse(sql(`select to_jsonb(c) from commercial_checkouts c where owner_id=${lit(owner)} and state='pending'`));owned.sessions.push(intent.session_id); save();
    const hosted=await stripe.checkout.sessions.retrieve(intent.session_id);assert.equal(hosted.livemode,false);assert.equal(hosted.status,'open');
    assert.equal(await checkout(plan),firstUrl,'repeat must reuse exact hosted session');
    assert.equal(await checkout(plan==='brand'?'studio':'brand'),'/commercial?payment=unconfirmed','conflicting plan must not admit');
    assert.equal((await stripe.checkout.sessions.list({customer:customer.id,limit:100})).data.length,1);
    receipt.gates.push(`${plan}: actual server action, actual Stripe session, repeated checkout reuse and conflicting admission PASS`);
    // No supported server API completes hosted Checkout. Expire it truthfully.
    await stripe.checkout.sessions.expire(hosted.id);const expired=await stripe.checkout.sessions.retrieve(hosted.id);assert.equal(expired.status,'expired');
    const expiry=await deliver('checkout.session.expired',expired);assert.equal(expiry.first.status,200);assert.equal(row('commercial_checkouts','id',intent.id).state,'expired');
    const enrollment=rpc('commercial_checkout_reserve',{owner_id:owner,plan});
    const metadata={qa_run:runId,profile_id:owner,commercial_plan:plan,pricing_version:'ALM-2026-09.v1',commercial_checkout_id:enrollment.id};
    const pm=await stripe.paymentMethods.attach('pm_card_visa',{customer:customer.id});
    await stripe.customers.update(customer.id,{invoice_settings:{default_payment_method:pm.id}});
    const sub=await stripe.subscriptions.create({customer:customer.id,items:[{price:prices[plan]}],default_payment_method:pm.id,payment_behavior:'error_if_incomplete',metadata});owned.subscriptions.push(sub.id); save(); assert.equal(sub.livemode,false);assert.equal(sub.status,'active');
    const invoice=await stripe.invoices.retrieve(typeof sub.latest_invoice==='string'?sub.latest_invoice:sub.latest_invoice.id,{expand:['payments']});assert.equal(invoice.status,'paid');
    const evidence={plan,owner,customer:customer.id,hostedSession:hosted.id,subscription:sub.id,invoice:invoice.id,price:prices[plan],amountPaid:invoice.amount_paid,checkoutAdmission:'PASS open/repeat/conflict/expiry; browser completion NOT exercised',invoiceBeforeAdmission:null,creditGrant:'NOT RUN'};receipt.plans.push(evidence);save();
    const before=await deliver('invoice.paid',invoice);evidence.invoiceBeforeAdmission=before.first;assert.equal(before.first.status,503);assert.equal(sql(`select count(*) from workspace_credit_lots where owner_id=${lit(owner)}`),'0');
    // Explicit LOCAL precondition, not a fake checkout event or provider response.
    // Limits grant evidence to an already-admitted subscription. Browser-to-admission remains unqualified.
    sql(`update commercial_checkouts set state='completed' where id=${lit(enrollment.id)};update profiles set stripe_subscription_id=${lit(sub.id)} where id=${lit(owner)}`);
    evidence.localPrecondition='SQL seeded completed enrollment and subscription binding ONLY; not end-to-end hosted completion';
    const paid=await deliver('invoice.paid',invoice);evidence.invoiceResponse=paid.first;save();assert.equal(paid.first.status,200,JSON.stringify(paid.first));assert.equal(paid.first.body.outcome.status,'applied');
    assert.equal((await paid.replay()).status,200);
    const again=await deliver('invoice.paid',invoice);assert.equal(again.first.status,200);
    const totals=JSON.parse(sql(`select jsonb_build_object('lots',count(*),'credits',sum(amount_microusd)/10000) from workspace_credit_lots where owner_id=${lit(owner)}`));assert.deepEqual(totals,{lots:1,credits:plan==='brand'?5000:15000});
    evidence.creditGrant=totals;evidence.paymentIntent=invoice.payments.data[0].payment.payment_intent;save();
    // Ensure lifecycle event ordering is genuinely later, not fabricated.
    await new Promise(r=>setTimeout(r,1200));
    await stripe.subscriptions.cancel(sub.id);const canceled=await stripe.subscriptions.retrieve(sub.id);assert.equal(canceled.status,'canceled');
    const cancellation=await deliver('customer.subscription.deleted',canceled);assert.equal(cancellation.first.status,200);assert.equal(row('profiles','id',owner).subscription_status,'canceled');evidence.cancellation=cancellation.first;
    const late=await deliver('invoice.paid',invoice);
    // Already-confirmed money may return its same lot (200); cancellation must
    // stay authoritative and no additional lot may be minted.
    assert([200,503].includes(late.first.status));assert.equal(row('profiles','id',owner).subscription_status,'canceled');assert.equal(sql(`select count(*) from workspace_credit_lots where owner_id=${lit(owner)}`),'1');evidence.postCancellationInvoice=late.first;save();
  }
}
(async()=>{
  try { await main();receipt.result='PASS conditional provider/SQL qualification; hosted completion and delivery NOT qualified'; }
  catch(e) {receipt.result='BLOCKED';receipt.error={type:e.type||e.name,code:e.code||null,message:String(e.message).replace(/(?:sk|rk)_(?:test|live)_\S+/g,'[REDACTED]').replace(/https?:\/\/\S+/g,'[URL OMITTED]')};process.exitCode=1;}
  finally {
    if(stripe) {
      for(const id of owned.sessions) {try{const s=await stripe.checkout.sessions.retrieve(id);if(s.status==='open')await stripe.checkout.sessions.expire(id);const r=await stripe.checkout.sessions.retrieve(id);assert.equal(r.status,'expired');receipt.cleanup.push({session:id,status:r.status});}catch(e){receipt.cleanup.push({session:id,error:e.code||e.name});process.exitCode=1;}}
      for(const id of owned.subscriptions) {try{let s=await stripe.subscriptions.retrieve(id);if(s.status!=='canceled')await stripe.subscriptions.cancel(id);s=await stripe.subscriptions.retrieve(id);assert.equal(s.status,'canceled');receipt.cleanup.push({subscription:id,status:s.status});}catch(e){receipt.cleanup.push({subscription:id,error:e.code||e.name});process.exitCode=1;}}
      for(const id of owned.customers) {try{await stripe.customers.del(id);const c=await stripe.customers.retrieve(id);assert.equal(c.deleted,true);receipt.cleanup.push({customer:id,deleted:true});}catch(e){receipt.cleanup.push({customer:id,error:e.code||e.name});process.exitCode=1;}}
    }
    if(started) {try{command('docker',['rm','-f',container]); const names=command('docker',['ps','-a','--format','{{.Names}}']);assert(!names.split('\n').includes(container));receipt.databaseCleanup='removed and absence verified';}catch{receipt.databaseCleanup='FAILED';process.exitCode=1;}}
    if(receipt.productionOwnerAbsence) {
      try {for(const owner of Object.values(receipt.productionOwnerAbsence)) await absentProduction(owner);receipt.productionOwnerAbsenceAfterCleanup=true;}
      catch {receipt.productionOwnerAbsenceAfterCleanup=false;process.exitCode=1;}
    }
    if(process.exitCode && receipt.result?.startsWith('PASS')) receipt.result='BLOCKED: cleanup or final production absence check failed';
    save();console.log(JSON.stringify({receipt:receiptPath,...receipt},null,2));
    // Receipt remains; generated bundles never become repository artifacts.
    for(const f of fs.readdirSync(dir)) if(f.endsWith('.cjs')) fs.unlinkSync(path.join(dir,f));
  }
})();
