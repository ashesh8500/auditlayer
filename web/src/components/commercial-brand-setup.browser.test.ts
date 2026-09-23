import {afterAll,beforeAll,expect,it} from "vitest";
import {chromium,type Browser} from "@playwright/test";
import {build} from "esbuild";
import {createRequire} from "node:module";
import tailwind from "@tailwindcss/postcss";
import {readFileSync} from "node:fs";
import path from "node:path";
const require=createRequire(import.meta.url);
const postcss=createRequire(require.resolve("@tailwindcss/postcss"))("postcss");
let browser:Browser,bundle:string,css:string;
// Offline rendered real component + app CSS. SQL/action composition is tested
// separately by commercial_brand_setup_test.py; no hosted authentication claim.
beforeAll(async()=>{
 browser=await chromium.launch({headless:true});
 css=(await postcss([tailwind()]).process(readFileSync("src/app/globals.css","utf8"),{from:path.resolve("src/app/globals.css")})).css;
 const result=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {CommercialBrandSetup} from './src/components/commercial-brand-setup';createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-3xl px-4 py-10"><CommercialBrandSetup/></main>);`,resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"',"process.env":"{}"},alias:{"@":path.resolve("src")},plugins:[{name:"offline-actions",setup(b){
 b.onResolve({filter:/^(next\/navigation|@\/lib\/actions\/commercial-setup)$/},a=>({path:a.path,namespace:"fixture"}));
 b.onLoad({filter:/.*/,namespace:"fixture"},a=>({contents:a.path==="next/navigation"?`export const useRouter=()=>({push:url=>document.body.dataset.next=url,refresh:()=>{}})`:`export async function setupCommercialBrand(p){document.body.dataset.command=JSON.stringify(p);return {ok:true,channel_id:'fresh-channel',subject_id:'fresh-brand',brief_id:'fresh-brief'}}`,loader:"js"}));
 }}]});bundle=result.outputFiles[0].text;
},30000);
afterAll(async()=>{await browser?.close();});
it.each([390,1280])("keeps setup usable at %i px and requires explicit confirmation before continuation",async width=>{
 const page=await browser.newPage({viewport:{width,height:844}});const errors:string[]=[];
 page.on("pageerror",e=>errors.push(e.message));
 await page.route("**/*",route=>route.fulfill({contentType:"text/html",body:'<html><body><div id="root"></div></body></html>'}));
 try {
  await page.goto("http://localhost/setup");await page.addStyleTag({content:css});await page.addScriptTag({content:bundle});
  await page.getByLabel("Brand name",{exact:true}).fill("Fresh Brand");
  await page.getByLabel("Handle or website",{exact:true}).fill("fresh.brand");
  await page.getByLabel("Who you are",{exact:true}).fill("Independent education brand");
  await page.getByLabel("Who you serve",{exact:true}).fill("New creators");
  await page.getByLabel("Goal",{exact:true}).fill("Grow");
  const submit=page.getByRole("button",{name:"Save Brand and Continue to Quote"});
  await submit.click();expect(await page.locator("body").getAttribute("data-command")).toBeNull();
  await page.getByRole("checkbox",{name:/I manage this channel/}).check();
  await page.getByRole("checkbox",{name:/I confirm this brief/}).check();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  for(const control of await page.locator("input,select,textarea,button,a").all()) {
   const rect=await control.boundingBox();expect(rect!.height).toBeGreaterThanOrEqual(44);
  }
  await submit.click();
  await page.waitForFunction(()=>document.body.dataset.next==="/commercial?channel=fresh-channel");
  const command=JSON.parse((await page.locator("body").getAttribute("data-command"))!);
  expect(command).toMatchObject({confirmed:true,managed:true,name:"Fresh Brand"});expect(errors).toEqual([]);
 } finally {await page.close();}
},15000);
