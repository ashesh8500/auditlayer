import { afterAll, beforeAll, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import tailwind from "@tailwindcss/postcss";
// Resolve the processor from the plugin's declared dependency, without changing shared lockfiles.
const require = createRequire(import.meta.url);
const postcss = createRequire(require.resolve("@tailwindcss/postcss"))("postcss");
import { readFileSync } from "node:fs";
import path from "node:path";
let browser: Browser, bundle: string, css: string;
// Offline browser fixture: actual components and actual compiled app CSS. All network intercepted.
beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
  css = (await postcss([tailwind()]).process(readFileSync("src/app/globals.css", "utf8"), { from: path.resolve("src/app/globals.css") })).css;
  const result = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {ShareLinks} from './src/components/share-links'; import {ShareReportView} from './src/app/s/[token]/share-report-view';
const link={id:'1',audit_id:'a',token:'t'.repeat(43),mode:'email',email:'a'.repeat(64)+'@'+'b'.repeat(63)+'.test',verified_at:null,created_by:'u',created_at:'2026-01-01',expires_at:null,revoked_at:null,view_count:0};
createRoot(document.getElementById('root')).render(location.pathname==='/verify' ? <ShareReportView token="test_token" needsVerification/> : <ShareLinks auditId="a" links={[link,{...link,id:'2',token:'expired_token',expires_at:'2000-01-01'}]}/>);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" }, format: "iife", jsx: "automatic", alias: { "@": path.resolve("src") },
    plugins: [{ name: "offline-server-actions", setup(b) {
      b.onResolve({ filter: /lib\/actions\/shares$/ }, () => ({ path: "fixture", namespace: "fixture" }));
      b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `export async function createShareLink(){return {status:'ok',link:{token:'t'.repeat(43)}}} export async function revokeShareLink(){return {status:'ok',message:'Link revoked.'}}`, loader: "js" }));
    } }],
  });
  bundle = result.outputFiles[0].text;
}, 30000);
afterAll(async () => { await browser?.close(); });
it.each([320, 390, 844])("contains long share URLs/emails and touch targets at %i px", async width => {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: '<html><head></head><body><div id="root"></div></body></html>' }));
  await page.goto(`http://${"long".repeat(12)}.share.test/`);
  await page.addStyleTag({ content: css }); await page.addScriptTag({ content: bundle });
  await page.getByRole("heading", { name: "Share", exact: true }).waitFor();
  await page.getByRole("button", { name: "Generate link" }).click();
  await page.getByRole("button", { name: "Copy", exact: true }).waitFor();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  for (const title of ["Copy link", "Revoke link"]) {
    const rect = await page.getByTitle(title).boundingBox();
    expect(rect!.width).toBeGreaterThanOrEqual(44); expect(rect!.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByText("1 inactive link").click();
  expect(await page.getByText(/expired_token.*expired/).count()).toBe(1);
  await page.getByTitle("Copy link").click();
  await page.getByRole("textbox", { name: "Share link to copy" }).waitFor();
  expect(await page.getByRole("status").textContent()).toContain("Copy failed");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => {} } }));
  await page.getByTitle("Copy link").click();
  expect(await page.getByRole("status").textContent()).toContain("Link copied");
  expect(await page.getByRole("textbox", { name: "Share link to copy" }).count()).toBe(0);
  expect(errors).toEqual([]); await page.close();
}, 15000);
