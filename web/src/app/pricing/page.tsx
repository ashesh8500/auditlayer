import React from "react";
import { getProfile } from "@/lib/auth";
import { openBillingPortal } from "@/lib/actions/billing";
import { CommercialOffers } from "@/components/commercial-offers";

export const metadata = { title: "Plans — AuditLayerMedia" };

export default async function PricingPage(_props: { searchParams: Promise<{ plan?: string }> }) {
  const profile = await getProfile();
  return <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-8">
    <a href={profile ? "/dashboard" : "/"} className="alm-focus inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline">← {profile ? "Dashboard" : "AuditLayerMedia"}</a>
    <h1 className="mt-8 text-3xl font-semibold tracking-tight">Choose your plan</h1>
    <CommercialOffers />
    <a href="/settings/billing" className="alm-focus inline-flex min-h-11 items-center underline">Wallet and model availability</a>
    {profile?.stripe_customer_id && <form action={openBillingPortal} className="mt-6"><button type="submit" className="alm-focus min-h-11 text-sm underline">Manage Existing Subscription</button></form>}
  </main>;
}
