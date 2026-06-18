"use client";

import { useActionState } from "react";

import { revokeTrialLink, type AdminActionState } from "@/lib/actions/admin";

const initial: AdminActionState = { status: "idle" };

export function RevokeButton({ trialId }: { trialId: string }) {
  const [state, action, pending] = useActionState(revokeTrialLink, initial);

  return (
    <form action={action}>
      <input type="hidden" name="trialLinkId" value={trialId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-[color:var(--red)] hover:underline disabled:opacity-50"
      >
        {pending ? "Revoking…" : "Revoke"}
      </button>
      {state.status !== "idle" && state.message && (
        <span className="ml-1 text-[10px] text-muted-foreground">
          {state.message}
        </span>
      )}
    </form>
  );
}
