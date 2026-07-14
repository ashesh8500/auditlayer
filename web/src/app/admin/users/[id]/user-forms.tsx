"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateUserPlan,
  adjustGiftedAudits,
  setAccountType,
  setUserAccess,
  type AdminActionState,
} from "@/lib/actions/admin";

const initial: AdminActionState = { status: "idle" };

function Feedback({ state }: { state: AdminActionState }) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <p
      className={`text-xs ${
        state.status === "ok"
          ? "text-[color:var(--green)]"
          : "text-[color:var(--red)]"
      }`}
    >
      {state.message}
    </p>
  );
}

export function AccessAssignmentForm({
  userId,
  plan,
  accountType,
  giftedAudits,
}: {
  userId: string;
  plan: string;
  accountType: string;
  giftedAudits: number;
}) {
  const [state, action, pending] = useActionState(setUserAccess, initial);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="profileId" value={userId} />
      <div className="space-y-1.5">
        <Label htmlFor="access-plan">Plan</Label>
        <select id="access-plan" name="plan" defaultValue={plan} className="h-10 w-full border border-border bg-background px-3 text-sm">
          <option value="free">Free</option>
          <option value="starter">Starter</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise (manual)</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="access-type">Account type</Label>
        <select id="access-type" name="account_type" defaultValue={accountType} className="h-10 w-full border border-border bg-background px-3 text-sm">
          <option value="standard">Standard</option>
          <option value="trial">Trial</option>
          <option value="comp">Complimentary</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="access-gifted">Gifted audit credits</Label>
        <Input id="access-gifted" name="gifted_audits" type="number" min={0} defaultValue={giftedAudits} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="access-reason">Reason</Label>
        <Input id="access-reason" name="reason" placeholder="Contract, comp, correction…" minLength={3} required />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Save access assignment
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function PlanChangeForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(updateUserPlan, initial);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="profileId" value={userId} />
      <div className="space-y-1.5">
        <Label htmlFor="plan">Plan</Label>
        <select
          id="plan"
          name="plan"
          required
          className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
        >
          <option value="free">Free</option>
          <option value="starter">Starter</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="plan-reason">Reason (optional)</Label>
        <Input id="plan-reason" name="reason" placeholder="Why change?" />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        Change Plan
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function GiftedAdjustForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(adjustGiftedAudits, initial);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="profileId" value={userId} />
      <div className="space-y-1.5">
        <Label htmlFor="amount">Amount (can be negative)</Label>
        <Input
          id="amount"
          name="amount"
          type="number"
          required
          placeholder="-1, 3, 10…"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="gift-reason">Reason (optional)</Label>
        <Input id="gift-reason" name="reason" placeholder="Why adjust?" />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        Adjust Gifted Audits
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function AccountTypeForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(setAccountType, initial);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="profileId" value={userId} />
      <div className="space-y-1.5">
        <Label htmlFor="account_type">Account Type</Label>
        <select
          id="account_type"
          name="account_type"
          required
          className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
        >
          <option value="standard">Standard</option>
          <option value="trial">Trial</option>
          <option value="comp">Comp</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="atype-reason">Reason (optional)</Label>
        <Input id="atype-reason" name="reason" placeholder="Why change?" />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        Change Account Type
      </Button>
      <Feedback state={state} />
    </form>
  );
}
