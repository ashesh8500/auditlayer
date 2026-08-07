import "server-only";

import Stripe from "stripe";

// Canonical price table and price-id mapping live in `offer-pricing.ts`
// (dependency-free so the offer contract and its parity tests share them).
// `stripe.ts` re-exports them so existing callers keep the same import path.
export {
  PLAN_PRICES,
  priceIdForPlan,
  planForPriceId,
} from "@/lib/offer-pricing";
export type { PurchasablePlan } from "@/lib/offer-pricing";

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
