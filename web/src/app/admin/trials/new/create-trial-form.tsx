"use client";

import { useActionState, useState } from "react";
import { Loader2, Copy, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTrialLink, type AdminActionState } from "@/lib/actions/admin";

interface TrialState extends AdminActionState {
  token?: string;
  url?: string;
}

const initial: TrialState = { status: "idle" };

export function CreateTrialForm() {
  const [state, action, pending] = useActionState(createTrialLink, initial);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!state.url) return;
    await navigator.clipboard.writeText(state.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="audits_granted">Audits granted</Label>
          <Input
            id="audits_granted"
            name="audits_granted"
            type="number"
            min={1}
            max={50}
            defaultValue={3}
            required
          />
          <p className="text-xs text-muted-foreground">1–50 free audits.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="label">Label (optional)</Label>
          <Input
            id="label"
            name="label"
            placeholder='e.g. "DM to Hemal Patel"'
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="max_uses">Max uses (optional)</Label>
            <Input
              id="max_uses"
              name="max_uses"
              type="number"
              min={1}
              placeholder="Unlimited"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expires_in_days">Expires in days (optional)</Label>
            <Input
              id="expires_in_days"
              name="expires_in_days"
              type="number"
              min={1}
              max={365}
              placeholder="Never"
            />
          </div>
        </div>

        {state.status !== "idle" && state.status !== "ok" && state.message && (
          <p className="text-xs text-[color:var(--red)]">{state.message}</p>
        )}

        <Button type="submit" disabled={pending} className="font-medium">
          {pending && <Loader2 className="size-4 animate-spin" />}
          Create Trial Link
        </Button>
      </form>

      {/* Success state: show the generated URL */}
      {state.status === "ok" && state.url && (
        <div className="mt-6 rounded-[var(--radius)] border border-[color:var(--green-muted)] bg-[color:var(--green-muted)]/20 p-4">
          <p className="text-xs font-medium text-[color:var(--green)]">
            {state.message}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 break-all rounded-md border border-border bg-background px-3 py-2 font-mono text-sm">
              {state.url}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleCopy}
              className="shrink-0"
            >
              {copied ? (
                <Check className="size-4 text-[color:var(--green)]" />
              ) : (
                <Copy className="size-4" />
              )}
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
