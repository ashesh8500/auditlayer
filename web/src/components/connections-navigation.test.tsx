import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { AppHeader } from "./app-header";
vi.mock("@/lib/auth", () => ({ getProfile: async () => ({ role: "admin" }) }));
vi.mock("@/lib/env", () => ({ isPreviewTesterEmail: () => false }));
vi.mock("@/app/login/actions", () => ({ signOut: vi.fn() }));
Object.assign(globalThis, { React });
it("makes Connections reachable from the account navigation", async () => {
  expect(renderToStaticMarkup(await AppHeader())).toContain('href="/settings/connections"');
});
it("routes legacy account and wizard Instagram CTAs to Connections rather than grants or Reports", () => {
  for (const p of ["src/app/(app)/accounts/page.tsx", "src/app/(app)/accounts/[id]/page.tsx", "src/components/intelligence/intelligence-wizard.tsx"]) {
    const source = readFileSync(p, "utf8");
    expect(source.includes('/settings/connections') || source.includes('/api/auth/instagram/start?')).toBe(true);
    expect(source).not.toContain('/dashboard#instagram-connection-title');
    expect(source).not.toContain('Reconnect from Reports');
  }
});
