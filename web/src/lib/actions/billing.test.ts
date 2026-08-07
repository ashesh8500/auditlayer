/**
 * ALM-I-022 — static wiring contract for the checkout server action and the
 * versioned no-secret checkout evidence artifact (no browser, no DOM, no
 * network, no provider calls).
 *
 * `billing.ts` is a `"use server"` action that imports `server-only` modules,
 * so this suite follows the repository's static contract pattern
 * (see access-boundary.test.ts / recommendation-decisions.test.tsx): it reads
 * the owned source files and asserts the action delegates to the canonical
 * `runCheckoutIntent` orchestration with the production boundaries, writes
 * only `stripe_customer_id` on the service-role link (never `profiles.plan`),
 * and surfaces only the bounded dashboard recovery vocabulary. The behavioral
 * orchestration matrix lives in src/lib/checkout-intent.test.ts.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CHECKOUT_INTENT_KEY_HEX_LENGTH,
  CHECKOUT_INTENT_KEY_PREFIX_CUSTOMER,
  CHECKOUT_INTENT_KEY_PREFIX_SESSION,
  CHECKOUT_INTENT_VERSION,
  checkoutRecoveryUrl,
} from "../checkout-intent";

function source(relative: string): string {
  return readFileSync(join(process.cwd(), "src", relative), "utf8");
}

function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "supabase", "migrations"))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not locate repository root from ${process.cwd()}`);
}

const BILLING = "lib/actions/billing.ts";
const CHECKOUT_INTENT = "lib/checkout-intent.ts";

describe("billing.ts — canonical checkout wiring (static contract)", () => {
  const src = source(BILLING);

  it("delegates startCheckout to the canonical runCheckoutIntent orchestration", () => {
    expect(src).toContain('from "@/lib/checkout-intent"');
    expect(src).toContain("runCheckoutIntent");
    expect(src).toMatch(/const result = await runCheckoutIntent\(plan, checkoutDeps\)/);
    expect(src).toContain("redirect(result.url)");
  });

  it("wires the canonical production boundaries, not a provider wrapper", () => {
    expect(src).toContain("requireProfile");
    expect(src).toContain("getStripe");
    expect(src).toContain("priceIdForPlan");
    expect(src).toContain("isSupabaseAdminConfigured");
    expect(src).toContain("createAdminClient");
    expect(src).toContain("siteUrl");
    // No alternate provider or second checkout path is introduced. The file
    // legitimately keeps the canonical `openBillingPortal` (billingPortal
    // sessions) untouched, so the no-wrapper assertion is scoped to the
    // startCheckout function body only.
    const startAt = src.indexOf("export async function startCheckout");
    const wrappersAt = src.indexOf("/** Form-action wrappers");
    const checkoutSection = src.slice(startAt, wrappersAt);
    expect(checkoutSection).not.toMatch(/paymentLinks|PaymentLink|paypal|billingPortal/);
  });

  it("writes ONLY stripe_customer_id on the service-role link (never profiles.plan)", () => {
    const updateMatch = src.match(
      /\.from\("profiles"\)\s*\.update\(\{([^}]*)\}\)/,
    );
    expect(updateMatch).not.toBeNull();
    const updateBody = updateMatch?.[1] ?? "";
    expect(updateBody).toContain("stripe_customer_id");
    expect(updateBody).not.toContain("plan");
    expect(updateBody).not.toContain("subscription_status");
  });

  it("verifies the link update affected the intended row (select id + maybeSingle)", () => {
    const linkSection = src.slice(src.indexOf("linkCustomer"));
    expect(linkSection).toContain('.eq("id", profileId)');
    expect(linkSection).toContain('.select("id")');
    expect(linkSection).toContain(".maybeSingle()");
    expect(linkSection).toContain("data: (data as { id: string } | null) ?? null");
  });

  it("keeps the reusable Stripe customer link semantics in the action comment", () => {
    expect(src).toContain("stripe_customer_id");
    expect(src).toContain("NEVER written from the browser");
  });
});

describe("checkout-intent.ts — production surface contract (static)", () => {
  const src = source(CHECKOUT_INTENT);

  it("exposes the canonical key derivation and recovery vocabulary", () => {
    expect(src).toContain("export function customerIdempotencyKey");
    expect(src).toContain("export function sessionIdempotencyKey");
    expect(src).toContain("export async function runCheckoutIntent");
    expect(src).toContain("checkoutRecoveryUrl");
  });

  it("passes exact idempotency options to both Stripe create calls", () => {
    const customerCreateAt = src.indexOf("await stripe.customers.create(");
    expect(customerCreateAt).toBeGreaterThan(-1);
    const customerCreate = src.slice(customerCreateAt, customerCreateAt + 320);
    expect(customerCreate).toContain("{ idempotencyKey: keys.customerIdempotencyKey }");

    const sessionCreateAt = src.indexOf("await stripe.checkout.sessions.create(");
    expect(sessionCreateAt).toBeGreaterThan(-1);
    const sessionCreate = src.slice(sessionCreateAt, sessionCreateAt + 700);
    expect(sessionCreate).toContain("{ idempotencyKey: keys.sessionIdempotencyKey }");
  });

  it("stops before session creation on every persistence failure", () => {
    const linkCallAt = src.indexOf("await deps.linkCustomer(");
    expect(linkCallAt).toBeGreaterThan(-1);
    const afterLink = src.slice(linkCallAt, linkCallAt + 700);
    expect(afterLink).toContain('recovery("error", "profile_link_failed")');
    expect(afterLink).toContain('recovery("error", "profile_link_no_row")');
    // The actual session create call must come AFTER the link verification block.
    const sessionCallAt = src.indexOf("await stripe.checkout.sessions.create(");
    const noRowAt = src.indexOf('recovery("error", "profile_link_no_row")');
    expect(sessionCallAt).toBeGreaterThan(-1);
    expect(sessionCallAt).toBeGreaterThan(noRowAt);
  });

  it("never maps an unknown/failed path to success or free", () => {
    // Recovery outcomes map ONLY to the bounded unconfigured/error vocabulary.
    const recoveryFn = src.slice(
      src.indexOf("function recovery("),
      src.indexOf("// ---", src.indexOf("function recovery(")),
    );
    expect(recoveryFn).not.toContain("success");
    expect(recoveryFn).not.toContain("free");
    expect(src).toContain('"/dashboard?billing=unconfigured"');
    expect(src).toContain('"/dashboard?billing=error"');
    // `billing=success` appears ONLY as the Stripe post-payment return URL,
    // never as a recovery redirect produced by a failure path.
    const successOccurrences = src.match(/billing=success/g)?.length ?? 0;
    expect(successOccurrences).toBe(1);
    expect(src.indexOf("billing=success")).toBeGreaterThan(
      src.indexOf("success_url:"),
    );
  });
});

describe("checkout evidence artifact (drift guard)", () => {
  const artifactPath = join(repoRoot(), "web", "artifacts", "checkout-intent-contract.json");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as {
    contract: string;
    version: string;
    idempotency: {
      scheme_version: string;
      customer_prefix: string;
      session_prefix: string;
      key_hex_length: number;
      offer_version_source: string;
    };
    call_matrix: Record<string, string>;
    recovery: { unconfigured: string; error: string };
    network_calls: number;
    payment_calls: number;
    customer_mutations: number;
    provider_calls: number;
    no_environment_path: boolean;
    no_timestamp: boolean;
    no_customer_data: boolean;
    no_secret_values: boolean;
  };

  it("names the same contract version and key scheme as the code", () => {
    expect(artifact.contract).toBe("checkout-intent-contract");
    expect(artifact.version).toBe(CHECKOUT_INTENT_VERSION);
    expect(artifact.idempotency.scheme_version).toBe(CHECKOUT_INTENT_VERSION);
    expect(artifact.idempotency.customer_prefix).toBe(CHECKOUT_INTENT_KEY_PREFIX_CUSTOMER);
    expect(artifact.idempotency.session_prefix).toBe(CHECKOUT_INTENT_KEY_PREFIX_SESSION);
    expect(artifact.idempotency.key_hex_length).toBe(CHECKOUT_INTENT_KEY_HEX_LENGTH);
    expect(artifact.idempotency.offer_version_source).toContain("offer-contract");
  });

  it("records the same bounded recovery vocabulary as the code", () => {
    expect(artifact.recovery.unconfigured).toBe(checkoutRecoveryUrl("unconfigured"));
    expect(artifact.recovery.error).toBe(checkoutRecoveryUrl("error"));
  });

  it("reports the fixture no-live-call markers and no secret/environment leakage", () => {
    expect(artifact.network_calls).toBe(0);
    expect(artifact.payment_calls).toBe(0);
    expect(artifact.customer_mutations).toBe(0);
    expect(artifact.provider_calls).toBe(0);
    expect(artifact.no_environment_path).toBe(true);
    expect(artifact.no_timestamp).toBe(true);
    expect(artifact.no_customer_data).toBe(true);
    expect(artifact.no_secret_values).toBe(true);
  });

  it("is deterministic and scrubbed of environment paths, secrets, and payloads", () => {
    const raw = readFileSync(artifactPath, "utf8");
    expect(raw).not.toMatch(/\/home\/|SECRET|SERVICE_ROLE|sk_live|sk_test/);
    expect(raw).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(raw).not.toContain("creator@example.com");
    expect(raw).not.toContain("cus_fixture");
    expect(raw).not.toContain("cs_test");
    // Byte-deterministic across reads.
    expect(readFileSync(artifactPath, "utf8")).toBe(raw);
  });
});
