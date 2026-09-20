import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/stripe/route";
import type { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ event: {} as Record<string, unknown>, rpc: vi.fn(), verify: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({ webhooks: { constructEvent: mocks.verify } }) }));
vi.mock("@/lib/env", () => ({ isSupabaseAdminConfigured: () => true }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "test-only";
  process.env.STRIPE_PRICE_PRO = "price_pro";
  process.env.STRIPE_PRICE_STARTER = "price_starter";
  mocks.verify.mockReset().mockImplementation(() => mocks.event);
  mocks.rpc.mockReset().mockResolvedValue({ data: { applied: true, code: "ok" }, error: null });
});
function event(items: unknown[], legacy: Record<string, number> = {}) {
  mocks.event = { id: "evt", created: 1900000000, type: "customer.subscription.updated", data: { object: {
    id: "sub", customer: "cus", status: "active", items: { data: items }, ...legacy,
  } } };
}
async function post() {
  return POST(new Request("https://test/api/webhooks/stripe", { method: "POST", body: "signed-body", headers: { "stripe-signature": "signature" } }) as NextRequest);
}
it("passes the mapped item's exact window rather than the first add-on's window", async () => {
  event([{ price: { id: "addon" }, current_period_start: 100, current_period_end: 200 }, { price: { id: "price_pro" }, current_period_start: 1800000000, current_period_end: 1802678400 }]);
  expect((await post()).status).toBe(200);
  expect(mocks.verify).toHaveBeenCalledWith("signed-body", "signature", "test-only");
  expect(mocks.rpc).toHaveBeenCalledWith("reconcile_stripe_subscription", expect.objectContaining({ p_current_period_start_epoch: 1800000000, p_current_period_end_epoch: 1802678400 }));
});
it("supports exact legacy subscription windows without reconstructing a start", async () => {
  event([{ price: { id: "price_pro" } }], { current_period_start: 1800000000, current_period_end: 1802678400 });
  await post();
  expect(mocks.rpc).toHaveBeenCalledWith("reconcile_stripe_subscription", expect.objectContaining({ p_current_period_start_epoch: 1800000000 }));
});
it("does not splice a partial item window with a legacy end", async () => {
  event([{ price: { id: "price_pro" }, current_period_start: 1800000000 }], { current_period_start: 1700000000, current_period_end: 1802678400 });
  const response = await post();
  expect(await response.json()).toMatchObject({ outcome: { applied: false, code: "malformed_period" } });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("rejects an ambiguous pair of mapped commercial items without changing a plan", async () => {
  event(["price_pro", "price_starter"].map(id => ({ price: { id }, current_period_start: 1800000000, current_period_end: 1802678400 })));
  await post(); expect(mocks.rpc).not.toHaveBeenCalled();
});
