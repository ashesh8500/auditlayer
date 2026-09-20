import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => {
  const query: Record<string, unknown> = {};
  for (const name of ["select", "eq", "order", "range", "abortSignal"]) query[name] = () => query;
  query.then = (resolve: (value: unknown) => unknown) => resolve({ error: { message: "unavailable" } });
  return { create: vi.fn(async () => ({ from: () => query })) };
});
beforeEach(() => vi.clearAllMocks());
vi.mock("@/lib/allowance", () => ({ loadAuditAllowance: async () => ({}) }));
vi.mock("@/lib/auth", () => ({ getProfile: async () => ({ id: "owner" }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: db.create }));
import { GET } from "./route";
it.each(["toString", "constructor", "__proto__", "hasOwnProperty", "not-a-status"])("rejects hostile status %s before querying", async status => {
  const response = await GET(new Request(`https://test/api/resources/reports?status=${status}`));
  expect(response.status).toBe(400);
  expect(db.create).not.toHaveBeenCalled();
});
