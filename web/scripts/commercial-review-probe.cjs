/* eslint-disable @typescript-eslint/no-require-imports -- Node CJS harness loads isolated esbuild bundles. */
// Offline production entrypoints: only auth/DB/provider transport is replaced.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const esbuild=require('esbuild');
const root=path.resolve(__dirname,'..');
const fixture=JSON.parse(fs.readFileSync(0,'utf8'));
const mocks={
 '@/lib/supabase/admin':'export const createAdminClient=()=>globalThis.__db;',
 '@/lib/auth':'export const requireProfile=async()=>globalThis.__profile??({id:globalThis.__owner});',
 '@/lib/supabase/server':'export const createClient=async()=>globalThis.__db;',
 '@/lib/stripe':'export const getStripe=()=>globalThis.__stripe;export const priceIdForPlan=()=>"price_starter";',
 '@/lib/env':'export const isSupabaseAdminConfigured=()=>true;export const siteUrl=()=>"https://example.invalid";',
 'next/navigation':'export const redirect=url=>{throw new Error("redirect:"+url)}; ',
 'next/server':'export class NextResponse { static json(data,init){return Response.json(data,init)} }'
};
async function bundle(entry,dir){const out=path.join(dir,'entry.cjs');await esbuild.build({entryPoints:[path.join(root,entry)],outfile:out,bundle:true,platform:'node',format:'cjs',logLevel:'silent',plugins:[{name:'offline',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'js'}));}}]});return require(out)}
(async()=>{
 const dir=fs.mkdtempSync(path.join(process.env.TMPDIR||os.tmpdir(),'commercial-review-'));
 try {
  if(fixture.mode==='checkout') {
   function sql(q){return execFileSync('docker',['exec','-i',fixture.container,'psql','-U','postgres','-XAtq','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim()}
   globalThis.__profile=JSON.parse(sql(`select to_jsonb(p) from profiles p where id='${fixture.owner}'`));
   globalThis.__db={rpc:async(name,{p})=>{try{return {data:JSON.parse(sql(`set role service_role;select to_jsonb(${name}('${JSON.stringify(p).replaceAll("'","''")}'::jsonb))`)),error:null}}catch(e){return {data:null,error:String(e)}}},from:()=>({select:()=>({eq:(_k,v)=>({maybeSingle:async()=>({data:JSON.parse(sql(`set role service_role;select to_jsonb(c) from commercial_checkouts c where id='${v}'`)),error:null})})})})};
   let created=0;
   globalThis.__stripe={customers:{create:async()=>{throw new Error('unexpected customer')}},prices:{retrieve:async()=>({id:'price_brand',currency:'usd',unit_amount:19900,recurring:{interval:'month',interval_count:1}})},checkout:{sessions:{create:async()=>{created++;return {id:'cs_'+fixture.plan+fixture.owner,url:'https://checkout.example.invalid/local'}},retrieve:async()=>({status:'open',url:'https://checkout.example.invalid/local'})}}};
   process.env.ALM_COMMERCIAL_PAID_ENABLED='1';process.env.STRIPE_PRICE_BRAND_MONTHLY='price_brand';
   const entry=fixture.plan==='brand'?'commercial-billing':'billing';
   const action=await bundle('src/lib/actions/'+entry+'.ts',dir);
   let redirect;
   try {if(fixture.plan==='brand') await action.startCommercialCheckout('brand');else await action.startStarterCheckout();}catch(e){redirect=e.message}
   assert(redirect?.startsWith('redirect:'));
   console.log(JSON.stringify({created,redirect}));return;
  }
  if(fixture.mode==='legacy-event') {
   const Stripe=require('stripe');const sdk=new Stripe('sk_test_offline');
   process.env.STRIPE_WEBHOOK_SECRET='whsec_offline';process.env.STRIPE_PRICE_STARTER='price_starter';
   function sql(q){return execFileSync('docker',['exec','-i',fixture.container,'psql','-U','postgres','-XAtq','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim()}
   globalThis.__db={rpc:async(name,args)=>{try {const argsSql=name==='reconcile_stripe_subscription'?Object.entries(args).map(([k,v])=>`${k} => ${v===null?'null':"'"+String(v).replaceAll("'","''")+"'"}`).join(','):"'"+JSON.stringify(args.p).replaceAll("'","''")+"'::jsonb";return {data:JSON.parse(sql(`set role service_role;select to_jsonb(${name}(${argsSql}))`)),error:null}}catch(e){return {data:null,error:String(e)}}}};
   const e=fixture.event, metadata={profile_id:e.owner_id,plan:'starter',checkout_intent_id:e.checkout_id};
   const sub={id:e.subscription_id,customer:e.customer_id,status:'active',metadata,items:{data:[{price:{id:'price_starter'},quantity:1,current_period_start:e.period_start,current_period_end:e.period_end}]}};
   globalThis.__stripe={webhooks:sdk.webhooks,subscriptions:{retrieve:async()=>sub}};
   const {POST}=await bundle('src/app/api/webhooks/stripe/route.ts',dir);
   const payload=JSON.stringify({id:e.event_id,created:e.event_created,type:fixture.type,data:{object:{id:e.session_id,metadata,subscription:sub.id,client_reference_id:e.owner_id}}});
   const signature=sdk.webhooks.generateTestHeaderString({payload,secret:process.env.STRIPE_WEBHOOK_SECRET});
   const response=await POST(new Request('http://localhost/api/webhooks/stripe',{method:'POST',headers:{'stripe-signature':signature},body:payload}));
   assert.equal(response.status,200,JSON.stringify(await response.json()));
   console.log('PASS signed legacy',fixture.type);return;
  }
  if(fixture.mode==='invoice') {
   const Stripe=require('stripe');const sdk=new Stripe('sk_test_offline');
   process.env.STRIPE_WEBHOOK_SECRET='whsec_offline';process.env.STRIPE_PRICE_BRAND_MONTHLY='price_brand';
   const calls=[];
   function sql(q){return execFileSync('docker',['exec','-i',fixture.container,'psql','-U','postgres','-XAtq','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim()}
   globalThis.__db={rpc:async(name,{p})=>{calls.push(name);try{return {data:JSON.parse(sql(`set role service_role;select to_jsonb(${name}('${JSON.stringify(p).replaceAll("'","''")}'::jsonb))`)),error:null}}catch(e){return {data:null,error:String(e)}}},from:()=>({select:()=>({eq:(_key,value)=>({maybeSingle:async()=>({data:JSON.parse(sql(`set role service_role;select jsonb_build_object('lot_id',lot_id) from workspace_credit_payment_commands where id='${value}'`)),error:null})})})})};
   const e=fixture.event;
   const metadata={profile_id:e.owner_id,commercial_checkout_id:e.checkout_id,commercial_plan:'brand',pricing_version:'ALM-2026-09.v1'};
   const subscription={id:e.subscription_id,customer:e.customer_id,status:e.status,metadata,items:{data:[{price:{id:'price_brand'},quantity:1,current_period_start:e.period_start,current_period_end:e.period_end}]}};
   const invoice={id:fixture.invoice_id,status:'paid',currency:'usd',amount_paid:19900,amount_remaining:0,customer:e.customer_id,parent:{subscription_details:{subscription:e.subscription_id,metadata}},lines:{has_more:false,data:[{amount:19900,quantity:1,period:{start:e.period_start,end:e.period_end},pricing:{price_details:{price:'price_brand'}}}]},payments:{has_more:false,data:[{status:'paid',amount_paid:19900,payment:{payment_intent:'pi_'+fixture.invoice_id}}]}};
   const payment={id:'pi_'+fixture.invoice_id,status:'succeeded',currency:'usd',amount_received:19900,customer:e.customer_id};
   if(fixture.mutation==='amount') invoice.amount_paid=1;
   if(fixture.mutation==='customer') invoice.customer='cus_foreign';
   globalThis.__stripe={webhooks:sdk.webhooks,subscriptions:{retrieve:async()=>subscription},invoices:{retrieve:async()=>invoice},paymentIntents:{retrieve:async()=>payment}};
   const {POST}=await bundle('src/app/api/webhooks/stripe/route.ts',dir);
   let payload=JSON.stringify({id:e.event_id,created:e.event_created,type:'invoice.paid',data:{object:invoice}});
   const signature=sdk.webhooks.generateTestHeaderString({payload,secret:process.env.STRIPE_WEBHOOK_SECRET});
   if(fixture.mutation==='signature') payload+=' ';
   const response=await POST(new Request('http://localhost/api/webhooks/stripe',{method:'POST',headers:{'stripe-signature':signature},body:payload}));
   const data=await response.json();assert.equal(response.status,fixture.expected,JSON.stringify({data,calls}));
   if(fixture.expected===200) assert(calls.includes('workspace_credit_payment_confirm'));
   else assert(!calls.includes('workspace_credit_payment_confirm'));
   console.log('PASS signed production invoice',e.event_id,response.status);return;
  }
  globalThis.__owner=fixture.owner;
  globalThis.__db={rpc:async()=>({data:fixture.quote,error:null})};
  process.env.ALM_COMMERCIAL_EXECUTION_ENABLED='1';
  const {quoteCommercialReport}=await bundle('src/lib/actions/commercial-report.ts',dir);
  assert.match(fixture.quote.expires_at,/\+00:00$/);
  const result=await quoteCommercialReport(fixture.input);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.quote.expires_at,fixture.quote.expires_at);
  console.log('PASS real full-chain SQL quote through production action');
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
