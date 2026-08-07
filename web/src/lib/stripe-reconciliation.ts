/**
 * Canonical Stripe subscription reconciliation reducer (ALM-I-020).
 *
 * Reduces a normalized Stripe subscription event into exactly one typed
 * commercial command — or a bounded correction — that the webhook adapter then
 * submits to the single service-role-only SQL RPC
 * `reconcile_stripe_subscription`. This module is intentionally pure and
 * dependency-light: no Stripe SDK, no Supabase client, no network, no secrets
 * beyond the supported price mapping owned by `offer-pricing.ts`.
 *
 * Authority split:
 *   - Stripe is authoritative for provider facts (event identity, status,
 *     price, customer/subscription linkage, timestamps);
 *   - `offer-pricing.ts` is authoritative for the supported price→plan map;
 *   - `reconcile_stripe_subscription` (SQL) is authoritative for idempotency,
 *     ordering, profile locking, manual-access precedence, and persistence;
 *   - `profiles` remains authoritative for the current entitlement projection.
 *
 * A valid supported event reduces to one command; every failure shape
 * (unknown price, unsupported status/type, malformed identity/period) becomes
 * a bounded correction and NEVER a mutation. An unknown price is never `free`.
 */

import { createHash } from "node:crypto";

import type { Plan } from "@/lib/domain";
import { planForPriceId } from "@/lib/offer-pricing";

/** Stripe event types the adapter reduces into commands. */
export const SUPPORTED_STRIPE_EVENT_TYPES = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;
export type SupportedStripeEventType =
  (typeof SUPPORTED_STRIPE_EVENT_TYPES)[number];

/** Subscription statuses that produce a deterministic command. */
export const MUTATION_SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "canceled",
] as const;
export type MutationSubscriptionStatus =
  (typeof MUTATION_SUBSCRIPTION_STATUSES)[number];

/** The typed commercial transition the RPC applies at most once. */
export type StripeReconciliationCommandType = "plan_grant" | "plan_revoke";

export interface StripeReconciliationCommand {
  eventId: string;
  eventType: SupportedStripeEventType;
  eventCreated: number;
  subscriptionId: string;
  customerId: string;
  profileId: string | null;
  status: MutationSubscriptionStatus;
  /** `free` only for a canceled/revoked subscription; else starter|pro. */
  plan: Plan;
  commandType: StripeReconciliationCommandType;
  currentPeriodEndEpoch: number | null;
  /** sha256 hex over the typed command — bounded audit evidence. */
  digest: string;
}

export type StripeReconciliationCorrectionCode =
  | "unsupported_event_type"
  | "unsupported_status"
  | "unknown_price"
  | "malformed_subscription"
  | "malformed_period";

export interface StripeReconciliationCorrection {
  kind: "correction";
  code: StripeReconciliationCorrectionCode;
  message: string;
  eventId: string | null;
  eventType: string | null;
  eventCreated: number | null;
}

export type StripeReconciliationResult =
  | { kind: "command"; command: StripeReconciliationCommand }
  | StripeReconciliationCorrection;

/** Plain snapshot of the Stripe subscription facts the reducer needs. */
export interface StripeSubscriptionSnapshot {
  id: string;
  customerId: string;
  status: string;
  priceId: string | null | undefined;
  currentPeriodEndEpoch: number | null | undefined;
  profileId: string | null | undefined;
}

