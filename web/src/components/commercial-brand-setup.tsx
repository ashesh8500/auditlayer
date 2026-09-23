"use client";

import React, {useRef, useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {Button} from "@/components/ui/button";
import {setupCommercialBrand} from "@/lib/actions/commercial-setup";

export function CommercialBrandSetup() {
  const router = useRouter();
  const requestId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <form className="alm-panel space-y-5 p-5" onSubmit={async event => {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    if (data.get("confirmed") !== "on" || data.get("managed") !== "on") {
      setError("Confirm the brief and that you manage this channel before continuing.");
      return;
    }
    requestId.current ??= crypto.randomUUID();
    setBusy(true); setError("");
    try {
      const result = await setupCommercialBrand({
        request_id: requestId.current,
        name: data.get("name"), subject_type: data.get("subject_type"),
        platform: data.get("platform"), locator: data.get("locator"),
        identity: data.get("identity"), audience: data.get("audience"), goal: data.get("goal"),
        confirmed: true, managed: true,
      });
      if (!result.ok) { setError(result.error); return; }
      router.push(`/commercial?channel=${encodeURIComponent(result.channel_id)}`);
      router.refresh();
    } catch {
      setError("Setup could not be confirmed. Retry the same setup.");
    } finally { setBusy(false); }
  }}>
    <p>No report is queued and no gifts or credits are used during setup. You will review a quote and accept its maximum before requesting a report.</p>
    <fieldset disabled={busy} className="space-y-4">
      <legend className="text-lg font-semibold">Brand and Channel</legend>
      <label className="block">Brand name<input className="alm-focus mt-1 block min-h-11 w-full rounded border border-border bg-background p-2" name="name" required maxLength={120}/></label>
      <label className="block">Subject type<select className="alm-focus mt-1 block min-h-11 w-full rounded border border-border bg-background p-2" name="subject_type" defaultValue="brand">
        <option value="brand">Brand</option><option value="creator">Creator</option><option value="person">Person</option><option value="organization">Organization</option><option value="project">Project</option>
      </select></label>
      <label className="block">Platform<select className="alm-focus mt-1 block min-h-11 w-full rounded border border-border bg-background p-2" name="platform" defaultValue="instagram">
        <option value="instagram">Instagram</option><option value="youtube">YouTube</option><option value="tiktok">TikTok</option><option value="x">X</option><option value="linkedin">LinkedIn</option><option value="website">Website</option>
      </select></label>
      <label className="block">Handle or website<input className="alm-focus mt-1 block min-h-11 w-full rounded border border-border bg-background p-2" name="locator" required maxLength={200} aria-describedby="locator-help"/></label>
      <p id="locator-help" className="text-sm text-muted-foreground">For social channels, enter the handle, not a profile or post URL. For websites, enter the public website address.</p>
      <label className="flex items-start gap-3"><input className="min-h-11 min-w-11 shrink-0" name="managed" type="checkbox" required/>I manage this channel. This does not connect an OAuth account.</label>
      <h2 className="text-lg font-semibold">Living Brief</h2>
      <label className="block">Who you are<textarea className="alm-focus mt-1 block min-h-11 w-full rounded border border-border bg-background p-2" name="identity" required minLength={8} maxLength={2000}/></label>
      <label className="block">Who you serve<textarea className="alm-focus mt-1 block min-h-11 w-full rounded border border-border bg-background p-2" name="audience" required maxLength={2000}/></label>
      <label className="block">Goal<input className="alm-focus mt-1 block min-h-11 w-full rounded border border-border bg-background p-2" name="goal" required maxLength={200}/></label>
      <label className="flex items-start gap-3"><input className="min-h-11 min-w-11 shrink-0" name="confirmed" type="checkbox" required/>I confirm this brief is accurate and can be used as context for my reports.</label>
      <Button size="lg" className="max-w-full whitespace-normal" disabled={busy} type="submit">{busy ? "Saving…" : "Save Brand and Continue to Quote"}</Button>
    </fieldset>
    {error && <p role="alert">{error}</p>}
    <p><Link href="/subjects" className="alm-focus inline-flex min-h-11 items-center underline">Review Existing Brands</Link> · <Link href="/commercial" className="alm-focus inline-flex min-h-11 items-center underline">Back to Credits and Reports</Link></p>
  </form>;
}
