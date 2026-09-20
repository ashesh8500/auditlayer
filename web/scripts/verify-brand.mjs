// Offline brand QA + deterministic raster derivatives. No server or API calls.
// Run from web/: node scripts/verify-brand.mjs
import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import tailwind from '@tailwindcss/postcss';
const require = createRequire(import.meta.url);
const postcss = createRequire(require.resolve('@tailwindcss/postcss'))('postcss');
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const root = path.resolve('..');
const out = path.join(root, 'docs/brand-rollout-20260919');
await fs.mkdir(out, {recursive: true});
const read = file => fs.readFile(path.join(root, file), 'utf8');
const mark = await read('web/public/brand/alm-wordmark.svg');
const inverse = await read('web/public/brand/alm-wordmark-inverse.svg');
const icon = await read('web/public/brand/alm-icon.svg');
const css = await postcss([tailwind()]).process(await read('web/src/app/globals.css'), {from: path.resolve('src/app/globals.css')});
const bundle = await build({
  stdin: {contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {Brand} from './src/components/brand'; createRoot(document.getElementById('root')).render(<><section><p>Light · default wordmark</p><Brand /></section><section style={{background:'#14241f',color:'#fffdf8'}}><p>Dark · inverse wordmark</p><Brand inverse /></section><section><p>Full name · optional lockup</p><Brand showName /></section></>);`, resolveDir: process.cwd(), loader:'tsx'},
  bundle:true, write:false, format:'iife', jsx:'automatic', alias:{'@':path.resolve('src')}, define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},
});
const browser = await chromium.launch({headless:true});
const results=[];
try {
  for (const width of [320,390,768,1440]) {
    const page=await browser.newPage({viewport:{width,height:844}});
    const errors=[]; page.on('pageerror', e=>errors.push(e.message));
    await page.route('**/*',route=>{
      const p=new URL(route.request().url()).pathname;
      if(p==='/brand/alm-wordmark.svg')return route.fulfill({contentType:'image/svg+xml',body:mark});
      if(p==='/brand/alm-wordmark-inverse.svg')return route.fulfill({contentType:'image/svg+xml',body:inverse});
      if(p==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root"></main></body></html>'});
      return route.abort();
    });
    await page.goto('http://brand.test');
    await page.addStyleTag({content:css.css+'\nsection{padding:28px;margin:16px;border:1px solid #dcd7ca;border-radius:12px} section p{margin:0 0 12px;font-size:13px}'});
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.getByRole('link',{name:'AuditLayerMedia'}).first().waitFor();
    await page.waitForFunction(()=>[...document.images].length===3&&[...document.images].every(i=>i.complete&&i.naturalWidth>0));
    assert.equal(await page.getByRole('link',{name:'AuditLayerMedia',exact:true}).count(),3);
    const metrics=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,images:[...document.images].map(i=>({width:i.clientWidth,height:i.clientHeight,naturalWidth:i.naturalWidth})),links:[...document.querySelectorAll('a')].map(a=>({width:a.clientWidth,height:a.clientHeight}))}));
    assert.ok(metrics.scroll<=width);
    assert.ok(metrics.images.every(i=>i.height===30&&i.width>=54&&i.width<=56));
    assert.ok(metrics.links.every(l=>l.height>=44));
    assert.deepEqual(errors,[]);
    results.push(metrics);
    await page.screenshot({path:path.join(out,`brand-${width}.png`),fullPage:true});
    await page.close();
  }
  const page=await browser.newPage();
  async function raster(svg,size,dest) {
    await page.setViewportSize({width:size,height:size});
    await page.setContent(`<html><body style="margin:0;width:${size}px;height:${size}px">${svg.replace('<svg ','<svg width="100%" height="100%" ')}</body></html>`);
    await page.screenshot({path:path.join(root,dest),omitBackground:true});
  }
  await raster(icon,512,'web/src/app/icon.png');
  await raster(icon,180,'web/src/app/apple-icon.png');
  await raster(icon,256,'web/public/brand/alm-mark.png');
  await raster(await read('web/public/brand/alm-favicon.svg'),16,'web/public/brand/alm-favicon-16.png');
  // A hinted 16px ALM. keeps the period visible; larger entries use the outlines.
  execFileSync('python', ['-c', `from PIL import Image
im=Image.open('public/brand/alm-mark.png')
small=Image.open('public/brand/alm-favicon-16.png')
im.save('src/app/favicon.ico',sizes=[(16,16),(32,32),(48,48),(64,64)],append_images=[small]+[im.resize((s,s),Image.Resampling.LANCZOS) for s in (32,48,64)])
assert Image.open('src/app/favicon.ico').ico.sizes() == {(16,16),(32,32),(48,48),(64,64)}
assert Image.open('src/app/favicon.ico').ico.getimage((16,16)).getpixel((14,10))[:3] == (15,118,110)`]);
  await page.setViewportSize({width:1200,height:630});
  await page.setContent(`<html><body style="margin:0;background:#fffdf8;color:#14241f;font-family:Arial,sans-serif"><main style="padding:76px 88px"><div style="width:275px">${mark}</div><h1 style="font-size:56px;letter-spacing:-2px;margin:38px 0 24px;max-width:950px">Know what to do next.</h1><p style="font-size:25px;color:#52635c">Evidence, diagnosis, and a ranked action plan for social growth.</p><p style="font-size:20px;margin-top:62px">AuditLayerMedia · auditlayermedia.com</p></main></body></html>`);
  await page.screenshot({path:path.join(root,'web/src/app/opengraph-image.png')});
  const emailSource=await read('web/src/lib/auth/magic-link-email.ts');
  const email=emailSource.match(/return `([\s\S]*?)`;/)[1].replace('${signInUrl}','https://example.invalid/sign-in');
  for(const [name,html] of [['resend-email',email],['supabase-email',await read('supabase/templates/magic_link.html')],['report-shell',await read('worker/auditlayer_worker/templates/master-skeleton.html')]]) {
    for(const width of [390,1440]) {
      await page.setViewportSize({width,height:844});
      await page.setContent(html);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} overflow`);
      await page.screenshot({path:path.join(out,`${name}-${width}.png`),fullPage:true});
    }
  }
  await page.close();
} finally {await browser.close();}
await fs.writeFile(path.join(out,'geometry.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify({passed:true,geometry:results},null,2));
