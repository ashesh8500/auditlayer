import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ owner: "owner", role: "admin", html: "<html><body>one</body></html>", filters: [] as [string, unknown][], download: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getProfile: async () => ({ id: "owner", role: state.role }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ storage: { from: () => ({ download: state.download }) } }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => {
  const q = { select: () => q, abortSignal: () => q, order: () => q, eq: (key: string, value: unknown) => { state.filters.push([key, value]); return q; },
    maybeSingle: async () => ({ data: state.owner === "owner" ? { id: "audit", handle: "example", status: "ready", report_version: 1, report_path: "private.html" } : null }),
  }; return q;
} }) }));
import { GET } from "@/app/api/resources/report/[id]/route";
const read = () => GET(new Request("https://example.com/api/resources/report/audit"), { params: Promise.resolve({ id: "audit" }) });
beforeEach(() => { state.owner = "owner"; state.role = "admin"; state.filters = []; state.download.mockReset().mockImplementation(async () => ({ data: new Blob([state.html]) })); });
it.each(["admin", "user"])("rejects a foreign report before storage in the customer reader for %s", async role => {
  state.owner = "foreign"; state.role = role;
  expect((await read()).status).toBe(404);
  expect(state.filters).toContainEqual(["user_id", "owner"]);
  expect(state.download).not.toHaveBeenCalled();
});
it("returns an owner-qualified identity based on actual presented bytes", async () => {
  const first = await (await read()).json();
  expect(state.filters).toContainEqual(["user_id", "owner"]);
  expect(first.ownerId).toBe("owner"); expect(first.contentHash).toMatch(/^[a-f0-9]{64}$/);
  expect(first.html).toContain("data-alm-presentation");
  state.html = "<html><body>replacement in same path and version</body></html>";
  const second = await (await read()).json();
  expect(second.contentHash).not.toBe(first.contentHash);
  expect(second.presentationRevision).toBe(first.presentationRevision);
});
