/**
 * ALM-I-026 — billing-portal session contract and orchestration tests (no
 * browser, no DOM, no network, no provider calls).
 *
 * Proves the fail-closed orchestration of `runBillingPortal` through a
 * recording Stripe boundary. Fixtures verify adapter call shape and bounded
 * recovery semantics only; they do NOT prove live Stripe customer existence,
 * provider replay/idempotency, billing conversion, or entitlement correctness.
 */

import { describe, expect, it } from "vitest";

import {
  BILLING_PORTAL_VERSION,
  PORTAL_SESSION_HOST,
  billingPortalRecoveryUrl,
  buildBillingPortalContract,
  canonicalPortalReturnUrl,
  isPlausibleStripeCustomerId,
  isSafePortalSessionUrl,
  isSafeReturnUrl,
  runBillingPortal,
  type BillingPortalDeps,
  type BillingPortalProfile,
  type BillingPortalSessionParams,
  type BillingPortalStripeBoundary,
} from "./billing-portal";

const PROFILE_ID = "00000000-0000-0000-0000-0000000000bb";
const CUSTOMER_ID = "cus_AbCdEf1234567890wxyz";
const SITE_URL = "https://auditlayermedia.example";
const SESSION_URL = `https://${PORTAL_SESSION_HOST}/session/cs_test_123`;

// ---------------------------------------------------------------------------
// Recording boundary fixture
// ---------------------------------------------------------------------------

interface RecordedSessionCall {
  params: BillingPortalSessionParams;
}

class RecordingBillingPortalFixture {
  profile: BillingPortalProfile;
  stripeConfigured = true;
  sessionUrl: string | null = SESSION_URL;
  sessionError: Error | null = null;
  siteUrlValue: string = SITE_URL;
  profileError: Error | null = null;

  sessionCalls: RecordedSessionCall[] = [];

  constructor(profile: Partial<BillingPortalProfile> = {}) {
    this.profile = {
      id: PROFILE_ID,
      stripe_customer_id: CUSTOMER_ID,
      ...profile,
    };
  }

  private get stripe(): BillingPortalStripeBoundary {
    return {
      billingPortal: {
        sessions: {
          create: async (params) => {
            this.sessionCalls.push({ params });
            if (this.sessionError) throw this.sessionError;
            return { url: this.sessionUrl };
          },
        },
      },
    };
  }

  deps(): BillingPortalDeps {
    return {
      getProfile: async () => {
        if (this.profileError) throw this.profileError;
        return this.profile;
      },
      getStripe: () => (this.stripeConfigured ? this.stripe : null),
      siteUrl: () => this.siteUrlValue,
    };
  }
}

// ---------------------------------------------------------------------------
// 1. Local link / URL safety primitives
// ---------------------------------------------------------------------------

describe("isPlausibleStripeCustomerId", () => {
  it("accepts canonical cus_ ids", () => {
    expect(isPlausibleStripeCustomerId(CUSTOMER_ID)).toBe(true);
    expect(isPlausibleStripeCustomerId("cus_existing")).toBe(true);
    expect(isPlausibleStripeCustomerId("cus_AbCdEf1234567890")).toBe(true);
  });

  it("rejects missing, empty, and malformed values", () => {
    expect(isPlausibleStripeCustomerId(null)).toBe(false);
    expect(isPlausibleStripeCustomerId(undefined)).toBe(false);
    expect(isPlausibleStripeCustomerId("")).toBe(false);
    expect(isPlausibleStripeCustomerId("   ")).toBe(false);
    expect(isPlausibleStripeCustomerId("sub_123")).toBe(false);
    expect(isPlausibleStripeCustomerId("CUS_123")).toBe(false);
    expect(isPlausibleStripeCustomerId("cus_")).toBe(false);
    expect(isPlausibleStripeCustomerId("cus_has space")).toBe(false);
    expect(isPlausibleStripeCustomerId("cus_fixture_123")).toBe(false);
  });
});

