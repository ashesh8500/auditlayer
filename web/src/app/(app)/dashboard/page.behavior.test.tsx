import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import DashboardPage from "./page";
vi.mock("@/lib/auth", () => ({ requireProfile: async () => ({ id: "owner", role: "admin", plan: "pro" }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/actions/billing", () => ({ startStarterCheckout: vi.fn(), startProCheckout: vi.fn(), openBillingPortal: vi.fn() }));
vi.mock("@/lib/actions/instagram", () => ({ disconnectInstagram: vi.fn() }));
Object.assign(globalThis, { React });
let result: { data: unknown[]; count: number | null; error: unknown };
const queries: any[] = [];
beforeEach(() => {
  result = { data: [], count: 61, error: null };
  queries.length = 0;
  vi.mocked(createClient).mockResolvedValue({ from: (table: string) => {
    const q: any = { table, select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), then: (resolve: (v: unknown) => unknown) => resolve(result) };
    queries.push(q); return q;
  } } as never);
});
it("shows load errors without claiming an empty report library", async () => {
  result = { data: [], count: null, error: { code: "unavailable" } };
  const html = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain("Reports could not be loaded");
  expect(html).not.toContain("0 total");
  expect(html).not.toContain("Your research desk is ready");
});
it("does not call an older page's report the latest report", async () => {
  result = { data: [{ id: "old", handle: "old-account", status: "ready", platform: "instagram" }], count: 30, error: null };
  const html = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({ page: "2" }) }));
  expect(html).not.toContain("Latest report");
  expect(html).toContain("old-account");
});
it("owner-scopes even admin reports, paginates and replaces the singleton manager with Connections", async () => {
  const html = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({ page: "2", status: "ready" }) }));
  expect(queries.every(q => q.table === "audits")).toBe(true);
  expect(queries.every(q => q.eq.mock.calls.some((c: string[]) => c[0] === "user_id" && c[1] === "owner"))).toBe(true);
  expect(queries[0].range).toHaveBeenCalledWith(24, 47);
  expect(queries[0].eq).toHaveBeenCalledWith("status", "ready");
  expect(html).toContain('href="/settings/connections"');
  expect(html).not.toContain("Connect Instagram for verified metrics");
  expect(html).toContain("page=3");
});
