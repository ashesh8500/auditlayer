import { expect, test } from "@playwright/test";

test.describe("intelligence product smoke (no Supabase)", () => {
  test("subjects and new-audit routes require authentication", async ({
    page,
  }) => {
    await page.goto("/subjects");
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/subjects/subj-001");
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/audits/new");
    await expect(page).toHaveURL(/\/login/);
  });

  test("390px public shell still fits after intelligence nav changes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
