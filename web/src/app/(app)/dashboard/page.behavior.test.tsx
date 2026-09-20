import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import Page from "./page";
import { GET } from "@/app/api/resources/reports/route";
import { useWorkspaceQuery } from "@/components/workspace-resources";
vi.mock("@/components/workspace-resources", () => ({ useWorkspaceQuery: vi.fn() }));
async function DashboardPage(props: Parameters<typeof Page>[0]) {
  const params = await props.searchParams;
  const response = await GET(new Request(`https://test/api/resources/reports?${new URLSearchParams(params as Record<string, string>)}`));
  const dto = await response.json();
  vi.mocked(useWorkspaceQuery).mockReturnValue({ data: response.ok ? dto : undefined, error: response.ok ? null : new Error("Unavailable"), dataUpdatedAt: 0, refetch: vi.fn() } as never);
  return Page(props);
}
vi.mock("@/lib/auth", () => ({ getProfile: async () => ({ id: "owner", role: "admin", plan: "pro" }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/actions/billing", () => ({ startStarterCheckout: vi.fn(), startProCheckout: vi.fn(), openBillingPortal: vi.fn() }));
vi.mock("@/lib/actions/instagram", () => ({ disconnectInstagram: vi.fn() }));
Object.assign(globalThis, { React });
let result: { data: unknown[]; count: number | null; error: unknown };
const queries: any[] = [];
beforeEach(() => {
  result = { data: [], count: 61, error: null };
  queries.length = 0;
  vi.mocked(createClient).mockResolvedValue({ rpc: vi.fn().mockResolvedValue({ data: { effective_plan: "enterprise", allowed_report_types: ["standard"], usage: 0, limit: null, remaining: null, can_submit: true, window_valid: true, window_kind: "lifetime", gifts: 0 }, error: null }), from: (table: string) => {
    const q: any = { table, abortSignal: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), then: (resolve: (v: unknown) => unknown) => resolve(result) };
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

it("fails honestly when allowance cannot be read rather than displaying zero usage", async () => {
  const client = await createClient();
  vi.mocked(client.rpc).mockResolvedValueOnce({ data: null, error: { message: "unavailable" } } as never);
  const response = await GET(new Request("https://test/api/resources/reports"));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ code: "allowance_unavailable" });
});
it("does not claim a query-string checkout return activated the subscription", async () => {
  const html = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({ billing: "success" }) }));
  expect(html).toContain("after payment confirmation");
  expect(html).not.toContain("Subscription active");
});
it("keeps report version/date without customer prompt telemetry", async () => {
  result = { data: [{ id: "report", handle: "account", status: "ready", platform: "instagram", report_version: 3, prompt_version: "secret-method", created_at: "2026-09-19T00:00:00Z" }], count: 1, error: null };
  const html = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain("Report v3");
  expect(html).not.toContain("secret-method");
  expect(queries[0].select.mock.calls[0][0]).not.toContain("prompt_version");
});
