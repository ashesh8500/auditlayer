import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), set: vi.fn(), configured: true }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/env", () => ({ isSupabaseAdminConfigured: () => mocks.configured }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.set }) }));
import { POST } from "./route";
import { shareCodeHash, shareHash } from "@/lib/share-security";
const token = "fixture_token_123";
async function post(body: unknown, origin = "http://localhost") {
  return POST(new Request(`http://localhost/s/${token}/verify`, { method: "POST", headers: { Origin: origin }, body: JSON.stringify(body) }), { params: Promise.resolve({ token }) });
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.configured = true;
  vi.stubEnv("RESEND_API_KEY", "fixture-not-live"); vi.stubEnv("SHARE_EMAIL_FROM", "Test <test@example.test>");
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  mocks.rpc.mockImplementation(async (_name, args) => ({ data: { reserve: "reserved", activate: "sent", verify: "verified" }[args.p_action as string], error: null }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("anonymous email delivery endpoint with mocked provider", () => {
  it("sends a real provider request to normalized bound recipient, then activates hash", async () => {
    const response = await post({ action: "send_code", email: " Recipient@Example.test " });
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const payload = JSON.parse(String(options!.body));
    expect(payload.to).toEqual(["recipient@example.test"]);
    const code = payload.text.match(/\b\d{6}\b/)[0];
    expect(mocks.rpc.mock.calls.map(c => c[1].p_action)).toEqual(["reserve", "activate"]);
    expect(mocks.rpc.mock.calls[0][1].p_hash).toBe(shareCodeHash(token, "recipient@example.test", code));
    expect(await response.text()).not.toContain(code); expect(mocks.set).not.toHaveBeenCalled();
  });
  it("provider failure cannot activate a challenge or leak its body", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("SECRET provider diagnostic", { status: 500 }));
    const response = await post({ action: "send_code", email: "recipient@example.test" });
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("SECRET");
    expect(mocks.rpc).toHaveBeenCalledTimes(1); expect(mocks.set).not.toHaveBeenCalled();
  });
  it.each(["limited", "unavailable", "invalid"])("does not send on reservation result %s", async result => {
    mocks.rpc.mockResolvedValue({ data: result, error: null });
    const response = await post({ action: "send_code", email: "recipient@example.test" });
    expect(response.status).toBe(result === "limited" ? 429 : result === "invalid" ? 200 : 410);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("DB reservation failure prevents delivery", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "private" } });
    expect((await post({ action: "send_code", email: "recipient@example.test" })).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("activation failure returns failure even after provider accepts", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: "reserved", error: null }).mockResolvedValueOnce({ data: null, error: {} });
    expect((await post({ action: "send_code", email: "recipient@example.test" })).status).toBe(503);
  });
  it("missing provider config never claims delivery", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect((await post({ action: "send_code", email: "recipient@example.test" })).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("only durable one-time verification creates an opaque HttpOnly session", async () => {
    const response = await post({ action: "verify_code", email: "recipient@example.test", code: "123456" });
    expect(await response.json()).toEqual({ ok: true, verified: true });
    const [name, value, options] = mocks.set.mock.calls[0];
    expect(name).toBe(`alm_share_${token}`); expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(options).toMatchObject({ httpOnly: true, path: "/", sameSite: "lax", maxAge: 86400 });
    expect(mocks.rpc.mock.calls[0][1].p_session_hash).toBe(shareHash(value));
  });
  it.each(["invalid", "limited", "unavailable"])("rejected verification %s cannot mint a session", async result => {
    mocks.rpc.mockResolvedValue({ data: result, error: null });
    const response = await post({ action: "verify_code", email: "recipient@example.test", code: "123456" });
    expect(response.ok).toBe(false); expect(mocks.set).not.toHaveBeenCalled();
  });
  it.each([null, [], { action: "send_code", email: 1 }, { action: "oops", email: "a@example.test" }])("rejects malformed JSON shape", async body => {
    expect((await post(body)).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects cross-origin requests", async () => {
    expect((await post({ action: "send_code", email: "a@example.test" }, "https://stranger.test")).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
