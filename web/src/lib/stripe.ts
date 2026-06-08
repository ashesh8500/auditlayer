import "server-only";

import Stripe from "stripe";

import type { Plan } from "@/lib/domain";

/**
 * Lazily-constructed Stripe client. Never instantiated at module load so the
 * app builds without `STRIPE_SECRET_KEY`. Call sites must handle `null`.
 */
let cached: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!cached) {
    cached = new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
  }
  return cached;
}

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
