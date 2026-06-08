import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { getStripe, planForPriceId } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";
import type { Plan } from "@/lib/domain";

/**
 * Stripe webhook. Verifies the signature against the raw body and reconciles
 * `profiles` plan/subscription/Stripe columns via the SERVICE-ROLE client.
 * This is the ONLY path allowed to mutate those columns — the browser cannot.
 */
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret || !isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid";
    return NextResponse.json(
      { error: `signature_verification_failed: ${message}` },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (subscriptionId) {
          const subscription =
            await stripe.subscriptions.retrieve(subscriptionId);
          await applySubscription(subscription, session.client_reference_id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await applySubscription(event.data.object);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "handler_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function applySubscription(
  subscription: Stripe.Subscription,
  profileIdHint?: string | null,
): Promise<void> {
  const admin = createAdminClient();

  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.id;
  const plan: Plan =
    subscription.status === "canceled"
      ? "free"
      : planForPriceId(priceId ?? null);

  // current_period_end lives on the subscription item in recent API versions.
  const periodEndUnix =
    (item as { current_period_end?: number } | undefined)
      ?.current_period_end ??
    (subscription as unknown as { current_period_end?: number })
      .current_period_end;
  const currentPeriodEnd = periodEndUnix
    ? new Date(periodEndUnix * 1000).toISOString()
    : null;

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const profileId =
    subscription.metadata?.profile_id ?? profileIdHint ?? undefined;

  const update = {
    plan,
    subscription_status: subscription.status,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    current_period_end: currentPeriodEnd,
    onboarding_status:
      subscription.status === "active" || subscription.status === "trialing"
        ? "paid"
        : subscription.status,
  };

  // Prefer matching by the known profile id; fall back to the Stripe customer.
  if (profileId) {
    await admin.from("profiles").update(update).eq("id", profileId);
  } else {
    await admin
      .from("profiles")
      .update(update)
      .eq("stripe_customer_id", customerId);
  }
}
