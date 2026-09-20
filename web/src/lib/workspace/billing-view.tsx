"use client";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceResources } from "@/components/workspace-resources";
import { fencedJson, metadataOptions, resourceKey } from "@/lib/resources/workspace";
import { type Wallet, validate } from "@/lib/workspace-contracts";
import { enrollment, modelCatalog } from "./catalog";

export function WorkspaceOffer() {
  return <section aria-label="Workspace credits" className="my-6 rounded-lg border p-5">
    <h2 className="text-xl font-semibold">Workspace — $129/month</h2>
    <p>One owner, one brand. 3,000 included credits ($30 usage value). 100 credits = $1 usage value, not cash.</p>
    <p className="mt-3 font-medium">Not available for enrollment</p>
    <ul>{enrollment.blockers.map(reason=><li key={reason}>{reason}</li>)}</ul>
    <p className="mt-3">Explicit $10 top-ups; no auto-reload. Maximum $70 new purchases and $100 consumption per billing cycle; maximum $15 reserved per run.</p>
    <p>Existing reports, gifts and trial access are unchanged. No report counts are converted into credits.</p>
  </section>;
}
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
      const result=await fencedJson<{ownerId:string;fetchedAt:string;wallet:Wallet|null}>("/api/resources/wallet",scope.ownerId,signal);
      if(result.wallet) result.wallet=validate("Wallet",result.wallet);
      return result;
    },
  });
  const wallet=query.data?.wallet;
  return <div className="space-y-6"><WorkspaceOffer />
    <section aria-label="Credit wallet"><h2 className="text-xl font-semibold">Credit wallet</h2>
      {query.isPending && <p role="status">Loading saved wallet…</p>}
      {query.error && <p role="alert">Wallet could not be refreshed. Your existing report access is unchanged.</p>}
      {query.data && !wallet && <p>No workspace credit contract. Continue using your existing report access.</p>}
      {wallet && <><p>Saved balance: {usd(wallet.balance.microusd)}; reserved: {usd(wallet.reserved.microusd)}.</p>
        <p>Available usage value: {usd(wallet.balance.microusd-wallet.reserved.microusd)}. Admission rechecks expiry and limits.</p>
        <p>Last confirmed billing period: {wallet.stripe_period_start} to {wallet.stripe_period_end}.</p>
        <ul>{wallet.lots.map(lot=><li key={lot.id}>{lot.kind}: {usd(lot.balance.microusd)} remaining; expires {lot.expires_at}</li>)}</ul></>}
      <button className="alm-focus min-h-11 underline" disabled={query.isFetching} onClick={()=>void query.refetch({cancelRefetch:false})}>Refresh wallet</button>
    </section><ModelAvailability /></div>;
}
