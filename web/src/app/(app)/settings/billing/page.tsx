import React from "react";
import { requireProfile } from "@/lib/auth";
import { WorkspaceBilling } from "@/lib/workspace/billing-view";
export default async function BillingPage() {
  await requireProfile();
  return <main className="alm-shell max-w-3xl py-8"><h1 className="text-2xl font-semibold">Billing and model availability</h1><WorkspaceBilling /></main>;
}
