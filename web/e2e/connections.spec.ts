import { expect, test } from "@playwright/test";

// Uses only the existing preview tester, never production credentials or real Meta consent.
test.describe("signed-in Connections journey", () => {
  const secret = process.env.PREVIEW_TEST_LOGIN_SECRET?.trim() ?? "";
  test.skip(!secret, "PREVIEW_TEST_LOGIN_SECRET not set; authenticated journey unverified");
  test.beforeEach(async ({ page }) => {
    const response = await page.request.post("/api/auth/preview-login", {
      headers: { "x-preview-login-secret": secret }, data: { next: "/settings/connections" },
    });
    expect(response.ok()).toBeTruthy();
  });
  for (const width of [1280, 390]) {
    test(`Subjects → Connections → Reports at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/subjects");
      await expect(page.getByRole("heading", { name: "Subjects", exact: true })).toBeVisible();
      await page.getByRole("main").getByRole("link", { name: /^AuditLayerMedia brand/ }).click();
      await expect(page.getByRole("heading", { name: "AuditLayerMedia", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Channel map" })).toBeVisible();
      await page.getByRole("link", { name: "Reconnect", exact: true }).first().click();
      await expect(page).toHaveURL(/\/settings\/connections/);
      await page.getByRole("navigation", { name: "Account navigation" }).getByRole("link", { name: "Connections", exact: true }).click();
      await expect(page).toHaveURL(/\/settings\/connections/);
      await expect(page.getByRole("heading", { name: "Connections", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Add Instagram", exact: true })).toHaveAttribute("href", /\/api\/auth\/instagram\/start/);
      await expect(page.getByRole("link", { name: "Manage AI App Grants" })).toHaveAttribute("href", "/settings/ai-connections");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole("navigation", { name: "Account navigation" }).getByRole("link", { name: "Reports", exact: true }).click();
      await expect(page.getByRole("link", { name: "Manage Connections" })).toHaveAttribute("href", "/settings/connections");
      await expect(page.getByRole("heading", { name: "Connect Instagram for verified metrics" })).toHaveCount(0);
      await page.getByRole("link", { name: "Manage Connections" }).click();
      await expect(page.getByRole("heading", { name: "Connections", exact: true })).toBeVisible();
    });
  }
  test("invalid callback is recoverable and leaves access controls visible", async ({ page }) => {
    await page.goto("/api/auth/instagram/callback?state=invalid&code=not-a-provider-code");
    await expect(page).toHaveURL(/\/settings\/connections\?instagram_error=invalid_state/);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("connection session expired");
    await expect(page.getByRole("link", { name: "Add Instagram", exact: true })).toBeVisible();
    // No valid OAuth state was created: this probe cannot exchange a code or mutate credentials.
  });
});
