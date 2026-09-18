import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3028';
const output = process.env.QA_OUTPUT_DIR || '/tmp/alm-launch-browser';
if (!process.env.PREVIEW_TEST_LOGIN_SECRET) throw new Error('Dedicated preview login secret required');
await mkdir(output, { recursive: true, mode: 0o700 });
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL });
try {
  const page = await context.newPage();
  const auth = await page.request.post('/api/auth/preview-login', {
    headers: { 'x-preview-login-secret': process.env.PREVIEW_TEST_LOGIN_SECRET },
    data: { next: '/subjects' },
  });
  if (!auth.ok()) throw new Error(`Preview login failed (${auth.status()})`);
  const samples = [];
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/subjects', '/settings/connections', '/dashboard']) {
      for (let repeat = 0; repeat < 3; repeat++) {
        const response = await page.goto(route);
        await page.getByRole('heading', { level: 1 }).waitFor();
        if (response?.status() !== 200 || new URL(page.url()).pathname !== route) throw new Error(`Unexpected route result: ${route}`);
        const timing = await page.evaluate(() => {
          const t = performance.getEntriesByType('navigation')[0];
          return { ttfb_ms: t.responseStart - t.startTime, dom_ms: t.domContentLoadedEventEnd - t.startTime, overflow_px: document.documentElement.scrollWidth - innerWidth };
        });
        if (timing.overflow_px > 1) throw new Error(`Overflow at ${route}/${width}`);
        samples.push({ route, width, repeat, ...timing });
      }
      await page.screenshot({ path: `${output}/${route.replaceAll('/', '_').slice(1)}-${width}.png`, fullPage: true });
    }
  }
  await writeFile(`${output}/timings.json`, JSON.stringify({ environment: 'local production build, real Supabase, dedicated preview tester; not production-user timing', baseURL, samples }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ screenshots: 6, samples: samples.length, output }));
} finally { await context.close(); await browser.close(); }
