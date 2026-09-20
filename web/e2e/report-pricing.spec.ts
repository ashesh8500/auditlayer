import { test, expect } from '@playwright/test';

for (const plan of ['starter', 'pro']) {
  test(`report pricing ${plan} keeps the plan through the real sign-in page`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto(`/pricing?plan=${plan}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Choose your plan' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.getByRole('link', { name: `Sign In for ${plan === 'pro' ? 'Pro' : 'Starter'}` }).click();
    await expect(page).toHaveURL(new RegExp(`/login\\?next=%2Fpricing%3Fplan%3D${plan}$`));
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });
}
