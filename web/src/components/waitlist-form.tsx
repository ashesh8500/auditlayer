"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

import { joinWaitlist } from "@/app/waitlist/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { WaitlistState } from "@/lib/waitlist";

const initialState: WaitlistState = { status: "idle" };

const interests = [
  ["brand-strategy", "Brand strategy"],
  ["competitive-intelligence", "Competitive intelligence"],
  ["content-planning", "Content planning"],
  ["account-growth", "Account growth"],
  ["ongoing-management", "Ongoing media management"],
  ["team-enterprise", "Team or enterprise use"],
] as const;

export function WaitlistForm() {
  const [state, action, pending] = useActionState(joinWaitlist, initialState);

  if (state.status === "ok") {
    return (
      <div className="flex min-h-[31rem] flex-col justify-center border border-[color:var(--accent)]/30 bg-[color:var(--accent-muted)] p-7 sm:p-9" role="status">
        <CheckCircle2 className="size-8 text-[color:var(--accent)]" />
        <h3 className="mt-6 text-2xl font-semibold tracking-[-0.035em]">You’re on the list.</h3>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          We’ll review what you shared and reach out personally when there’s a useful fit or early-access opening.
        </p>
        <p className="mt-8 text-xs leading-5 text-muted-foreground">
          Need to add context? Email{" "}
          <a className="alm-focus inline-flex min-h-10 items-center font-medium text-foreground underline-offset-4 hover:underline" href="mailto:support@auditlayermedia.com">
            support@auditlayermedia.com
          </a>.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="alm-panel p-5 sm:p-7" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="waitlist-name">Name <span aria-hidden="true" className="text-[color:var(--accent)]">*</span></Label>
          <Input id="waitlist-name" name="name" autoComplete="name" required maxLength={120} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="waitlist-email">Work email <span aria-hidden="true" className="text-[color:var(--accent)]">*</span></Label>
          <Input id="waitlist-email" name="email" type="email" autoComplete="email" required maxLength={254} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="waitlist-organization">Company or brand</Label>
          <Input id="waitlist-organization" name="organization" autoComplete="organization" maxLength={160} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="waitlist-social">Social account</Label>
          <Input id="waitlist-social" name="socialHandle" placeholder="@handle or URL" maxLength={160} />
        </div>
      </div>

      <div className="mt-4 grid gap-1.5">
        <Label htmlFor="waitlist-interest">What are you most interested in? <span aria-hidden="true" className="text-[color:var(--accent)]">*</span></Label>
        <select id="waitlist-interest" className="alm-focus min-h-11 w-full border border-border bg-background px-3.5 py-2.5 text-sm text-foreground" name="primaryInterest" defaultValue="" required>
          <option value="" disabled>Select one</option>
          {interests.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <div className="mt-4 grid gap-1.5">
        <Label htmlFor="waitlist-notes">Anything we should know?</Label>
        <Textarea
          id="waitlist-notes"
          className="min-h-24 resize-y"
          name="notes"
          maxLength={2000}
          placeholder="Your goals, current challenge, or what you’d like help deciding."
        />
      </div>

      <div className="absolute -left-[9999px] top-auto size-px overflow-hidden" aria-hidden="true">
        <Label>
          Website
          <Input name="website" tabIndex={-1} autoComplete="off" />
        </Label>
      </div>

      <Label className="mt-5 flex items-start gap-3 text-xs font-normal leading-5 text-muted-foreground">
        <Input
          className="alm-focus mt-0.5 size-4 shrink-0 accent-[color:var(--accent)]"
          type="checkbox"
          name="marketingUpdates"
        />
        <span>Send me occasional product updates. This is optional.</span>
      </Label>

      {state.status === "error" && (
        <p className="mt-4 border border-[color:var(--red)]/25 bg-[color:var(--red-muted)] px-3 py-2 text-sm text-[color:var(--red)]" role="alert">
          {state.message}
        </p>
      )}

      <Button type="submit" size="lg" className="mt-6 min-h-11 w-full" disabled={pending}>
        {pending ? <><Loader2 className="size-4 animate-spin" /> Joining…</> : <>Join the Waitlist <ArrowRight className="size-4" /></>}
      </Button>
      <p className="mt-3 text-[0.7rem] leading-5 text-muted-foreground">
        We’ll use these details to respond about your request. Read our{" "}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">Privacy Policy</Link>.
      </p>
    </form>
  );
}
