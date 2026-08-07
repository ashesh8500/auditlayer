import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { POST } from "./route";

// `@/lib/stripe` and `@/lib/supabase/admin` import `server-only`, which is not
// installed for the vitest environment, and must never touch the network. Mock
// them so the adapter's real reducer path runs against recording clients.
vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const getStripeMock = vi.mocked(getStripe);
const createAdminClientMock = vi.mocked(createAdminClient);

const PROFILE_ID = "00000000-0000-0000-0000-0000000000aa";
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

interface RpcOutcome {
  applied: boolean;
  code: string;
  profile_id?: string | null;
  plan?: string | null;
  status?: string | null;
}

interface RpcResponse {
  data: RpcOutcome | null;
  error: { message: string; code?: string | null } | null;
}

type RpcFn = (name: string, args: Record<string, unknown>) => Promise<RpcResponse>;

const RPC_PARAM_KEYS = [
  "p_current_period_end_epoch",
  "p_customer_id",
  "p_digest",
  "p_event_created",
  "p_event_id",
  "p_event_type",
  "p_plan",
  "p_profile_id",
  "p_status",
  "p_subscription_id",
];

function subscriptionFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_123",
    customer: "cus_123",
    status: "active",
    items: {
      data: [
        { price: { id: "price_pro" }, current_period_end: 1_750_000_000 },
      ],
    },
    metadata: { profile_id: PROFILE_ID },
    ...overrides,
  };
}

function stripeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_1",
    type: "customer.subscription.updated",
    created: 1_749_999_900,
    data: { object: subscriptionFixture() },
    ...overrides,
  };
}

function rpcOk(outcome: RpcOutcome): RpcResponse {
  return { data: outcome, error: null };
}

function makeRequest(payload: unknown, signature = "t=1,v1=sig") {
  return new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "svc_role_key";
  process.env.STRIPE_PRICE_PRO = "price_pro";
  process.env.STRIPE_PRICE_STARTER = "price_starter";

  getStripeMock.mockReset();
  createAdminClientMock.mockReset();
  getStripeMock.mockReturnValue({
    webhooks: { constructEvent: vi.fn() },
    subscriptions: { retrieve: vi.fn() },
  } as never);
  createAdminClientMock.mockReturnValue({ rpc: vi.fn() } as never);
});

afterEach(() => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.STRIPE_PRICE_PRO;
  delete process.env.STRIPE_PRICE_STARTER;
  vi.restoreAllMocks();
});

