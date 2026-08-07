/**
 * Canonical self-serve price table (USD/month).
 *
 * This module is the single source of truth for the two self-serve plan
 * prices. It is intentionally dependency-free (no `server-only`) so that the
 * offer contract and its parity tests can import it directly:
 *
 * - `stripe.ts` re-exports `PLAN_PRICES`, `priceIdForPlan`, and
 *   `planForPriceId` so the checkout server action and the Stripe webhook
 *   keep using the same table.
 * - `offer-contract.ts` consumes `PLAN_PRICES` so rendered landing copy can
 *   never drift from what Stripe charges.
 *
 * Enterprise is contact-sales and has no self-serve price. The Blueprint is a
 * one-time offer purchased through the support flow, not a Stripe
 * subscription.
 */

import type { Plan } from "@/lib/domain";

/** Self-serve purchasable plans (Enterprise is contact-sales). */
export type PurchasablePlan = Extract<Plan, "starter" | "pro">;

export const PLAN_PRICES: { plan: PurchasablePlan; amount: number }[] = [
  { plan: "starter", amount: 30 },
  { plan: "pro", amount: 50 },
];

/** Resolve the configured Stripe price id for a purchasable plan. */
export function priceIdForPlan(plan: PurchasablePlan): string | undefined {
  switch (plan) {
    case "starter":
      return process.env.STRIPE_PRICE_STARTER;
    case "pro":
      return process.env.STRIPE_PRICE_PRO;
  }
}

/** Reverse-map a Stripe price id back to our plan enum (for webhooks). */
export function planForPriceId(priceId: string | null | undefined): Plan {
  if (!priceId) return "free";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  if (priceId === process.env.STRIPE_PRICE_STARTER) return "starter";
  return "free";
}
