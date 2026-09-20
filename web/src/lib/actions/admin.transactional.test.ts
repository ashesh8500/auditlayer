import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), bump: vi.fn(), upload: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn(async () => ({ id: "founder" })) }));
vi.mock("@/lib/env", () => ({ isSupabaseAdminConfigured: () => true, siteUrl: () => "https://example.test" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/resources/mutation-revision", () => ({ bumpResourceRevision: mocks.bump }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from, storage: { from: () => ({ upload: mocks.upload }) } }) }));
import { setUserAccess, updateSettings, uploadManualReport } from "./admin";
function form(values: Record<string, string>) { const f = new FormData(); for (const [k,v] of Object.entries(values)) f.set(k,v); return f; }
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: { version: 2 }, error: null }); mocks.upload.mockResolvedValue({ error: null }); });
describe("transactional founder controls", () => {
 it("rejects arbitrary production models and toolsets before any write", async () => {
  expect((await updateSettings({ status: "idle" }, form({ hermes_model: "other-model", enabled_toolsets: "browser", token_cap: "120000", cost_cap_usd: "1" }))).status).toBe("error");
  expect(mocks.from).not.toHaveBeenCalled();
 });
 it("uploads unique immutable objects and finalizes through the transaction", async () => {
  const f = form({ auditId: "audit-id" });
  f.set("file", new File(["<html><body>Report</body></html>"], "report.html", { type: "text/html" }));
  expect((await uploadManualReport({ status: "idle" }, f)).status).toBe("ok");
  const [path, , options] = mocks.upload.mock.calls[0];
  expect(path).toMatch(/^audit-id\/manual\/[0-9a-f-]+\.html$/);
  expect(options.upsert).toBe(false);
  expect(mocks.rpc).toHaveBeenCalledWith("admin_finalize_manual_report", { p_actor_id: "founder", p_audit_id: "audit-id", p_report_path: path });
  expect(mocks.from).not.toHaveBeenCalled();
 });
 it("keeps failed finalization unconfirmed and does not invalidate", async () => {
  mocks.rpc.mockResolvedValueOnce({ error: { message: "transport outcome unknown" } });
  const f = form({ auditId: "audit-id" });
  f.set("file", new File(["<html>Report</html>"], "report.html"));
  expect((await uploadManualReport({ status: "idle" }, f)).status).toBe("error");
  expect(mocks.bump).not.toHaveBeenCalled();
 });
 it("normalizes saved settings to the fixed production contract", async () => {
  const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
  mocks.from.mockReturnValueOnce({ update });
  expect((await updateSettings({ status: "idle" }, form({ token_cap: "120000", cost_cap_usd: "1" }))).status).toBe("ok");
  expect(update).toHaveBeenCalledWith({ hermes_model: "deepseek-v4-flash", enabled_toolsets: [], token_cap: 120000, cost_cap_usd: 1 });
 });
 it("sends a gift delta, never a stale absolute balance", async () => {
  const result = await setUserAccess({ status: "idle" }, form({ profileId: "user", plan: "enterprise", account_type: "standard", gifted_delta: "-1", reason: "Correction" }));
  expect(result.status).toBe("ok");
  expect(mocks.rpc).toHaveBeenCalledWith("admin_assign_access_delta", expect.objectContaining({ p_gifted_delta: -1, p_plan: "enterprise" }));
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.bump).toHaveBeenCalledWith("reports");
 });
 it("does not invalidate or claim success on transaction failure", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "log failed" } });
  expect((await setUserAccess({ status: "idle" }, form({ profileId: "user", plan: "pro", account_type: "comp", gifted_delta: "1", reason: "Comp" }))).status).toBe("error");
  expect(mocks.bump).not.toHaveBeenCalled();
 });
});