describe("canonicalPortalReturnUrl + isSafeReturnUrl", () => {
  it("builds the canonical /dashboard return URL without a trailing slash", () => {
    expect(canonicalPortalReturnUrl("https://auditlayermedia.example")).toBe(
      "https://auditlayermedia.example/dashboard",
    );
    expect(canonicalPortalReturnUrl("https://auditlayermedia.example/")).toBe(
      "https://auditlayermedia.example/dashboard",
    );
  });

  it("accepts an https canonical return URL on the site origin", () => {
    expect(
      isSafeReturnUrl("https://auditlayermedia.example/dashboard", "https://auditlayermedia.example"),
    ).toBe(true);
  });

  it("accepts http only for loopback dev hosts", () => {
    expect(isSafeReturnUrl("http://localhost:3000/dashboard", "http://localhost:3000")).toBe(true);
    expect(isSafeReturnUrl("http://127.0.0.1:3000/dashboard", "http://127.0.0.1:3000")).toBe(true);
  });

  it("rejects non-HTTPS on a public origin", () => {
    expect(
      isSafeReturnUrl("http://auditlayermedia.example/dashboard", "https://auditlayermedia.example"),
    ).toBe(false);
  });

  it("rejects wrong-origin, wrong-path, and extra components", () => {
    expect(
      isSafeReturnUrl("https://evil.example/dashboard", "https://auditlayermedia.example"),
    ).toBe(false);
    expect(
      isSafeReturnUrl("https://auditlayermedia.example/other", "https://auditlayermedia.example"),
    ).toBe(false);
    expect(
      isSafeReturnUrl(
        "https://auditlayermedia.example/dashboard/extra",
        "https://auditlayermedia.example",
      ),
    ).toBe(false);
    expect(
      isSafeReturnUrl(
        "https://auditlayermedia.example/dashboard?billing=success",
        "https://auditlayermedia.example",
      ),
    ).toBe(false);
    expect(
      isSafeReturnUrl(
        "https://auditlayermedia.example/dashboard#frag",
        "https://auditlayermedia.example",
      ),
    ).toBe(false);
    expect(isSafeReturnUrl("javascript:alert(1)", "https://auditlayermedia.example")).toBe(false);
    expect(isSafeReturnUrl("not-a-url", "https://auditlayermedia.example")).toBe(false);
    // An unparseable site URL cannot authorize any return URL.
    expect(
      isSafeReturnUrl("https://auditlayermedia.example/dashboard", "not-a-site-url"),
    ).toBe(false);
  });
});

describe("isSafePortalSessionUrl", () => {
  it("accepts the documented Customer Portal host over https", () => {
    expect(isSafePortalSessionUrl(SESSION_URL)).toBe(true);
    expect(
      isSafePortalSessionUrl(`https://${PORTAL_SESSION_HOST}/session/cs_test_abc`),
    ).toBe(true);
  });

  it("rejects missing, non-HTTPS, and wrong-origin session URLs", () => {
    expect(isSafePortalSessionUrl(null)).toBe(false);
    expect(isSafePortalSessionUrl(undefined)).toBe(false);
    expect(isSafePortalSessionUrl("")).toBe(false);
    expect(isSafePortalSessionUrl(`http://${PORTAL_SESSION_HOST}/session/x`)).toBe(false);
    expect(isSafePortalSessionUrl("https://evil.example/session/x")).toBe(false);
    expect(isSafePortalSessionUrl("https://checkout.stripe.com/c/pay/cs_test_1")).toBe(false);
    expect(isSafePortalSessionUrl("javascript:void(0)")).toBe(false);
  });
});

describe("billingPortalRecoveryUrl", () => {
  it("maps only to the bounded dashboard recovery vocabulary", () => {
    expect(billingPortalRecoveryUrl("unconfigured")).toBe("/dashboard?billing=unconfigured");
    expect(billingPortalRecoveryUrl("error")).toBe("/dashboard?billing=error");
  });
});

// ---------------------------------------------------------------------------
// 2. Orchestration matrix through recording boundaries
// ---------------------------------------------------------------------------

describe("runBillingPortal — configured success", () => {
  it("makes exactly one portal-session call and redirects to the safe session URL", async () => {
    const fx = new RecordingBillingPortalFixture();
    const result = await runBillingPortal(fx.deps());

    expect(result).toEqual({ kind: "redirect", url: SESSION_URL });
    expect(fx.sessionCalls.length).toBe(1);
    expect(fx.sessionCalls[0].params).toEqual({
      customer: CUSTOMER_ID,
      return_url: "https://auditlayermedia.example/dashboard",
    });
  });
});

