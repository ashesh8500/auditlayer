import { beforeAll, afterAll, it, expect } from 'vitest';
import { chromium, type Browser } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
import { presentReportHtml } from '../lib/report-presentation';
let browser: Browser;
let bundle: string;
const artifact = presentReportHtml('<html><body><section id="overview"><h2>Overview</h2><p>Historical observations.</p></section><section id="next"><h2>Next steps</h2><p>Original analysis, not a mapped action.</p><table style="width:900px"><tr><td>Evidence</td></tr></table></section></body></html>');
beforeAll(async () => {
  browser = await chromium.launch({headless:true});
  const result = await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {ImmersiveReport} from './src/components/immersive-report';import {OwnedReportReader} from './src/components/owned-report-reader';import {WorkspaceResources,useWorkspaceResources} from './src/components/workspace-resources';function Refresh(){const s=useWorkspaceResources();return <button onClick={()=>s.invalidate('reports')}>Refresh metadata</button>}createRoot(document.getElementById('root')).render(location.pathname==='/share'?<ImmersiveReport reportUrl='/artifact' backHref='/'/>:<WorkspaceResources ownerId='owner-a' revisions={{reports:'1',subjects:'1',connections:'1'}}><Refresh/><OwnedReportReader id='report-a'/></WorkspaceResources>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},alias:{'@':path.resolve('src')},plugins:[{name:'offline-auth-only',setup(b){b.onResolve({filter:/supabase\/client$/},()=>({path:'auth',namespace:'offline'}));b.onLoad({filter:/.*/,namespace:'offline'},()=>({contents:'export const createClient=()=>({auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}});'}));}}]});
  bundle=result.outputFiles[0].text;
});
afterAll(async()=>{await browser?.close()});
it.each([320,390,1440])('navigates real shared chapters with keyboard and deep links at %s',async width=>{
  const page=await browser.newPage({viewport:{width,height:844}});
  await page.route('**/*',route=>new URL(route.request().url()).pathname==='/artifact'?route.fulfill({contentType:'text/html',body:artifact}):route.fulfill({contentType:'text/html',body:'<body style="margin:0"><div id="root"></div>'}));
  await page.goto('http://reader.test/share#report:next');await page.addScriptTag({content:bundle});
  await page.waitForFunction(()=>[...document.querySelectorAll('*')].some(e=>e.shadowRoot?.activeElement?.id==='next'));
  if(width<1024){await page.locator('summary').focus();await page.keyboard.press('Enter');}
  const nav=page.getByRole('navigation',{name:width<1024?'Report contents':'Report chapters'});
  await nav.getByRole('button',{name:'Overview',exact:true}).focus();await page.keyboard.press('Enter');
  expect(new URL(page.url()).hash).toBe('#report:overview');
  expect(await page.evaluate(()=>[...document.querySelectorAll('*')].some(e=>e.shadowRoot?.activeElement?.id==='overview'))).toBe(true);
  expect(await page.getByRole('button',{name:'Actions only — unavailable'}).isDisabled()).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  expect(await page.getByLabel('Report version').count()).toBe(0);
  await page.close();
});
it('selects historical bytes without rewinding latest and refreshes metadata without refetching bytes',async()=>{
  const page=await browser.newPage({viewport:{width:390,height:844}});let bytes=0;let metadata=0;
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/resources/report/report-a'){
      const version=Number(url.searchParams.get('version')||2);const meta=url.searchParams.has('metadata');if(meta)metadata++;else bytes++;
      const dto={ownerId:'owner-a',reportId:'report-a',version,latestVersion:2,contentHash:'a'.repeat(64),presentationRevision:'mobile-reader-20260919-v1',html:artifact,handle:'fixture',fetchedAt:'2026-09-19',createdAt:'2026-09-18',contextVersion:version===1?null:3,evidenceSnapshotId:null,methodology:null,versions:[{version:2,createdAt:'2026-09-19',changeType:'refinement',changedSection:'Next steps'},{version:1,createdAt:'2026-09-18',changeType:'initial',changedSection:null}]};
      return route.fulfill({json:meta?{...dto,html:undefined,contentHash:undefined}:dto});
    }
    return route.fulfill({contentType:'text/html',body:'<body style="margin:0"><div id="root"></div>'});
  });
  await page.goto('http://reader.test/owner');await page.addScriptTag({content:bundle});
  await page.getByRole('combobox',{name:'Report version',exact:true}).selectOption('1');
  await page.getByText('Historical version — latest is unchanged',{exact:false}).waitFor();
  expect(await page.getByText('Brand Context unknown',{exact:false}).count()).toBe(1);
  expect(await page.getByRole('link',{name:'Download this version'}).getAttribute('href')).toContain('version=1&download=1');
  expect(bytes).toBe(2);
  await page.getByRole('button',{name:'Refresh metadata'}).click();
  await expect.poll(() => metadata).toBeGreaterThanOrEqual(3);
  await page.getByRole('combobox',{name:'Report version',exact:true}).selectOption('latest');
  await page.getByText('Reading v2',{exact:false}).waitFor();
  expect(bytes).toBe(2);expect(metadata).toBeGreaterThanOrEqual(3);
  await page.close();
});
