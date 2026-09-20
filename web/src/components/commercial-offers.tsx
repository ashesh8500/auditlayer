import React from "react";
import { commercial } from "@/lib/commercial";

/** Display is not enrollment authority. Keep unavailable until release gates pass. */
export function CommercialOffers() {
  return <section aria-label="Commercial plans" className="my-6 space-y-5">
    <p className="text-muted-foreground">Same evidence standards across every plan. Choose the brand capacity and usage you need.</p>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Object.entries(commercial.plans).map(([key, plan]) => <article key={key} className="alm-panel min-w-0 p-5">
        <h2 className="text-xl font-semibold">{plan.name}</h2>
        <p className="mt-4 text-3xl font-semibold">{plan.monthly_usd === null ? "Custom" : `$${plan.monthly_usd}`}<span className="text-sm font-normal">{plan.monthly_usd === null ? "" : " / month"}</span></p>
        {plan.brands !== null ? <>
          <p className="mt-4">{plan.brands} {plan.brands === 1 ? "brand" : "brands"} · One owner</p>
          <p>{plan.monthly_credits.toLocaleString("en-US")} credits / month{key === "studio" ? ", pooled" : ""}</p>
          {key === "free" && <p>Plus {commercial.welcome_credits} credits once at verified signup. No card; no paid top-ups.</p>}
          <a href="/commercial" className="alm-focus mt-4 inline-flex min-h-11 items-center underline">View Enrollment</a>
        </> : <><p className="mt-4">Scope and usage agreed individually.</p><a className="alm-focus mt-4 inline-flex min-h-11 items-center underline" href="/enterprise">Contact Us</a></>}
      </article>)}
    </div>
    <p className="text-sm">{commercial.credits_per_usd} credits = $1 metered usage value, not cash. Paid plans: ${commercial.topup_usd} for {commercial.topup_credits.toLocaleString("en-US")} credits. No auto-reload or overages. Included credits do not roll over.</p>
    <p className="text-sm text-muted-foreground">Enrollment availability is shown after sign-in. Paid top-ups remain closed until their expiry and refund terms are published. No annual plans at launch.</p>
    <p className="text-sm">Existing reports, gifts and trial access are unchanged. Existing subscriptions keep their purchased entitlements.</p>
  </section>;
}
