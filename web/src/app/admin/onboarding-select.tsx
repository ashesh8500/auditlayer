"use client";

import { useActionState } from "react";

import { updateOnboarding, type AdminActionState } from "@/lib/actions/admin";

const STATUSES = [
  "lead",
  "login_requested",
  "audit_requested",
  "active",
  "needs_founder_review",
  "paid",
  "report_ready",
  "refinement_requested",
  "blocked",
  "churn_risk",
];

const initial: AdminActionState = { status: "idle" };

export function OnboardingSelect({
  profileId,
  current,
}: {
  profileId: string;
  current: string;
}) {
  const [state, action, pending] = useActionState(updateOnboarding, initial);

  return (
    <form action={action} className="flex items-center gap-1.5">
      <input type="hidden" name="profileId" value={profileId} />
      <select
        name="onboarding_status"
        defaultValue={current}
        disabled={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-7 rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {state.status === "error" && (
        <span className="text-[10px] text-[color:var(--red)]">
          {state.message}
        </span>
      )}
    </form>
  );
}
