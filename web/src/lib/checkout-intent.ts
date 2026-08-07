/**
 * Canonical checkout-intent contract (ALM-I-022 — P11/P12 · C14/C15 · F7/F9 ·
 * D3/D4/D8).
 *
 * Composes `authenticated profile + purchasable offer → reusable Stripe
 * customer linkage → idempotent checkout session → bounded redirect/recovery
 * state` for the self-serve checkout server action in
 * `web/src/lib/actions/billing.ts`.
 *
 * This module is intentionally dependency-light: it imports no `server-only`,
 * no Stripe SDK, no Supabase client, and no Next.js runtime, so the full
 * orchestration can be exercised deterministically through injected/recordable
 * boundaries without any live provider call.
 *
 * Idempotency keys
 * ---------------
 * `customerIdempotencyKey` and `sessionIdempotencyKey` are bounded SHA-256 hex
 * digests (fixed 64-hex length after a fixed domain prefix) derived ONLY from
 * the stable profile id, the purchasable plan, and the canonical offer-contract
 * version (`OFFER_CONTRACT_VERSION`). No email, customer secret, raw metadata,
 * wall-clock, or random input ever enters the key. The same
 * profile+plan+offer-version triple therefore deterministically yields the same
 * customer key and the same session key, so a retried or interrupted submission
 * represents at most one logical customer and one logical checkout session at
 * the Stripe adapter boundary.
 *
 * Authority split
 * ---------------
 * - `offer-pricing.ts` remains authoritative for the plan→price mapping
 *   (`priceIdForPlan`); unsupported plans fail closed.
 * - `profiles` (service-role) remains authoritative for the reusable Stripe
 *   customer link; the update result is verified (affected row) BEFORE any
 *   checkout session is requested, and `profiles.plan` is never written here.
 * - W013 (`stripe-reconciliation.ts` + `reconcile_stripe_subscription`) remains
 *   authoritative for post-payment entitlement reconciliation.
 * - The dashboard `billing=` query vocabulary (success/cancelled/unconfigured/
 *   error) is the only redirect/recovery surface.
 *
 * Fixtures in the focused tests prove adapter call shape and fail-closed
 * behavior only. They do NOT prove live Stripe replay, payment success,
 * conversion, database isolation, or willingness to pay.
 */

import { createHash } from "node:crypto";

import { OFFER_CONTRACT_VERSION } from "./offer-contract";
import type { PurchasablePlan } from "./offer-pricing";

// ---------------------------------------------------------------------------
// Idempotency-key contract
// ---------------------------------------------------------------------------

/** Version of the checkout-intent key scheme (part of the hash input). */
export const CHECKOUT_INTENT_VERSION = "1.0.0";

/** Fixed domain prefix for customer-scoped idempotency keys. */
export const CHECKOUT_INTENT_KEY_PREFIX_CUSTOMER = "alm_cus_";
/** Fixed domain prefix for session-scoped idempotency keys. */
export const CHECKOUT_INTENT_KEY_PREFIX_SESSION = "alm_ses_";
/** SHA-256 hex digest length (64 chars). */
export const CHECKOUT_INTENT_KEY_HEX_LENGTH = 64;

/** The only self-serve plans a checkout session may purchase. */
export const PURCHASABLE_PLANS: readonly PurchasablePlan[] = ["starter", "pro"];