describe("stripe webhook route adapter", () => {
  it("fails closed with 503 when Stripe/webhook secret is not configured", async () => {
    getStripeMock.mockReturnValue(null as never);
    const response = await POST(makeRequest(stripeEvent()));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "not_configured" });
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("fails closed with 503 when the service-role client is not configured", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const response = await POST(makeRequest(stripeEvent()));
    expect(response.status).toBe(503);
  });

  it("returns 400 for a missing signature before any verification", async () => {
    const request = new NextRequest("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: JSON.stringify(stripeEvent()),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "missing_signature" });
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("returns 400 signature_verification_failed when the signature is invalid", async () => {
    const constructEvent = vi.fn(() => {
      throw new Error("bad signature");
    });
    getStripeMock.mockReturnValue({
      webhooks: { constructEvent },
      subscriptions: { retrieve: vi.fn() },
    } as never);
    const response = await POST(makeRequest(stripeEvent(), "t=1,v1=bad"));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("signature_verification_failed");
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("verifies the signature with the raw payload before reconciling", async () => {
    const constructEvent = vi.fn(() => stripeEvent());
    getStripeMock.mockReturnValue({
      webhooks: { constructEvent },
      subscriptions: { retrieve: vi.fn() },
    } as never);
    createAdminClientMock.mockReturnValue({
      rpc: vi.fn(() => Promise.resolve(rpcOk({ applied: true, code: "ok" }))),
    } as never);
    const payload = JSON.stringify(stripeEvent());
    const response = await POST(
      new NextRequest("http://localhost/api/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=sig" },
        body: payload,
      }),
    );
    expect(response.status).toBe(200);
    expect(constructEvent).toHaveBeenCalledWith(payload, "t=1,v1=sig", "whsec_test");
  });

  it("reconciles an active subscription event through exactly one RPC call", async () => {
    const constructEvent = vi.fn(() => stripeEvent());
    getStripeMock.mockReturnValue({
      webhooks: { constructEvent },
      subscriptions: { retrieve: vi.fn() },
    } as never);
    const rpc = vi.fn<RpcFn>(() =>
      Promise.resolve(rpcOk({ applied: true, code: "ok", profile_id: PROFILE_ID })),
    );
    createAdminClientMock.mockReturnValue({ rpc } as never);

    const response = await POST(makeRequest(stripeEvent()));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.received).toBe(true);
    expect(body.outcome).toMatchObject({ applied: true, code: "ok" });

    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0]!;
    expect(name).toBe("reconcile_stripe_subscription");
    expect(Object.keys(args as Record<string, unknown>).sort()).toEqual(
      RPC_PARAM_KEYS,
    );
    expect(args).toMatchObject({
      p_event_id: "evt_1",
      p_event_type: "customer.subscription.updated",
      p_event_created: 1_749_999_900,
      p_subscription_id: "sub_123",
      p_customer_id: "cus_123",
      p_profile_id: PROFILE_ID,
      p_status: "active",
      p_plan: "pro",
      p_current_period_end_epoch: 1_750_000_000,
    });
    expect(args.p_digest).toMatch(SHA256_HEX_RE);
    // No raw payload or secret leaks into the RPC arguments.
    expect(JSON.stringify(args)).not.toContain("whsec_test");
    expect(JSON.stringify(args)).not.toContain("items");
  });

  it("reconciles a trialing subscription.created event once", async () => {
    const constructEvent = vi.fn(() =>
      stripeEvent({
        id: "evt_2",
        type: "customer.subscription.created",
        data: { object: subscriptionFixture({ status: "trialing" }) },
      }),
    );
    getStripeMock.mockReturnValue({
      webhooks: { constructEvent },
      subscriptions: { retrieve: vi.fn() },
    } as never);
    const rpc = vi.fn<RpcFn>(() => Promise.resolve(rpcOk({ applied: true, code: "ok" })));
    createAdminClientMock.mockReturnValue({ rpc } as never);

    const response = await POST(makeRequest({}));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    const [, args] = rpc.mock.calls[0]!;
    expect(args.p_event_type).toBe("customer.subscription.created");
    expect(args.p_status).toBe("trialing");
    expect(args.p_plan).toBe("pro");
  });

  it("reconciles a canceled subscription.deleted event as plan_revoke once", async () => {
    const constructEvent = vi.fn(() =>
      stripeEvent({
        id: "evt_3",
        type: "customer.subscription.deleted",
        data: { object: subscriptionFixture({ status: "canceled" }) },
      }),
    );
    getStripeMock.mockReturnValue({
      webhooks: { constructEvent },
      subscriptions: { retrieve: vi.fn() },
    } as never);
    const rpc = vi.fn<RpcFn>(() => Promise.resolve(rpcOk({ applied: true, code: "ok" })));
    createAdminClientMock.mockReturnValue({ rpc } as never);

    const response = await POST(makeRequest({}));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    const [, args] = rpc.mock.calls[0]!;
    expect(args.p_status).toBe("canceled");
    expect(args.p_plan).toBe("free");
  });

  it("retrieves the subscription for checkout.session.completed then reconciles once", async () => {
    const retrieve = vi.fn(() => Promise.resolve(subscriptionFixture()));
    const constructEvent = vi.fn(() =>
      stripeEvent({
        id: "evt_4",
        type: "checkout.session.completed",
        created: 1_749_999_901,
        data: {
          object: {
            subscription: "sub_123",
            client_reference_id: PROFILE_ID,
          },
        },
      }),
    );
    getStripeMock.mockReturnValue({
      webhooks: { constructEvent },
      subscriptions: { retrieve },
    } as never);
    const rpc = vi.fn<RpcFn>(() => Promise.resolve(rpcOk({ applied: true, code: "ok" })));
    createAdminClientMock.mockReturnValue({ rpc } as never);

    const response = await POST(makeRequest({}));
    expect(response.status).toBe(200);
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(retrieve).toHaveBeenCalledWith("sub_123");
    expect(rpc).toHaveBeenCalledTimes(1);
    const [, args] = rpc.mock.calls[0]!;
    expect(args.p_event_type).toBe("checkout.session.completed");
    expect(args.p_plan).toBe("pro");
  });

  it("returns a bounded no_subscription outcome without an RPC call", async () => {
    const constructEvent = vi.fn(() =>
      stripeEvent({
        type: "checkout.session.completed",
        data: { object: { subscription: null } },
      }),
    );
    getStripeMock.mockReturnValue({
      webhooks: { constructEvent },
      subscriptions: { retrieve: vi.fn() },
    } as never);
    const rpc = vi.fn();
    createAdminClientMock.mockReturnValue({ rpc } as never);

    const response = await POST(makeRequest({}));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.outcome.code).toBe("no_subscription");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("makes zero RPC calls and returns unknown_price for an unknown price", async () => {
    const constructEvent = vi.fn(() =>
      stripeEvent({
        data: {
          object: subscriptionFixture({
            items: { data: [{ price: { id: "price_unknown" } }] },
          }),
        },
      }),
    );
    getStripeMock.mockReturnValue({
      webhooks: { constructEvent },
      subscriptions: { retrieve: vi.fn() },
    } as never);
    const rpc = vi.fn();
    createAdminClientMock.mockReturnValue({ rpc } as never);

    const response = await POST(makeRequest({}));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.outcome).toMatchObject({ applied: false, code: "unknown_price" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("makes zero RPC calls and returns unsupported_status for past_due", async () => {
    const constructEvent = vi.fn(() =>
      stripeEvent({
        data: { object: subscriptionFixture({ status: "past_due" }) },
      }),
    );
    getStripeMock.mockReturnValue({
      webhooks: { constructEvent },
      subscriptions: { retrieve: vi.fn() },
    } as never);
    const rpc = vi.fn();
    createAdminClientMock.mockReturnValue({ rpc } as never);

    const response = await POST(makeRequest({}));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.outcome.code).toBe("unsupported_status");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("makes zero RPC calls for unsupported event types", async () => {
    const constructEvent = vi.fn(() =>
      stripeEvent({ id: "evt_9", type: "invoice.paid" }),
    );
    getStripeMock.mockReturnValue({
      webhooks: { constructEvent },
      subscriptions: { retrieve: vi.fn() },
    } as never);
    const rpc = vi.fn();
    createAdminClientMock.mockReturnValue({ rpc } as never);

    const response = await POST(makeRequest({}));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.outcome.code).toBe("unsupported_event_type");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps RPC correction codes without further mutation", async () => {
    for (const code of [
      "duplicate",
      "stale",
      "replay",
      "equal_time_conflict",
      "profile_not_found",
      "profile_customer_mismatch",
      "manual_precedence",
    ]) {
      const constructEvent = vi.fn(() => stripeEvent({ id: `evt_${code}` }));
      getStripeMock.mockReturnValue({
        webhooks: { constructEvent },
        subscriptions: { retrieve: vi.fn() },
      } as never);
      const rpc = vi.fn<RpcFn>(() =>
        Promise.resolve(rpcOk({ applied: false, code, profile_id: PROFILE_ID })),
      );
      createAdminClientMock.mockReturnValue({ rpc } as never);

      const response = await POST(makeRequest({}));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.outcome.code).toBe(code);
      // Exactly one atomic RPC per supported event; the RPC owns the no-op.
      expect(rpc).toHaveBeenCalledTimes(1);
    }
  });

  it("returns 500 reconciliation_failed when the RPC reports a persistence failure", async () => {
    const constructEvent = vi.fn(() => stripeEvent());
    getStripeMock.mockReturnValue({
      webhooks: { constructEvent },
      subscriptions: { retrieve: vi.fn() },
    } as never);
    const rpc = vi.fn<RpcFn>(() =>
      Promise.resolve({
        data: null,
        error: { message: "db write failed", code: "P0001" },
      }),
    );
    createAdminClientMock.mockReturnValue({ rpc } as never);

    const response = await POST(makeRequest({}));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("reconciliation_failed");
    expect(body.code).toBe("P0001");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("returns 500 handler_error when the RPC throws", async () => {
    const constructEvent = vi.fn(() => stripeEvent());
    getStripeMock.mockReturnValue({
      webhooks: { constructEvent },
      subscriptions: { retrieve: vi.fn() },
    } as never);
    const rpc = vi.fn<RpcFn>(() => Promise.reject(new Error("boom")));
    createAdminClientMock.mockReturnValue({ rpc } as never);

    const response = await POST(makeRequest({}));
    expect(response.status).toBe(500);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("never emits the webhook secret or raw payload in responses", async () => {
    const constructEvent = vi.fn(() => stripeEvent());
    getStripeMock.mockReturnValue({
      webhooks: { constructEvent },
      subscriptions: { retrieve: vi.fn() },
    } as never);
    const rpc = vi.fn<RpcFn>(() =>
      Promise.resolve(rpcOk({ applied: true, code: "ok", profile_id: PROFILE_ID })),
    );
    createAdminClientMock.mockReturnValue({ rpc } as never);

    const response = await POST(makeRequest({}));
    const text = await response.text();
    expect(text).not.toContain("whsec_test");
    expect(text).not.toContain("svc_role_key");
    expect(text).not.toContain("cus_123");
  });
});
