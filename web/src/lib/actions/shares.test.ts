import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ result: [] as unknown[], from: vi.fn(), bump: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireProfile: async () => ({ id: "owner", role: "client" }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => true, isSupabaseAdminConfigured: () => true }));
vi.mock("@/lib/share-security", () => ({ isShareEmailConfigured: () => true }));
vi.mock("@/lib/resources/mutation-revision", () => ({ bumpResourceRevision: mocks.bump }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { createShareLink, revokeShareLink } from "./shares";
import { projectShareLink, SHARE_LINK_PUBLIC_COLUMNS, shareLinkStatus, type ShareLinkPublic } from "../share-link-public";
let query: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  vi.clearAllMocks(); mocks.result = [];
  query = Object.fromEntries(["select", "eq", "update", "insert"].map(key => [key, vi.fn(() => query)]));
  query.maybeSingle = vi.fn(async () => mocks.result.shift()); query.single = query.maybeSingle;
  mocks.from.mockReturnValue(query);
});
function form(data: Record<string, string>) { const f = new FormData(); for (const [k,v] of Object.entries(data)) f.set(k,v); return f; }
const input = () => form({ auditId: "audit", linkId: "link" });
const initial = { status: "idle" as const };
describe("share owner actions and public DTO", () => {
  it("zero-row revoke is an error, never successful invalidation", async () => {
    mocks.result = [{ data: null, error: null }];
    expect((await revokeShareLink(initial, input())).status).toBe("error");
    expect(mocks.bump).not.toHaveBeenCalled();
  });
  it("requires successful independent revocation readback", async () => {
    mocks.result = [{ data: { id: "link", audit_id: "audit", revoked_at: "now" }, error: null }, { data: null, error: {} }];
    expect((await revokeShareLink(initial, input())).status).toBe("error");
    expect(mocks.bump).not.toHaveBeenCalled();
  });
  it("confirms durable revocation, binds target audit and invalidates reports", async () => {
    mocks.result = [{ data: { id: "link", audit_id: "audit", revoked_at: "now" }, error: null }, { data: { id: "link", revoked_at: "now" }, error: null }];
    expect((await revokeShareLink(initial, input())).status).toBe("ok");
    expect(query.eq).toHaveBeenCalledWith("audit_id", "audit");
    expect(mocks.bump).toHaveBeenCalledWith("reports");
  });
  it("create selects and runtime-projects only public fields, uses strong capability", async () => {
    mocks.result = [{ data: { id: "audit", user_id: "owner", status: "ready", report_path: "p" }, error: null }, { data: { id: "link", token: "token", mode: "email", verification_code: "SECRET", verification_attempts: 3 }, error: null }];
    const result = await createShareLink(initial, form({ auditId: "audit", mode: "email", email: "A@Example.test" }));
    expect(result.status).toBe("ok"); expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(query.select).toHaveBeenCalledWith(SHARE_LINK_PUBLIC_COLUMNS);
    expect(query.insert.mock.calls[0][0]).toMatchObject({ email: "a@example.test", mode: "email", token: expect.stringMatching(/^[\w-]{43}$/) });
  });
  it("missing artifact prevents share creation", async () => {
    mocks.result = [{ data: { id: "audit", user_id: "owner", status: "ready", report_path: null }, error: null }];
    expect((await createShareLink(initial, form({ auditId: "audit", mode: "public" }))).status).toBe("error");
    expect(query.insert).not.toHaveBeenCalled();
  });
  it("projection drops future private fields and status distinguishes expiry", () => {
    expect(projectShareLink({ id: "a", verification_code: "secret" } as unknown as ShareLinkPublic)).not.toHaveProperty("verification_code");
    expect(shareLinkStatus({ revoked_at: null, expires_at: "2000-01-01" })).toBe("expired");
    expect(shareLinkStatus({ revoked_at: "now", expires_at: null })).toBe("revoked");
  });
});
