import React from "react";
import { getProfile } from "@/lib/auth";
import { PLAN_OFFERS, renderablePromises } from "@/lib/offer-contract";
import { openBillingPortal } from "@/lib/actions/billing";
import { checkoutPlan } from "./actions";
import { WorkspaceOffer } from "@/lib/workspace/billing-view";

export const metadata = { title: "Plans — AuditLayerMedia" };

export default async function PricingPage({ searchParams }: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan } = await searchParams;
  const profile = await getProfile();
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-8">
      <a href={profile ? "/dashboard" : "/"} className="alm-focus inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline">← {profile ? "Dashboard" : "AuditLayerMedia"}</a>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">Choose your plan</h1>
      <p className="mt-3 text-sm text-muted-foreground">Standard reports with Starter. Extended reports with Pro.</p>
      <WorkspaceOffer />
      <a href="/settings/billing" className="alm-focus inline-flex min-h-11 items-center underline">Wallet and model availability</a>
      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {(["starter", "pro"] as const).map(key => {
          const offer = PLAN_OFFERS[key];
          return <section key={key} aria-label={offer.name} className={`min-w-0 rounded-[var(--radius)] border bg-card p-6 ${plan === key ? "border-[color:var(--accent)]" : "border-border"}`}>
            <h2 className="text-xl font-semibold">{offer.name}</h2>
            <p className="mt-3 text-3xl font-semibold">{offer.price.display}<span className="text-sm font-normal text-muted-foreground"> {offer.price.cadenceLabel}</span></p>
            {renderablePromises(offer).length > 0 && <ul className="my-6 space-y-2 text-sm">{renderablePromises(offer).map(promise => <li key={promise.id}>{promise.label}</li>)}</ul>}
            {profile ? <form action={checkoutPlan.bind(null, key)}><button type="submit" className="alm-focus min-h-11 w-full rounded-lg bg-[color:var(--accent)] px-4 py-3 text-sm font-semibold text-white">Continue with {offer.name}</button></form> : <a href={`/login?next=${encodeURIComponent(`/pricing?plan=${key}`)}`} className="alm-focus min-h-11 block rounded-lg bg-[color:var(--accent)] px-4 py-3 text-center text-sm font-semibold text-white">Sign In for {offer.name}</a>}
          </section>;
        })}
      </div>
      {profile?.stripe_customer_id && <form action={openBillingPortal} className="mt-6"><button type="submit" className="alm-focus min-h-11 text-sm underline">Manage Existing Subscription</button></form>}
      <a href="/enterprise" className="alm-focus mt-6 inline-flex min-h-11 items-center text-sm underline">Talk to Us About Enterprise</a>
    </main>
  );
}