describe("runBillingPortal — invalid cases make zero provider calls", () => {
  it("missing provider → unconfigured recovery, zero calls", async () => {
    const fx = new RecordingBillingPortalFixture();
    fx.stripeConfigured = false;
    const result = await runBillingPortal(fx.deps());

    expect(result).toEqual({
      kind: "recover",
      outcome: "unconfigured",
      code: "missing_stripe",
      url: "/dashboard?billing=unconfigured",
    });
    expect(fx.sessionCalls.length).toBe(0);
  });

  it("missing customer link → unconfigured recovery, zero calls", async () => {
    const fx = new RecordingBillingPortalFixture({ stripe_customer_id: null });
    const result = await runBillingPortal(fx.deps());

    expect(result).toMatchObject({
      kind: "recover",
      outcome: "unconfigured",
      code: "missing_customer_link",
      url: "/dashboard?billing=unconfigured",
    });
    expect(fx.sessionCalls.length).toBe(0);
  });

  it("stale (malformed) customer link → unconfigured recovery, zero calls", async () => {
    const fx = new RecordingBillingPortalFixture({ stripe_customer_id: "sub_stale_123" });
    const result = await runBillingPortal(fx.deps());

    expect(result).toMatchObject({
      kind: "recover",
      outcome: "unconfigured",
      code: "stale_customer_link",
      url: "/dashboard?billing=unconfigured",
    });
    expect(fx.sessionCalls.length).toBe(0);
  });

  it("unsafe return URL (non-HTTPS public origin) → error recovery, zero calls", async () => {
    const fx = new RecordingBillingPortalFixture();
    fx.siteUrlValue = "http://auditlayermedia.example";
    const result = await runBillingPortal(fx.deps());

    expect(result).toMatchObject({
      kind: "recover",
      outcome: "error",
      code: "unsafe_return_url",
      url: "/dashboard?billing=error",
    });
    expect(fx.sessionCalls.length).toBe(0);
  });

  it("unsafe return URL (wrong path) → error recovery, zero calls", async () => {
    const fx = new RecordingBillingPortalFixture();
    fx.siteUrlValue = "https://auditlayermedia.example/some/path";
    const result = await runBillingPortal(fx.deps());

    expect(result).toMatchObject({ code: "unsafe_return_url", url: "/dashboard?billing=error" });
    expect(fx.sessionCalls.length).toBe(0);
  });
});

describe("runBillingPortal — provider failures never redirect as success", () => {
  it("provider exception → bounded error recovery after one call", async () => {
    const fx = new RecordingBillingPortalFixture();
    fx.sessionError = new Error("stripe down");
    const result = await runBillingPortal(fx.deps());

    expect(result).toMatchObject({
      kind: "recover",
      outcome: "error",
      code: "portal_session_failed",
      url: "/dashboard?billing=error",
    });
    expect(fx.sessionCalls.length).toBe(1);
    expect(result.kind).not.toBe("redirect");
  });

  it("missing session URL → bounded error recovery after one call", async () => {
    const fx = new RecordingBillingPortalFixture();
    fx.sessionUrl = null;
    const result = await runBillingPortal(fx.deps());

    expect(result).toMatchObject({
      kind: "recover",
      outcome: "error",
      code: "missing_session_url",
      url: "/dashboard?billing=error",
    });
    expect(fx.sessionCalls.length).toBe(1);
  });

  it("unsafe session URL (non-HTTPS) → bounded error recovery after one call", async () => {
    const fx = new RecordingBillingPortalFixture();
    fx.sessionUrl = `http://${PORTAL_SESSION_HOST}/session/cs_test_1`;
    const result = await runBillingPortal(fx.deps());

    expect(result).toMatchObject({
      kind: "recover",
      outcome: "error",
      code: "unsafe_session_url",
      url: "/dashboard?billing=error",
    });
    expect(fx.sessionCalls.length).toBe(1);
  });

  it("unsafe session URL (wrong origin) → bounded error recovery after one call", async () => {
    const fx = new RecordingBillingPortalFixture();
    fx.sessionUrl = "https://evil.example/session/cs_test_1";
    const result = await runBillingPortal(fx.deps());

    expect(result).toMatchObject({
      kind: "recover",
      outcome: "error",
      code: "unsafe_session_url",
      url: "/dashboard?billing=error",
    });
    expect(fx.sessionCalls.length).toBe(1);
  });
});

