"use client";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceResources } from "@/components/workspace-resources";
import { fencedJson, metadataOptions, resourceKey } from "@/lib/resources/workspace";
import { type Wallet, validate } from "@/lib/workspace-contracts";
import { parseCommercialWallet, type CommercialWallet } from "@/lib/commercial-wallet";
import { modelCatalog } from "./catalog";
import { CommercialOffers } from "@/components/commercial-offers";

export function WorkspaceOffer() { return <CommercialOffers />; }
export function ModelAvailability() {
  return <section aria-label="Model availability"><h2 className="text-xl font-semibold">Model candidates</h2>
    <p>No model is qualified for workspace credit execution yet. Existing report generation remains under its existing contract.</p>
    <ul className="mt-3 space-y-3">{modelCatalog.map(option=><li key={option.id} className="rounded-lg border p-4">
      <strong>{option.id}</strong> — Unavailable
      <p>{option.unavailable_reason}</p><p className="break-all">Data destination: {option.pin.data_route}</p>
      <p>Version: {option.pin.model_version}. No tools authorized. No rate card available.</p>
    </li>)}</ul></section>;
}
const usd=(n:number)=>`$${(BigInt(n)/BigInt(1000000)).toString()}.${((BigInt(n)%BigInt(1000000))/BigInt(10000)).toString().padStart(2,"0")}`;
export function WorkspaceBilling() {
  const scope=useWorkspaceResources();
  if (!scope) throw new Error("Workspace resource provider missing");
  const query=useQuery({ ...metadataOptions,
    queryKey:resourceKey(scope.ownerId,"wallet","workspace.v1"),
    queryFn:async({signal})=>{
      const result=await fencedJson<{ownerId:string;fetchedAt:string;wallet:Wallet|CommercialWallet|null}>("/api/resources/wallet",scope.ownerId,signal);
      if(result.wallet) result.wallet="pricing_version" in result.wallet ? parseCommercialWallet(result.wallet) : validate("Wallet",result.wallet);
      return result;
    },
  });
  const wallet=query.data?.wallet;
  return <div className="space-y-6"><WorkspaceOffer />
    <section aria-label="Credit wallet"><h2 className="text-xl font-semibold">Credit wallet</h2>
      {query.isPending && <p role="status">Loading saved wallet…</p>}
      {query.error && <p role="alert">Wallet could not be refreshed. Your existing report access is unchanged.</p>}
      {query.data && !wallet && <p>No workspace credit contract. Continue using your existing report access.</p>}
      {wallet && <>{"pricing_version" in wallet && <p>Balance: {(wallet.balance.microusd/10000).toLocaleString("en-US")} credits; reserved: {(wallet.reserved.microusd/10000).toLocaleString("en-US")} credits; available: {((wallet.balance.microusd-wallet.reserved.microusd)/10000).toLocaleString("en-US")} credits. <a href="/commercial" className="alm-focus inline-flex min-h-11 items-center underline">Open Credits and Reports</a></p>}<p>Saved balance: {usd(wallet.balance.microusd)}; reserved: {usd(wallet.reserved.microusd)}.</p>
        <p>Available usage value: {usd(wallet.balance.microusd-wallet.reserved.microusd)}. Admission rechecks expiry and limits.</p>
        {"pricing_version" in wallet ? <p>{wallet.period_source === "calendar_month_utc" ? "Free allowance period (UTC calendar month)" : "Confirmed Stripe billing period"}: {wallet.period_start} to {wallet.period_end}. Pricing: {wallet.pricing_version}.</p> : <p>Last confirmed billing period: {wallet.stripe_period_start} to {wallet.stripe_period_end}.</p>}
        <ul>{wallet.lots.map(lot=><li key={lot.id}>{lot.kind}: {usd(lot.balance.microusd)} remaining{lot.expires_at ? `; expires ${lot.expires_at}` : "; no expiry recorded"}</li>)}</ul></>}
      <button className="alm-focus min-h-11 underline" disabled={query.isFetching} onClick={()=>void query.refetch({cancelRefetch:false})}>Refresh wallet</button>
    </section>{query.data && (!wallet || !("pricing_version" in wallet)) && <ModelAvailability />}</div>;
}
