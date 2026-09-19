import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({ fetched: [] as string[] }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => true, supabaseUrl: () => "https://project.supabase.co", supabaseAnonKey: () => "test-anon" }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
import { GET } from "./route";
import { updateSession } from "@/lib/supabase/middleware";
const key = "sb-project-auth-token";
const encoded = (v: unknown) => "base64-" + Buffer.from(JSON.stringify(v)).toString("base64url");
const session = { access_token: "test-access", refresh_token: "test-refresh", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user: { id: "test-user", aud: "authenticated", email: "tester@example.invalid" } };
function request() { return new NextRequest("https://auditlayermedia.com/auth/callback?code=provider-code&next=/settings/connections", { headers: { cookie: `${key}=${encoded({...session, expires_at: 1, refresh_token: "revoked"})}; ${key}-code-verifier=${encoded("fresh-verifier")}` } }); }
beforeEach(() => { state.fetched=[]; vi.stubGlobal("fetch",vi.fn(async (input: string | URL | Request) => { const url=String(input); state.fetched.push(url); if(url.includes("grant_type=pkce")) return new Response(JSON.stringify(session),{status:200,headers:{"Content-Type":"application/json"}}); return new Response(JSON.stringify({code:"refresh_token_not_found",message:"Invalid refresh token"}),{status:400,headers:{"Content-Type":"application/json"}}); })); });
it("fresh PKCE callback succeeds despite a revoked previous session",async()=>{const response=await GET(request());expect(response.headers.get("location")).toBe("https://auditlayermedia.com/settings/connections");expect(state.fetched.some(u=>u.includes("grant_type=pkce"))).toBe(true);expect(state.fetched.some(u=>u.includes("grant_type=refresh_token"))).toBe(false);expect(response.cookies.get(key)?.value).toBeTruthy();});
it("passive session refresh preserves an in-flight verifier while clearing revoked session cookies", async () => {
  const callback = request();
  const req = new NextRequest("https://auditlayermedia.com/", { headers: callback.headers });
  await updateSession(req);
  expect(req.cookies.get(key + "-code-verifier")?.value).toBe(encoded("fresh-verifier"));
  expect(req.cookies.get(key)?.value).toBe("");
});
it("canonicalizes www before starting a host-bound login", async () => {
  const response = await updateSession(new NextRequest("https://www.auditlayermedia.com/login?next=%2Fsettings%2Fconnections"));
  expect(response.status).toBe(308);
  expect(response.headers.get("location")).toBe("https://auditlayermedia.com/login?next=%2Fsettings%2Fconnections");
  expect(state.fetched).toEqual([]);
});
it("PKCE middleware preservation does not authorize protected routes", async () => {
  const req = new NextRequest("https://auditlayermedia.com/settings/connections", { headers: { cookie: `${key}-code-verifier=${encoded("fresh-verifier")}` } });
  const response = await updateSession(req);
  expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
});
it("missing verifier never exchanges a provider code or grants a session", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const response = await GET(new NextRequest("https://auditlayermedia.com/auth/callback?code=invalid"));
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
    expect(response.cookies.get(key)).toBeUndefined();
    expect(state.fetched).toEqual([]);
  } finally { log.mockRestore(); }
});
it("fresh PKCE success removes obsolete chunk cookies from the prior session", async () => {
  const req = request();
  req.cookies.set(key + ".0", "obsolete");
  req.cookies.set(key + ".1", "obsolete");
  const response = await GET(req);
  expect(response.cookies.get(key)?.value).toBeTruthy();
  expect(response.cookies.get(key + ".0")?.maxAge).toBe(0);
  expect(response.cookies.get(key + ".1")?.maxAge).toBe(0);
});
it("middleware leaves callback PKCE cookies untouched before the route exchanges them",async()=>{const req=request();await updateSession(req);expect(req.cookies.get(key+"-code-verifier")?.value).toBe(encoded("fresh-verifier"));expect(state.fetched).toEqual([]);});
