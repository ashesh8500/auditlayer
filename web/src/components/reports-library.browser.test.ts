import {afterAll,beforeAll,expect,it} from 'vitest';
import {chromium,type Browser} from '@playwright/test';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url);
const postcss=createRequire(require.resolve('@tailwindcss/postcss'))('postcss');
let browser:Browser,bundle:string,css:string;
beforeAll(async()=>{
 browser=await chromium.launch();
 css=(await postcss([tailwind()]).process(readFileSync('src/app/globals.css','utf8'),{from:path.resolve('src/app/globals.css')})).css;
 const result=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {ReportsLibrary} from './src/components/reports-library';createRoot(document.getElementById('root')).render(<ReportsLibrary params={{}}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},alias:{'@':path.resolve('src')},plugins:[{name:'offline-resource',setup(b){
 b.onResolve({filter:/workspace-resources$/},()=>({path:'resource',namespace:'fixture'}));
 b.onResolve({filter:/lib\/actions\/billing$/},()=>({path:'billing',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:args.path==='billing'?`export async function startStarterCheckout(){}export async function startProCheckout(){}export async function openBillingPortal(){}`:`export function useWorkspaceQuery(){return {isPending:false,isFetching:false,error:null,refetch:()=>{},data:{ownerId:'qa',fetchedAt:'2026-09-19T00:00:00Z',profile:{full_name:'QA',plan:'pro',role:'user',gifted_audits:0,subscription_status:null,hasBilling:false},count:1,usage:1,allowance:{effective_plan:'pro',limit:15,remaining:14,gifts:0,window_kind:'lifetime',window_valid:true},audits:[{id:'qa-report',handle:'https://example.com/'+ 'long-website-path'.repeat(7),platform:'unknown',status:location.pathname==='/ready'?'ready':'queued',created_at:'2026-09-19T00:00:00Z',report_version:1}]}}}` }));
 }}]});bundle=result.outputFiles[0].text;
},30000);
afterAll(async()=>{await browser?.close();});
it.each([320,390,430].flatMap(width=>['queued','ready'].map(status=>({width,status}))))('contains $status website report cards at $width px',async({width,status})=>{
 const page=await browser.newPage({viewport:{width,height:844}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<html><body><div id="root"></div></body></html>'}));await page.goto('http://fixture.test/'+status);await page.addStyleTag({content:css});await page.addScriptTag({content:bundle});await page.getByTestId('reports-content').waitFor();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 expect((await page.locator('main').innerText()).includes('@https://')).toBe(false);
 expect(errors).toEqual([]);await page.close();
},15000);