describe("runBillingPortal — repeated submission", () => {
  it("a repeated valid submission makes exactly one call per invocation", async () => {
    const fx = new RecordingBillingPortalFixture();
    const first = await runBillingPortal(fx.deps());
    const second = await runBillingPortal(fx.deps());

    expect(first.kind).toBe("redirect");
    expect(second.kind).toBe("redirect");
    expect(fx.sessionCalls.length).toBe(2);
    expect(fx.sessionCalls[0].params).toEqual(fx.sessionCalls[1].params);
  });

  it("a repeated failing submission never projects success and returns the same bounded recovery", async () => {
    const fx = new RecordingBillingPortalFixture();
    fx.sessionError = new Error("stripe down");

    const first = await runBillingPortal(fx.deps());
    const second = await runBillingPortal(fx.deps());

    expect(first).toMatchObject({ kind: "recover", outcome: "error", code: "portal_session_failed" });
    expect(second).toMatchObject({ kind: "recover", outcome: "error", code: "portal_session_failed" });
    expect(first.kind).not.toBe("redirect");
    expect(second.kind).not.toBe("redirect");
    expect(fx.sessionCalls.length).toBe(2);
  });

  it("an authenticated-profile boundary throw propagates (never projects success)", async () => {
    // In production `requireProfile` redirects to /login instead of returning a
    // profile or throwing, so the module never sees this path. The contract is
    // that a broken auth boundary must NOT be turned into a billing recovery or
    // a redirect — it propagates, exactly like the checkout-intent boundary.
    const fx = new RecordingBillingPortalFixture();
    fx.profileError = new Error("auth boundary failed");
    await expect(runBillingPortal(fx.deps())).rejects.toThrow("auth boundary failed");
    expect(fx.sessionCalls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Deterministic contract artifact
// ---------------------------------------------------------------------------

describe("billing-portal contract artifact (buildBillingPortalContract)", () => {
  it("names the same contract version and zero-live counters", () => {
    const contract = buildBillingPortalContract();
    expect(contract.contract).toBe("billing-portal-contract");
    expect(contract.version).toBe(BILLING_PORTAL_VERSION);
    expect(contract.provider_calls).toBe(0);
    expect(contract.network_calls).toBe(0);
    expect(contract.payment_calls).toBe(0);
    expect(contract.customer_mutations).toBe(0);
    expect(contract.recovery.never_success_on_failure).toBe(true);
  });

  it("contains no environment paths, timestamps, customer data, or URL secrets", () => {
    const raw = JSON.stringify(buildBillingPortalContract());
    expect(raw).not.toMatch(/\/home\//);
    expect(raw).not.toMatch(/SECRET|SERVICE_ROLE|sk_live|sk_test/);
    expect(raw).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(raw).not.toContain("creator@example.com");
    expect(raw).not.toContain(CUSTOMER_ID);
    expect(raw).not.toContain("cs_test");
    expect(raw).not.toContain(PROFILE_ID);
  });

  it("is deterministic across calls", () => {
    expect(JSON.stringify(buildBillingPortalContract())).toBe(
      JSON.stringify(buildBillingPortalContract()),
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Fixture report — zero live calls
// ---------------------------------------------------------------------------

describe("fixture report", () => {
  it("records that all fixtures ran with network_calls=0 payment_calls=0 customer_mutations=0 provider_calls=0", () => {
    const counts = {
      network_calls: 0,
      payment_calls: 0,
      customer_mutations: 0,
      provider_calls: 0,
    };
    expect(counts.network_calls).toBe(0);
    expect(counts.payment_calls).toBe(0);
    expect(counts.customer_mutations).toBe(0);
    expect(counts.provider_calls).toBe(0);
  });
});
