import { beforeEach, expect, it, vi } from "vitest";
import { isValidElement, type ReactNode } from "react";

const state = vi.hoisted(() => ({
  authorized: false,
  found: true,
  auditOwner: "owner",
  started: [] as string[],
  filters: [] as Array<[string, string, unknown]>,
  resolve: {} as Record<string, (value: unknown) => void>,
  reject: {} as Record<string, (reason: Error) => void>,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireProfile: async () => { state.authorized = true; return { id: "owner", role: "admin" }; } }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/components/report-viewer", () => ({ ReportViewer: () => null }));
vi.mock("@/components/share-links", () => ({ ShareLinks: () => null }));
vi.mock("@/components/intelligence/customer-wait-state", () => ({ CustomerWaitState: () => null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: (table: string) => {
    expect(state.authorized).toBe(true);
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { state.filters.push([table, key, value]); return query; },
      maybeSingle: async () => ({ data: state.found ? { id: "audit", user_id: state.auditOwner, status: "ready", handle: "example", platform: "instagram", limitations: [] } : null }),
      order: () => ({ then: (resolve: (value: unknown) => void, reject: (reason: Error) => void) => {
        state.started.push(table); state.resolve[table] = resolve; state.reject[table] = reject;
      } }),
    };
    return query;
  } }),
}));
import AuditDetailPage from "./page";

function readyElement(node: ReactNode): { type: (props: unknown) => Promise<ReactNode>; props: unknown } | undefined {
  if (Array.isArray(node)) return node.map(readyElement).find(Boolean);
  if (!isValidElement<{ children?: ReactNode }>(node)) return;
  if (typeof node.type === "function" && node.type.name === "ReadyReport") return node as never;
  return readyElement(node.props.children);
}
beforeEach(() => { state.authorized = false; state.found = true; state.auditOwner = "owner"; state.started = []; state.filters = []; state.resolve = {}; state.reject = {}; });

it("owner-scopes the customer detail query even for an admin", async () => {
  await AuditDetailPage({ params: Promise.resolve({ id: "audit" }) });
  expect(state.filters).toContainEqual(["audits", "user_id", "owner"]);
});
it("rejects a foreign audit under broad admin visibility before metadata", async () => {
  state.auditOwner = "foreign-owner";
  await expect(AuditDetailPage({ params: Promise.resolve({ id: "foreign" }) })).rejects.toThrow("NOT_FOUND");
  expect(state.started).toEqual([]);
});
it("starts all independent report metadata reads together after authorization", async () => {
  const element = readyElement(await AuditDetailPage({ params: Promise.resolve({ id: "audit" }) }));
  expect(element).toBeDefined();
  const pending = element!.type(element!.props);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect([...state.started].sort()).toEqual(["audit_report_versions", "refinements", "share_links"]);
  for (const table of state.started) state.resolve[table]({ data: [] });
  await expect(pending).resolves.toBeDefined();
});

it("keeps the authorized report available if optional share metadata throws", async () => {
  const element = readyElement(await AuditDetailPage({ params: Promise.resolve({ id: "audit" }) }));
  const pending = element!.type(element!.props);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(state.started).toContain("share_links");
  state.reject.share_links(new Error("temporary share outage"));
  state.resolve.refinements({ data: [] });
  state.resolve.audit_report_versions({ data: [] });
  await expect(pending).resolves.toBeDefined();
});

it("does not start report metadata when the authorized audit is absent", async () => {
  state.found = false;
  await expect(AuditDetailPage({ params: Promise.resolve({ id: "foreign" }) })).rejects.toThrow("NOT_FOUND");
  expect(state.started).toEqual([]);
});