export interface NormalizedStripeSubscriptionEvent {
  eventId: string;
  eventType: string;
  eventCreated: number;
  subscription: StripeSubscriptionSnapshot;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function correction(
  eventId: string | null,
  eventType: string | null,
  eventCreated: number | null,
  code: StripeReconciliationCorrectionCode,
  message: string,
): StripeReconciliationCorrection {
  return { kind: "correction", code, message, eventId, eventType, eventCreated };
}

function isSupportedEventType(type: string): type is SupportedStripeEventType {
  return (SUPPORTED_STRIPE_EVENT_TYPES as readonly string[]).includes(type);
}

function isMutationStatus(status: string): status is MutationSubscriptionStatus {
  return (MUTATION_SUBSCRIPTION_STATUSES as readonly string[]).includes(status);
}

function commandDigest(fields: {
  eventId: string;
  eventType: string;
  eventCreated: number;
  subscriptionId: string;
  customerId: string;
  profileId: string | null;
  status: string;
  plan: Plan;
  commandType: StripeReconciliationCommandType;
  currentPeriodEndEpoch: number | null;
}): string {
  const canonical = [
    fields.eventId,
    fields.eventType,
    String(fields.eventCreated),
    fields.subscriptionId,
    fields.customerId,
    fields.profileId ?? "",
    fields.status,
    fields.plan,
    fields.commandType,
    fields.currentPeriodEndEpoch == null
      ? ""
      : String(fields.currentPeriodEndEpoch),
  ].join("|");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Reduce a normalized Stripe subscription event to one typed command or a
 * bounded correction. Deterministic for identical input; never mutates.
 */
export function reduceStripeSubscriptionEvent(
  event: NormalizedStripeSubscriptionEvent,
): StripeReconciliationResult {
  const { eventId, eventType, eventCreated, subscription } = event;

  if (!isSupportedEventType(eventType)) {
    return correction(
      eventId,
      eventType,
      eventCreated,
      "unsupported_event_type",
      `Unsupported Stripe event type: ${eventType}.`,
    );
  }
  if (!eventId || !Number.isFinite(eventCreated) || eventCreated <= 0) {
    return correction(
      eventId,
      eventType,
      eventCreated,
      "malformed_subscription",
      "Stripe event identity or created time is missing or malformed.",
    );
  }
  if (!subscription?.id || !subscription.customerId) {
    return correction(
      eventId,
      eventType,
      eventCreated,
      "malformed_subscription",
      "Subscription or customer identity is missing.",
    );
  }
  if (subscription.profileId != null && !UUID_RE.test(subscription.profileId)) {
    return correction(
      eventId,
      eventType,
      eventCreated,
      "malformed_subscription",
      "Profile id hint is not a valid uuid.",
    );
  }
  if (!isMutationStatus(subscription.status)) {
    return correction(
      eventId,
      eventType,
      eventCreated,
      "unsupported_status",
      `Unsupported subscription status: ${subscription.status}.`,
    );
  }

  const status = subscription.status;
  const profileId = subscription.profileId ? subscription.profileId : null;

  let plan: Plan;
  let commandType: StripeReconciliationCommandType;
  if (status === "canceled") {
    plan = "free";
    commandType = "plan_revoke";
  } else {
    const mapped = planForPriceId(subscription.priceId);
    if (mapped === null) {
      return correction(
        eventId,
        eventType,
        eventCreated,
        "unknown_price",
        "Price id is absent or not mapped to a supported plan; refusing to downgrade to free.",
      );
    }
    plan = mapped;
    commandType = "plan_grant";
    if (
      subscription.currentPeriodEndEpoch == null ||
      !Number.isFinite(subscription.currentPeriodEndEpoch)
    ) {
      return correction(
        eventId,
        eventType,
        eventCreated,
        "malformed_period",
        "Active/trialing subscription is missing current_period_end.",
      );
    }
  }

  const currentPeriodEndEpoch = subscription.currentPeriodEndEpoch ?? null;
  const command: StripeReconciliationCommand = {
    eventId,
    eventType,
    eventCreated,
    subscriptionId: subscription.id,
    customerId: subscription.customerId,
    profileId,
    status,
    plan,
    commandType,
    currentPeriodEndEpoch,
    digest: commandDigest({
      eventId,
      eventType,
      eventCreated,
      subscriptionId: subscription.id,
      customerId: subscription.customerId,
      profileId,
      status,
      plan,
      commandType,
      currentPeriodEndEpoch,
    }),
  };
  return { kind: "command", command };
}
