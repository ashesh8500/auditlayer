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

/**
 * Start a Stripe Checkout session for a self-serve plan upgrade. Plan/billing
 * columns on `profiles` are NEVER written from the browser — only the webhook
 * (service-role) reconciles them. Here we only persist `stripe_customer_id`
 * via the service-role client so the webhook can map events back to the user.
 */
export async function startCheckout(plan: PurchasablePlan): Promise<void> {
  const profile = await requireProfile();
  const stripe = getStripe();
  const priceId = priceIdForPlan(plan);

  if (!stripe || !priceId) {
    redirect("/dashboard?billing=unconfigured");
  }

  let customerId = profile.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email ?? undefined,
      metadata: { profile_id: profile.id },
    });
    customerId = customer.id;
    if (isSupabaseAdminConfigured()) {
      await createAdminClient()
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", profile.id);
    }
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: profile.id,
    metadata: { profile_id: profile.id, plan },
    subscription_data: { metadata: { profile_id: profile.id, plan } },
    success_url: `${siteUrl()}/dashboard?billing=success`,
    cancel_url: `${siteUrl()}/dashboard?billing=cancelled`,
    allow_promotion_codes: true,
  });

  if (!session.url) redirect("/dashboard?billing=error");
  redirect(session.url);
}

/** Form-action wrappers (avoid `.bind` typing friction in server components). */
export async function startStarterCheckout(): Promise<void> {
  await startCheckout("starter");
}

export async function startProCheckout(): Promise<void> {
  await startCheckout("pro");
}

/** Open the Stripe Customer Portal for managing an existing subscription. */
export async function openBillingPortal(): Promise<void> {
  const profile = await requireProfile();
  const stripe = getStripe();

  if (!stripe || !profile.stripe_customer_id) {
    redirect("/dashboard?billing=unconfigured");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${siteUrl()}/dashboard`,
  });

  redirect(session.url);
}
