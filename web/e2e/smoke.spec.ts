import { expect, test } from "@playwright/test";

test.describe("public smoke (no Supabase creds required)", () => {
  test("landing page renders hero and pricing", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: /social media audits that read like research/i,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Starter" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pro" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /start your free audit/i }),
    ).toBeVisible();
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
});
