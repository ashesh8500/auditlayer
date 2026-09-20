import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClient } from "@/lib/supabase/server";
import Page from "./page";
import { GET } from "@/app/api/resources/connections/route";
import { useWorkspaceQuery } from "@/components/workspace-resources";
vi.mock("@/components/workspace-resources", () => ({ useWorkspaceQuery: vi.fn() }));
async function ConnectionsPage(props: Parameters<typeof Page>[0]) {
  const params = await props.searchParams;
  const response = await GET(new Request(`https://test/api/resources/connections?${new URLSearchParams(params as Record<string, string>)}`));
  const dto = await response.json();
  vi.mocked(useWorkspaceQuery).mockReturnValue({ data: response.ok ? dto : undefined, error: response.ok ? null : new Error("Unavailable"), dataUpdatedAt: 0, refetch: vi.fn() } as never);
  return Page(props);
}
vi.mock("@/lib/auth", () => ({ getProfile: async () => ({ id: "owner", role: "admin" }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/actions/instagram", () => ({ disconnectInstagram: vi.fn() }));
Object.assign(globalThis, { React });
const card = (id: string) => ({ id, ig_username: id, is_active: true, connection_status: "connected", long_lived_expires_at: "2099-01-01" });
const query = { abortSignal: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn() };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(createClient).mockResolvedValue({ from: () => query } as never); });
describe("Connections workspace", () => {
  it("uses a singular connection count and hides unnecessary pagination", async () => {
    query.range.mockResolvedValue({ data: [card("first")], count: 1, error: null });
    const html = renderToStaticMarkup(await ConnectionsPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("1 connection");
    expect(html).not.toContain("1 connections");
    expect(html).not.toContain("Page 1");
  });
  it("lists owner-only connections, paginates and keeps global feedback and Add visible", async () => {
    query.range.mockResolvedValue({ data: [card("first"), card("second")], count: 60, error: null });
    const html = renderToStaticMarkup(await ConnectionsPage({ searchParams: Promise.resolve({ page: "2", instagram_error: "permission_denied" }) }));
    expect(query.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(query.range).toHaveBeenCalledWith(24, 47);
    expect(html).toContain("@first"); expect(html).toContain("@second");
    expect(html).toContain("Add Instagram"); expect(html).toContain("60 connections");
    expect(html).toContain("page=3"); expect(html).toContain('role="alert"');
    expect(html).toContain('/settings/ai-connections');
    expect(query.select.mock.calls[0][0]).not.toContain("token");
  });
  it("loads an owner-checked reconnect target even when it is outside the current page", async () => {
    const target = { ...card("11111111-1111-4111-8111-111111111111"), ig_username: "target-account" };
    const targetQuery = { abortSignal: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: target, error: null }) };
    let calls = 0;
    vi.mocked(createClient).mockResolvedValue({ from: () => calls++ === 0 ? query : targetQuery } as never);
    query.range.mockResolvedValue({ data: [card("first")], count: 60, error: null });
    const html = renderToStaticMarkup(await ConnectionsPage({ searchParams: Promise.resolve({ connection_id: target.id }) }));
    expect(targetQuery.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(html).toContain("target-account");
    expect(html).toContain(`connection_id=${target.id}`);
  });
  it("distinguishes failed loading from an empty workspace", async () => {
    query.range.mockResolvedValue({ data: null, count: null, error: { code: "db-down" } });
    const html = renderToStaticMarkup(await ConnectionsPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Connections could not be loaded");
    expect(html).not.toContain("No Instagram connections yet");
    expect(html).toContain("Try Again");
  });
});
