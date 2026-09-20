"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setUserAccess, type AdminActionState } from "@/lib/actions/admin";

const initial: AdminActionState = { status: "idle" };

export function AccessAssignmentForm({ userId, plan, accountType, giftedAudits }: {
  userId: string; plan: string; accountType: string; giftedAudits: number;
}) {
  const [state, action, pending] = useActionState(setUserAccess, initial);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="profileId" value={userId} />
      <div className="space-y-1.5">
        <Label htmlFor="access-plan">Plan</Label>
        <select id="access-plan" name="plan" defaultValue={plan} className="h-10 w-full border border-border bg-background px-3 text-sm">
          <option value="free">Free</option><option value="starter">Starter</option>
          <option value="pro">Pro</option><option value="enterprise">Enterprise (manual)</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="access-type">Account type</Label>
        <select id="access-type" name="account_type" defaultValue={accountType} className="h-10 w-full border border-border bg-background px-3 text-sm">
          <option value="standard">Standard</option><option value="trial">Trial</option><option value="comp">Complimentary</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="access-gifted">Gifted credit adjustment (current: {giftedAudits})</Label>
        <Input id="access-gifted" name="gifted_delta" type="number" step={1} defaultValue={0} required />
        <p className="text-xs text-muted-foreground">Add or subtract credits; zero preserves the current balance.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="access-reason">Reason</Label>
        <Input id="access-reason" name="reason" placeholder="Contract, comp, correction…" minLength={3} required />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}Save access assignment
        </Button>
        {state.message && <p role="status" className="text-xs">{state.message}</p>}
      </div>
    </form>
  );
}
