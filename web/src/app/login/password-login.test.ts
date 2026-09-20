import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signIn: vi.fn(), configured: true }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({set:vi.fn()}) }));
vi.mock("@/lib/resources/mutation-revision", () => ({bumpResourceRevision:vi.fn()}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("@/lib/auth/magic-link-email", () => ({ isBrandedMagicLinkConfigured: () => false, sendBrandedMagicLink: vi.fn() }));
vi.mock("@/lib/auth/preview-login", () => ({ establishPreviewTestSession: vi.fn() }));
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => mocks.configured, isPreviewLoginAllowed: () => false, siteUrl: () => "https://auditlayermedia.com" }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signInWithPassword: mocks.signIn } }) }));
import { signInWithPassword, signInWithPreviewTestUser, signInWithGoogle } from "./actions";
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
  it("retains the trial for authenticated explicit redemption after password sign-in", async () => {
    mocks.signIn.mockResolvedValue({data:{user:{id:"reviewer"}},error:null});
    const f = form("/audits/new?subject=abc"); f.set("trial","invite");
    await expect(signInWithPassword({status:"idle"},f)).rejects.toThrow("redirect:/login?next=%2Faudits%2Fnew%3Fsubject%3Dabc&trial=invite");
  });
  it("preserves next and trial even when preview login is disabled", async () => {
    const f=form("/audits/new?subject=abc");f.set("trial","invite");
    await expect(signInWithPreviewTestUser(f)).rejects.toThrow("redirect:/login?next=%2Faudits%2Fnew%3Fsubject%3Dabc&error=preview_login_disabled&trial=invite");
  });
  it("preserves next when OAuth is unconfigured", async () => {
    mocks.configured=false;
    await expect(signInWithGoogle(form("/pricing?plan=pro"))).rejects.toThrow("redirect:/login?next=%2Fpricing%3Fplan%3Dpro&error=unconfigured");
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
