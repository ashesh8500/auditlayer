"use client";
import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { claimTrialAccess } from "./actions";
import type { ClaimState } from "@/lib/auth/claim-trial";
const initial: ClaimState = { status: "idle" };
export function TrialClaimForm({ trial, next }: { trial: string; next: string }) {
  const [state, action, pending] = useActionState(claimTrialAccess, initial);
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">You are signed in. Claim this invite to apply its access to your account.</p>
    {state.message && <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p>}
    {state.status !== "success" && <form action={action}>
      <input type="hidden" name="trial" value={trial} />
      <Button type="submit" disabled={pending}>{pending ? "Checking invite…" : state.status === "error" ? "Try claim again" : "Claim trial access"}</Button>
    </form>}
    <Link href={next} className="block text-sm underline">{state.status === "success" ? "Continue to workspace" : "Continue without claiming"}</Link>
  </div>;
}
