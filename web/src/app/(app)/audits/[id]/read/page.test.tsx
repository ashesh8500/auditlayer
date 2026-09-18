import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ owner: "owner", role: "admin", filters: [] as [string, unknown][] }));
vi.mock("@/lib/auth", () => ({ requireProfile: async () => ({ id: "owner", role: state.role }) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/components/immersive-report", () => ({ ImmersiveReport: () => null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => {
  const q = { select: () => q, eq: (key: string, value: unknown) => { state.filters.push([key, value]); return q; },
    maybeSingle: async () => ({ data: { id: "audit", user_id: state.owner, handle: "example", status: "ready", report_path: "private.html" } }),
  }; return q;
} }) }));
import ReadPage from "./page";
beforeEach(() => { state.owner = "owner"; state.role = "admin"; state.filters = []; });
it.each(["admin", "user"])("rejects a foreign report in the customer reader for %s", async (role) => {
  state.owner = "foreign"; state.role = role;
  await expect(ReadPage({ params: Promise.resolve({ id: "audit" }) })).rejects.toThrow("NOT_FOUND");
});
it("keeps owned reports readable with an explicit owner-filtered query", async () => {
  await expect(ReadPage({ params: Promise.resolve({ id: "audit" }) })).resolves.toBeDefined();
  expect(state.filters).toContainEqual(["user_id", "owner"]);
});
