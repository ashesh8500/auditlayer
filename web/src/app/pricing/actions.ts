"use server";

import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { startCheckout } from "@/lib/actions/billing";
import type { PurchasablePlan } from "@/lib/offer-pricing";

/** Explicit submission only; loading pricing never creates a checkout. */
export async function checkoutPlan(plan: PurchasablePlan): Promise<void> {
  if (plan !== "starter" && plan !== "pro") redirect("/pricing");
  const profile = await getProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(`/pricing?plan=${plan}`)}`);
  await startCheckout(plan);
}
