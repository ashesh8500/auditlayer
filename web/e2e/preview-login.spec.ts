import { expect, test } from "@playwright/test";

/**
 * Authenticated preview login. Skips unless PREVIEW_TEST_LOGIN_SECRET is set
 * and PLAYWRIGHT_BASE_URL points at a preview (or local with secrets).
 *
 * Usage against a Vercel preview:
 *   PREVIEW_TEST_LOGIN_SECRET=... \
 *   PLAYWRIGHT_BASE_URL=https://web-xxxx.vercel.app \
 *   pnpm e2e e2e/preview-login.spec.ts
 */
test.describe("preview test login", () => {
  const secret = process.env.PREVIEW_TEST_LOGIN_SECRET?.trim() ?? "";

  test.skip(!secret, "PREVIEW_TEST_LOGIN_SECRET not set");

  test("API establishes a session and unlocks /subjects", async ({
    request,
    page,
  }) => {
    const res = await request.post("/api/auth/preview-login", {
      headers: { "x-preview-login-secret": secret },
      data: { next: "/subjects" },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    const body = (await res.json()) as { ok: boolean; email?: string };
    expect(body.ok).toBe(true);

    await page.goto("/subjects");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page).toHaveURL(/\/subjects/);
  });
});
