import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe";
import {
  reduceStripeSubscriptionEvent,
  type StripeReconciliationCommand,
  type StripeReconciliationResult,
  type StripeSubscriptionSnapshot,
} from "@/lib/stripe-reconciliation";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";

/**
 * Stripe webhook. Verifies the signature against the raw body, reduces each
 * supported event to one typed commercial command, and submits it to the
 * service-role-only atomic RPC `reconcile_stripe_subscription` — the ONLY
 * path allowed to mutate `profiles` plan/subscription/Stripe columns. The
 * browser cannot; a direct profile update no longer exists here.
 *
 * Idempotency, ordering, manual-access precedence, and atomicity live in the
 * RPC. Every invalid/duplicate/stale/unknown path returns bounded correction
 * data and performs zero profile mutations. No raw Stripe/customer payload is
 * ever logged or stored.
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
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const result = reduceStripeSubscriptionEvent({
          eventId: event.id,
          eventType: event.type,
          eventCreated: event.created,
          subscription: subscriptionSnapshot(
            subscription,
            subscription.metadata?.profile_id ?? null,
          ),
        });
        return await reconcileResult(result);
      }
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (!subscriptionId) {
          return NextResponse.json({
            received: true,
            outcome: { applied: false, code: "no_subscription" },
          });
        }
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const result = reduceStripeSubscriptionEvent({
          eventId: event.id,
          eventType: event.type,
          eventCreated: event.created,
          subscription: subscriptionSnapshot(
            subscription,
            session.client_reference_id ??
              subscription.metadata?.profile_id ??
              null,
          ),
        });
        return await reconcileResult(result);
      }
      default: {
        return NextResponse.json({
          received: true,
          outcome: {
            applied: false,
            code: "unsupported_event_type",
            eventType: event.type,
          },
        });
      }
    }
  } catch (err) {
    // Bounded handler error — never echo the raw payload or customer data.
    const message = err instanceof Error ? err.message : "handler_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function subscriptionSnapshot(
  subscription: Stripe.Subscription,
  profileId: string | null | undefined,
): StripeSubscriptionSnapshot {
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.id;
  // current_period_end lives on the subscription item in recent API versions.
  const periodEndUnix =
    (item as { current_period_end?: number } | undefined)
      ?.current_period_end ??
    (subscription as unknown as { current_period_end?: number })
      .current_period_end;
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;
  return {
    id: subscription.id,
    customerId: customerId ?? "",
    status: subscription.status,
    priceId: priceId ?? null,
    currentPeriodEndEpoch: periodEndUnix ?? null,
    profileId: profileId ?? null,
  };
}

async function reconcileResult(
  result: StripeReconciliationResult,
): Promise<NextResponse> {
  if (result.kind === "correction") {
    // Reducer-level rejection: no RPC call, zero mutations, bounded data.
    return NextResponse.json({
      received: true,
      outcome: {
        applied: false,
        code: result.code,
        message: result.message,
      },
    });
  }
  return applyCommand(result.command);
}

async function applyCommand(
  command: StripeReconciliationCommand,
): Promise<NextResponse> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("reconcile_stripe_subscription", {
    p_event_id: command.eventId,
    p_event_type: command.eventType,
    p_event_created: command.eventCreated,
    p_subscription_id: command.subscriptionId,
    p_customer_id: command.customerId,
    p_profile_id: command.profileId,
    p_status: command.status,
    p_plan: command.plan,
    p_current_period_end_epoch: command.currentPeriodEndEpoch,
    p_digest: command.digest,
  });

  if (error) {
    return NextResponse.json(
      { error: "reconciliation_failed", code: error.code ?? "persistence_failed" },
      { status: 500 },
    );
  }

  const outcome = data as {
    applied: boolean;
    code: string;
    profile_id?: string | null;
    plan?: string | null;
    status?: string | null;
  } | null;

  return NextResponse.json({
    received: true,
    outcome: outcome ?? { applied: false, code: "missing_result" },
  });
}
