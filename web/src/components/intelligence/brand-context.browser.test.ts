import { beforeAll, afterAll, it, expect } from 'vitest';
import { chromium, type Browser } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
let browser: Browser, bundle: string;
beforeAll(async()=>{
 browser=await chromium.launch({headless:true});
 const result=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{SubjectHome}from'./src/components/intelligence/subject-home';const content={subjectType:'brand',identity:'Fixture brand',vision:'',audience:'',offers:'',voice:'',positioning:'',goals:'Original goal',successCriteria:'',constraints:'',activeExperiments:'',plannedChanges:''};const version={id:'one',subjectId:'s',version:1,source:'user',confirmed:true,authorLabel:'You',content,parentVersionId:null,changeSummary:null,createdAt:'2026-01-01'};const data={subject:{id:'s',name:'Fixture brand',type:'brand',avatarUrl:null,channelCount:0,lastAuditAt:null},channels:[],briefVersions:[{...version,id:'two',version:2,confirmed:false,authorLabel:'Unknown',content:{...content,goals:'Unconfirmed goal'}},version],proposals:[{id:'p',subjectId:'s',parentVersionId:'one',baseVersion:1,path:'goals',operation:'replace',proposedValue:'Proposed goal',evidenceIds:[],changeExplanation:'A suggestion',status:'proposed',createdAt:'2026-01-02'}],scores:[],recommendations:[],sinceLast:[],reports:[]};createRoot(document.getElementById('root')).render(<SubjectHome subjectId='s' data={data}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},alias:{'@':path.resolve('src')},plugins:[{name:'offline-boundaries',setup(b){b.onResolve({filter:/next\/navigation$/},()=>({path:'nav',namespace:'offline'}));b.onResolve({filter:/actions\/intelligence$/},()=>({path:'actions',namespace:'offline'}));b.onLoad({filter:/.*/,namespace:'offline'},args=>({contents:args.path==='nav'?'export const useRouter=()=>({refresh(){}});':'export const resolveBriefProposalAction=async()=>({ok:false});export const recordRecommendationDecisionAction=async()=>({ok:false});export const saveLivingBriefVersionAction=async()=>({status:"error"});'}));}}]});bundle=result.outputFiles[0].text;
});
afterAll(async()=>{await browser?.close()});
it.each([320,390])('keeps confirmed context, unconfirmed history and proposal base distinct at %s',async width=>{
 const page=await browser.newPage({viewport:{width,height:844}});
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0;font-family:Arial"><style>button{min-height:44px;max-width:100%}*{box-sizing:border-box;overflow-wrap:anywhere}svg{width:16px;height:16px}</style><div id="root"></div>'}));
 await page.goto('http://context.test');await page.addScriptTag({content:bundle});
 await page.getByRole('tab',{name:'Brand Context',exact:true}).click();
 await page.getByText('Current · v1',{exact:true}).waitFor();
 expect(await page.getByText('Unconfirmed · Unknown',{exact:true}).count()).toBe(1);
 expect(await page.getByText('Base version 1',{exact:true}).count()).toBe(1);
 expect(await page.getByText('Proposed goal',{exact:true}).count()).toBe(1);
 const history=page.getByRole('button',{name:/v1 · Current confirmed/});await history.focus();await page.keyboard.press('Enter');
 expect(await history.getAttribute('aria-expanded')).toBe('true');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
 await page.close();
});
