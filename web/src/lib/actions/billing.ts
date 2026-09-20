"use server";

import { redirect } from "next/navigation";

import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getStripe,
  priceIdForPlan,
  type PurchasablePlan,
} from "@/lib/stripe";
import { isSupabaseAdminConfigured, siteUrl } from "@/lib/env";
import {
  runCheckoutIntent,
  type CheckoutIntentDeps,
  type CheckoutProfile,
  type CheckoutStripeBoundary,
  type ProfileLinkResult,
} from "@/lib/checkout-intent";
import {
  runBillingPortal,
  type BillingPortalDeps,
  type BillingPortalProfile,
  type BillingPortalStripeBoundary,
} from "@/lib/billing-portal";

/**
 * Production wiring for the canonical checkout-intent orchestration
 * (`runCheckoutIntent` in `web/src/lib/checkout-intent.ts`). The real Stripe
 * client satisfies `CheckoutStripeBoundary` structurally (both `create`
 * methods accept a `RequestOptions`-shaped `{ idempotencyKey }`), so this is a
 * pass-through of the canonical client — NOT a provider wrapper. The service-
 * role `profiles` update writes ONLY `stripe_customer_id` and is verified to
 * have affected the intended row before any checkout session is requested.
 * Plan/subscription columns are NEVER written from the browser — only the
 * webhook (service-role) reconciles them.
 */
type CheckoutRPC = {rpc(name:string,args:{p:Record<string,unknown>}):Promise<{data:unknown;error:unknown}>};
const checkoutDeps: CheckoutIntentDeps = {
  reserve: async (owner, plan) => {
    const db = createAdminClient() as unknown as CheckoutRPC;
    const result = await db.rpc("commercial_checkout_reserve", {p:{owner_id:owner,plan}});
    if (result.error || !result.data) throw new Error("checkout_admission_failed");
    return result.data as {id:string;customer_id:string|null;session_id:string|null};
  },
  bind: async (owner, intent, session) => {
    const db = createAdminClient() as unknown as CheckoutRPC;
    const result = await db.rpc("commercial_checkout_bind", {p:{owner_id:owner,id:intent,session_id:session}});
    if (result.error || result.data !== intent) throw new Error("checkout_binding_unverified");
  },
  existing: async (session) => {
    const stripe = getStripe();
    if (!stripe) throw new Error("missing_stripe");
    return stripe.checkout.sessions.retrieve(session);
  },
  getProfile: async (): Promise<CheckoutProfile> => {
    const profile = await requireProfile();
    return {
      id: profile.id,
      email: profile.email,
      stripe_customer_id: profile.stripe_customer_id,
    };
  },
  getStripe: (): CheckoutStripeBoundary | null => {
    const stripe = getStripe();
    return stripe as CheckoutStripeBoundary | null;
  },
  getPriceId: (plan) => priceIdForPlan(plan),
  isSupabaseAdminConfigured,
  linkCustomer: async (
    profileId: string,
    customerId: string,
  ): Promise<ProfileLinkResult> => {
    const { data, error } = await createAdminClient()
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", profileId)
      .select("id")
      .maybeSingle();
    return {
      data: (data as { id: string } | null) ?? null,
      error: error ? { message: error.message } : null,
    };
  },
  siteUrl,
};

/**
 * Start a Stripe Checkout session for a self-serve plan upgrade.
 *
 * One owner-wide pending checkout intent, shared with commercial enrollment,
 * supplies the hosted-session idempotency key. Bound sessions and existing
 * customer links are reused, the service-role profile-link update is verified
 * before any session is requested, and every failure returns a bounded
 * recovery redirect (never success). `profiles.plan` is never written here;
 * the webhook (service-role) reconciles entitlements after payment.
 */
export async function startCheckout(plan: PurchasablePlan): Promise<void> {
  const result = await runCheckoutIntent(plan, checkoutDeps);
  redirect(result.url);
}

/** Form-action wrappers (avoid `.bind` typing friction in server components). */
export async function startStarterCheckout(): Promise<void> {
  await startCheckout("starter");
}

export async function startProCheckout(): Promise<void> {
  await startCheckout("pro");
}

/**
 * Production wiring for the canonical billing-portal orchestration
 * (`runBillingPortal` in `web/src/lib/billing-portal.ts`). The real Stripe
 * client satisfies `BillingPortalStripeBoundary` structurally (its
 * `billingPortal.sessions.create` accepts these params and resolves a session
 * with `url`), so this is a pass-through of the canonical client — NOT a
 * provider wrapper. The portal path never writes `profiles.plan`,
 * subscription columns, or receipts; only the webhook (service-role)
 * reconciles entitlements, and Stripe stays authoritative for portal sessions
 * and subscription facts.
 */
const billingPortalDeps: BillingPortalDeps = {
  getProfile: async (): Promise<BillingPortalProfile> => {
    const profile = await requireProfile();
    return {
      id: profile.id,
      stripe_customer_id: profile.stripe_customer_id,
    };
  },
  getStripe: (): BillingPortalStripeBoundary | null => {
    const stripe = getStripe();
    return stripe as BillingPortalStripeBoundary | null;
  },
  siteUrl,
};

/** Open the Stripe Customer Portal for managing an existing subscription. */
export async function openBillingPortal(): Promise<void> {
  const result = await runBillingPortal(billingPortalDeps);
  redirect(result.url);
}
