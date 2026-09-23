import { test, expect } from '@playwright/test';

for (const [plan, price, credits] of [['Free', '$0', '500'], ['Brand', '$199', '5,000'], ['Studio', '$499', '15,000']]) {
  test(`commercial pricing ${plan} shows the approved offer and reaches authenticated enrollment`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto('/pricing');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Choose your plan' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: plan, exact: true }) });
    await expect(card.getByText(`${price} / month`, { exact: true })).toBeVisible();
    await expect(card.getByText(`${credits} credits / month`, { exact: plan !== 'Studio' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^(Starter|Pro|Workspace)$/ })).toHaveCount(0);
    await card.getByRole('link', { name: 'View Enrollment' }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fcommercial$/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });
}
