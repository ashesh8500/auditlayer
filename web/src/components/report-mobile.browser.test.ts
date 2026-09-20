import { afterAll, beforeAll, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import path from "node:path";
import { presentReportHtml } from "../lib/report-presentation";

// Offline component harness. No Supabase, provider, or payment calls.
let browser: Browser;
let bundle: string;
const source = process.env.ALM_REPORT_FIXTURE
  ? readFileSync(process.env.ALM_REPORT_FIXTURE, "utf8")
  : readFileSync(path.resolve('../worker/auditlayer_worker/templates/master-skeleton.html'), 'utf8').replace('</body>', '<div class="container"><section><table class="data-table"><tr>' + '<td>Long unbreakable metric label</td>'.repeat(12) + '</tr></table></section></div></body>');
beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
  const result = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {ImmersiveReport} from './src/components/immersive-report'; import {ReportFrame} from './src/components/report-frame'; createRoot(document.getElementById('root')).render(location.pathname === '/frame' ? <ReportFrame src="/report" title="Audit report" sandbox="allow-same-origin" style={{width:'100%',height:700,border:0}}/> : <ImmersiveReport reportUrl="/report" backHref="/dashboard"/>);`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' }, format: 'iife', jsx: 'automatic', alias: { '@': path.resolve('src') },
  });
  bundle = result.outputFiles[0].text;
});
afterAll(async () => { await browser?.close(); });

it('opens the iframe upgrade in the app, without allowing iframe scripts or top navigation', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/report') return route.fulfill({ contentType: 'text/html', body: presentReportHtml('<html><body><a href="https://auditlayermedia.com/pricing">Upgrade to Extended</a></body></html>', 'http://report.test') });
    return route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0"><div id="root"></div><h1>Offline route fixture</h1></body></html>' });
  });
  await page.goto('http://report.test/frame');
  await page.addScriptTag({ content: bundle });
  await page.waitForSelector('iframe');
  expect(await page.locator('iframe').getAttribute('sandbox')).toBe('allow-same-origin');
  await page.frameLocator('iframe').getByText('Upgrade to Extended').click();
  await page.waitForURL('http://report.test/pricing?plan=pro', { timeout: 3000 });
  expect(page.url()).toBe('http://report.test/pricing?plan=pro');
  await page.close();
});

it('ignores malformed iframe links without crashing the host bridge', async () => {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: new URL(route.request().url()).pathname === '/report'
    ? '<html><body><a href="https://[bad">Malformed link</a></body></html>'
    : '<html><body><div id="root"></div></body></html>' }));
  await page.goto('http://report.test/frame');
  await page.addScriptTag({ content: bundle });
  await page.frameLocator('iframe').getByText('Malformed link').click();
  expect(page.url()).toBe('http://report.test/frame');
  expect(errors).toEqual([]);
  await page.close();
});

it.each(['adjacent', 'footer', 'unclosed', 'nested'])('keeps independent scroll geometry for %s source boundaries', async kind => {
  const page = await browser.newPage({ viewport: { width: 320, height: 844 } });
  const table = '<table style="width:900px"><tr><td>Evidence</td></tr></table>';
  const body = kind === 'adjacent' ? table + table
    : kind === 'footer' ? table + '<p>Prompt v1.8 · today · ~$0.12 · 1+2 tokens</p>'
    : kind === 'nested' ? '<table style="width:900px"><tr><td>'+table+'</td></tr></table>'
    : '<table style="width:900px"><tr><td>A</table><table style="width:900px"><tr><td>B';
  const html = presentReportHtml(`<html><body>${body}</body></html>`);
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('http://report.test');
  const metrics = await page.evaluate(() => {
    const tables = [...document.querySelectorAll('table')];
    const regions = [...document.querySelectorAll<HTMLElement>('.alm-table-scroll')];
    regions[0].scrollLeft = 70;
    return { width:document.documentElement.scrollWidth, distinct:new Set(tables.map(t=>t.parentElement)).size,
      tables:tables.length, empty:regions.filter(r=>!r.querySelector('table')).length,
      first:regions[0].scrollLeft, second:regions[1]?.scrollLeft ?? 0,
      telemetry:document.body.textContent?.includes('tokens') };
  });
  expect(metrics.width).toBe(320);
  expect(metrics.distinct).toBe(metrics.tables);
  expect(metrics.empty).toBe(0);
  expect(metrics.first).toBeGreaterThan(0);
  expect(metrics.second).toBe(0);
  expect(metrics.telemetry).toBe(false);
  await page.close();
});

it.each([320, 390, 768, 1440].flatMap(width => ['shadow', 'iframe'].map(mode => ({ width, mode }))))('contains the real $mode reader at $width px and retains its root/body typography', async ({ width, mode }) => {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  page.on('pageerror', error => console.error(error.message));
  await page.route('**/*', route => {
    if (route.request().url() === 'http://report.test/report') return route.fulfill({ contentType: 'text/html', body: presentReportHtml(source, 'http://report.test') });
    if (['http://report.test/', 'http://report.test/frame'].includes(route.request().url())) return route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0"><div id="root"></div></body></html>' });
    return route.abort();
  });
  await page.goto(`http://report.test/${mode === 'iframe' ? 'frame' : ''}`);
  await page.addScriptTag({ content: bundle });
  const locator = mode === 'iframe' ? page.frameLocator('iframe').locator('.container').first() : page.locator('.container').first();
  await locator.waitFor();
  const metrics = await locator.evaluate(reportNode => {
    const root = reportNode.getRootNode() as Document | ShadowRoot;
    const report = root.querySelector('.container')!;
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, font: getComputedStyle(report).fontFamily, accent: getComputedStyle(report).getPropertyValue('--accent').trim(), tables: [...root.querySelectorAll('.alm-table-scroll')].map(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth })) };
  });
  console.log('report geometry', mode, metrics);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(width);
  expect(metrics.font).toContain('Inter');
  expect(metrics.accent).toBe('#0d9488');
  if (width < 400) {
    expect(metrics.tables.some(t => t.scrollWidth > t.width)).toBe(true);
    const scrollArea = mode === 'iframe' ? page.frameLocator('iframe').locator('.alm-table-scroll').first() : page.locator('.alm-table-scroll').first();
    const scrolled = await scrollArea.evaluate(el => { el.scrollLeft = 100; return el.scrollLeft; });
    expect(scrolled).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollX)).toBe(0);
  }
  await page.close();
}, 30000);
