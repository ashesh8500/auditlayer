"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSettings, type AdminActionState } from "@/lib/actions/admin";

const initial: AdminActionState = { status: "idle" };

export interface SettingsValues {
  hermes_model: string;
  enabled_toolsets: string;
  token_cap: number;
  cost_cap_usd: number;
}

export function SettingsForm({ values }: { values: SettingsValues }) {
  const [state, action, pending] = useActionState(updateSettings, initial);

  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-muted-foreground">Production inference: DeepSeek V4 Flash, tool-free. Model and tool policy are fixed by the reviewed release, not editable settings.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="token_cap">Token cap</Label>
          <Input
            id="token_cap"
            name="token_cap"
            type="number"
            min={120000}
            defaultValue={values.token_cap}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cost_cap_usd">Cost cap (USD)</Label>
          <Input
            id="cost_cap_usd"
            name="cost_cap_usd"
            type="number"
            min={0.5}
            step="0.5"
            defaultValue={values.cost_cap_usd}
          />
        </div>
      </div>

      {state.status !== "idle" && state.message && (
        <p
          className={`text-xs ${state.status === "ok" ? "text-[color:var(--green)]" : "text-[color:var(--red)]"}`}
        >
          {state.message}
        </p>
      )}

      <Button type="submit" disabled={pending} className="font-medium">
        {pending && <Loader2 className="size-4 animate-spin" />}
        Save config
      </Button>
    </form>
  );
}
