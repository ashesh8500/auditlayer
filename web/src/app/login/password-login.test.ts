import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signIn: vi.fn(), configured: true }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("@/lib/auth/magic-link-email", () => ({ isBrandedMagicLinkConfigured: () => false, sendBrandedMagicLink: vi.fn() }));
vi.mock("@/lib/auth/preview-login", () => ({ establishPreviewTestSession: vi.fn() }));
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => mocks.configured, isPreviewLoginAllowed: () => false, siteUrl: () => "https://auditlayermedia.com" }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signInWithPassword: mocks.signIn } }) }));
import { signInWithPassword } from "./actions";
function form(next = "/dashboard") { const f = new FormData(); f.set("email", " Reviewer@Example.com "); f.set("password", "test-only-password"); f.set("next", next); return f; }
describe("normal password sign-in", () => {
  beforeEach(() => { mocks.configured = true; mocks.signIn.mockReset(); });
  it("establishes a normal user session and redirects locally", async () => {
    mocks.signIn.mockResolvedValue({ data: { user: { id: "reviewer" } }, error: null });
    await expect(signInWithPassword({ status: "idle" }, form())).rejects.toThrow("redirect:/dashboard");
    expect(mocks.signIn).toHaveBeenCalledWith({ email: "reviewer@example.com", password: "test-only-password" });
  });
  it.each(["https://example.com", "//example.com", "/\\example.com"])("rejects external redirect target %s", async (target) => {
    mocks.signIn.mockResolvedValue({ data: { user: { id: "reviewer" } }, error: null });
    await expect(signInWithPassword({ status: "idle" }, form(target))).rejects.toThrow("redirect:/dashboard");
  });
  it("returns a generic error without reflecting provider data", async () => {
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: { message: "private provider details" } });
    expect(await signInWithPassword({ status: "idle" }, form())).toEqual({ status: "error", message: "Unable to sign in. Check your email and password." });
  });
  it("rejects missing credentials before calling authentication", async () => {
    const f = form(); f.delete("password");
    expect((await signInWithPassword({ status: "idle" }, f)).status).toBe("error");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
});
