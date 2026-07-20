import { expect, test } from "@playwright/test";

test.describe("public smoke (no Supabase creds required)", () => {
  test("landing page leads with product proof and pricing", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: /know what to do next/i,
      }),
    ).toBeVisible();
    await expect(page.getByText(/sample intelligence brief/i)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Starter" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pro" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /run a free pulse audit/i }).first(),
    ).toBeVisible();
  });

  test("public surfaces fit a 390px viewport and preserve keyboard focus", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();

    await page.goto("/login");
    const loginOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(loginOverflow).toBeLessThanOrEqual(1);
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  });

  test("login page renders magic link and Google options", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /continue with google/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /send magic link/i }),
    ).toBeVisible();
  });

  test("protected dashboard redirects to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("intake route requires authentication", async ({ page }) => {
    await page.goto("/audits/new");
    await expect(page).toHaveURL(/\/login/);
  });

  test("sample report is honest and navigable", async ({ page }) => {
    await page.goto("/sample");
    await expect(page.getByText(/fictional sample intelligence brief/i)).toBeVisible();
    await expect(page.getByText(/no client data/i)).toBeVisible();
    await page.getByRole("tab", { name: "Benchmark" }).click();
    await expect(page.getByRole("heading", { name: /distribution discipline/i })).toBeVisible();
    await page.getByRole("tab", { name: "Action plan" }).click();
    await expect(page.getByText(/ranked next actions/i)).toBeVisible();
  });

  test("Instagram approval surfaces fail closed and stay public", async ({ request, page }) => {
    const start = await request.get("/api/auth/instagram/start", { maxRedirects: 0 });
    expect(start.status()).toBe(307);
    expect(start.headers().location).toContain("/login");

    const callback = await request.get(
      "/api/auth/instagram/callback?code=review-code&state=wrong-state",
      { maxRedirects: 0 },
    );
    expect(callback.status()).toBe(307);
    expect(callback.headers().location).toContain("instagram_error=not_authenticated");

    await page.goto("/data-deletion");
    await expect(
      page.getByRole("heading", { name: /delete your Instagram connection or account data/i }),
    ).toBeVisible();
    await expect(page.getByText(/disconnect and delete access/i).first()).toBeVisible();
  });
});