export function isPurchasablePlan(value: unknown): value is PurchasablePlan {
  return value === "starter" || value === "pro";
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Domain-separated, versioned hash input. Never contains email/secrets. */
function keyInput(
  scope: "customer" | "session",
  profileId: string,
  plan: PurchasablePlan,
  offerVersion: string,
): string {
  return `checkout-intent:${CHECKOUT_INTENT_VERSION}:${scope}:${profileId}:${plan}:${offerVersion}`;
}

/** Deterministic, non-secret Stripe idempotency key for customer creation. */
export function customerIdempotencyKey(
  profileId: string,
  plan: PurchasablePlan,
  offerVersion: string = OFFER_CONTRACT_VERSION,
): string {
  return `${CHECKOUT_INTENT_KEY_PREFIX_CUSTOMER}${sha256Hex(
    keyInput("customer", profileId, plan, offerVersion),
  )}`;
}

/** Deterministic, non-secret Stripe idempotency key for checkout-session creation. */
export function sessionIdempotencyKey(
  profileId: string,
  plan: PurchasablePlan,
  offerVersion: string = OFFER_CONTRACT_VERSION,
): string {
  return `${CHECKOUT_INTENT_KEY_PREFIX_SESSION}${sha256Hex(
    keyInput("session", profileId, plan, offerVersion),
  )}`;
}

export interface CheckoutIntentKeys {
  customerIdempotencyKey: string;
  sessionIdempotencyKey: string;
}

/** One stable key pair for a profile+plan+offer-version triple. */
export function checkoutIntentKeys(
  profileId: string,
  plan: PurchasablePlan,
  offerVersion: string = OFFER_CONTRACT_VERSION,
): CheckoutIntentKeys {
  return {
    customerIdempotencyKey: customerIdempotencyKey(profileId, plan, offerVersion),
    sessionIdempotencyKey: sessionIdempotencyKey(profileId, plan, offerVersion),
  };
}

// ---------------------------------------------------------------------------
// Recording boundary types (injected by `billing.ts` production wiring)
// ---------------------------------------------------------------------------

/** The authenticated profile fields the checkout path may use. */
export interface CheckoutProfile {
  id: string;
  email: string | null;
  stripe_customer_id: string | null;
}

/** Stripe `customers.create` params the checkout path sends. */
export interface CheckoutCustomerCreateParams {
  email?: string;
  metadata: { profile_id: string };
}

/** Stripe `checkout.sessions.create` params the checkout path sends. */
export interface CheckoutSessionParams {
  mode: "subscription";
  customer: string;
  line_items: Array<{ price: string; quantity: number }>;
  client_reference_id: string;
  metadata: { profile_id: string; plan: string };
  subscription_data: { metadata: { profile_id: string; plan: string } };
  success_url: string;
  cancel_url: string;
  allow_promotion_codes: boolean;
}

/**
 * The minimal Stripe surface the checkout path touches. Structurally satisfied
 * by the real `Stripe` instance (both `create` methods accept a
 * `RequestOptions`-shaped `{ idempotencyKey }`), so `billing.ts` passes the
 * canonical client through without any provider wrapper.
 */
export interface CheckoutStripeBoundary {
  customers: {
    create(
      params: CheckoutCustomerCreateParams,
      options: { idempotencyKey: string },
    ): Promise<{ id: string }>;
  };
  checkout: {
    sessions: {
      create(
        params: CheckoutSessionParams,
        options: { idempotencyKey: string },
      ): Promise<{ url: string | null }>;
    };
  };
}

/** Result of the service-role `profiles` link update (affected row or error). */
export interface ProfileLinkResult {
  data: { id: string } | null;
  error: { message: string } | null;
}

/** Injected boundaries the orchestration uses (recordable in tests). */
export interface CheckoutIntentDeps {
  getProfile(): Promise<CheckoutProfile>;
  getStripe(): CheckoutStripeBoundary | null;
  getPriceId(plan: PurchasablePlan): string | undefined;
  isSupabaseAdminConfigured(): boolean;
  linkCustomer(profileId: string, customerId: string): Promise<ProfileLinkResult>;
  siteUrl(): string;
}

// ---------------------------------------------------------------------------
// Bounded recovery vocabulary
// ---------------------------------------------------------------------------

/** Bounded recovery outcomes surfaced through the existing dashboard vocabulary. */
export type CheckoutRecoveryOutcome = "unconfigured" | "error";

/** Exact reason behind a bounded recovery (recorded in the evidence artifact). */
export type CheckoutRecoveryCode =
  | "missing_stripe"
  | "missing_price"
  | "unsupported_plan"
  | "admin_unconfigured"
  | "profile_link_failed"
  | "profile_link_no_row"
  | "customer_failed"
  | "session_failed"
  | "missing_session_url";

export type CheckoutIntentResult =
  | { kind: "redirect"; url: string }
  | {
      kind: "recover";
      outcome: CheckoutRecoveryOutcome;
      code: CheckoutRecoveryCode;
      url: string;
    };

/** The one dashboard recovery URL for an outcome (never success). */
export function checkoutRecoveryUrl(outcome: CheckoutRecoveryOutcome): string {
  return outcome === "unconfigured"
    ? "/dashboard?billing=unconfigured"
    : "/dashboard?billing=error";
}

function recovery(
  outcome: CheckoutRecoveryOutcome,
  code: CheckoutRecoveryCode,
): CheckoutIntentResult {
  return { kind: "recover", outcome, code, url: checkoutRecoveryUrl(outcome) };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Plan and execute one checkout intent.
 *
 * - Unsupported plan / missing Stripe / missing price → `unconfigured`
 *   recovery with zero provider calls.
 * - Existing customer link → reused; zero customer/link calls.
 * - First creation → exactly one customer create (customer-scoped key), one
 *   verified service-role link update, then exactly one session create
 *   (session-scoped key). Any link failure stops BEFORE session creation.
 * - Stripe failures / missing session URL → bounded `error` recovery, never a
 *   success redirect.
 * - `profiles.plan` is never written; the link update writes only
 *   `stripe_customer_id`.
 */
export async function runCheckoutIntent(
  plan: unknown,
  deps: CheckoutIntentDeps,
): Promise<CheckoutIntentResult> {
  if (!isPurchasablePlan(plan)) {
    return recovery("unconfigured", "unsupported_plan");
  }

  const profile = await deps.getProfile();
  const stripe = deps.getStripe();
  const priceId = deps.getPriceId(plan);

  if (!stripe) return recovery("unconfigured", "missing_stripe");
  if (!priceId) return recovery("unconfigured", "missing_price");

  const keys = checkoutIntentKeys(profile.id, plan);

  let customerId = profile.stripe_customer_id;
  if (!customerId) {
    // Fail early: without a service-role client we cannot persist the link, so
    // creating a provider customer would be a wasted/duplicate provider object.
    if (!deps.isSupabaseAdminConfigured()) {
      return recovery("unconfigured", "admin_unconfigured");
    }

    let customer: { id: string };
    try {
      customer = await stripe.customers.create(
        { email: profile.email ?? undefined, metadata: { profile_id: profile.id } },
        { idempotencyKey: keys.customerIdempotencyKey },
      );
    } catch {
      return recovery("error", "customer_failed");
    }
    customerId = customer.id;

    let link: ProfileLinkResult;
    try {
      link = await deps.linkCustomer(profile.id, customerId);
    } catch {
      return recovery("error", "profile_link_failed");
    }
    if (link.error) return recovery("error", "profile_link_failed");
    if (!link.data) return recovery("error", "profile_link_no_row");
  }

  let session: { url: string | null };
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        client_reference_id: profile.id,
        metadata: { profile_id: profile.id, plan },
        subscription_data: { metadata: { profile_id: profile.id, plan } },
        success_url: `${deps.siteUrl()}/dashboard?billing=success`,
        cancel_url: `${deps.siteUrl()}/dashboard?billing=cancelled`,
        allow_promotion_codes: true,
      },
      { idempotencyKey: keys.sessionIdempotencyKey },
    );
  } catch {
    return recovery("error", "session_failed");
  }

  if (!session.url) return recovery("error", "missing_session_url");

  return { kind: "redirect", url: session.url };
}
