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
      <div className="space-y-1.5">
        <Label htmlFor="hermes_model">Hermes model</Label>
        <Input
          id="hermes_model"
          name="hermes_model"
          defaultValue={values.hermes_model}
        />
        <p className="text-xs text-muted-foreground">
          Admin-only. Never exposed to end users.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="enabled_toolsets">Enabled toolsets</Label>
        <Input
          id="enabled_toolsets"
          name="enabled_toolsets"
          defaultValue={values.enabled_toolsets}
          placeholder="web, browser, x_search"
        />
        <p className="text-xs text-muted-foreground">Comma-separated.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="token_cap">Token cap</Label>
          <Input
            id="token_cap"
            name="token_cap"
            type="number"
            min={1}
            defaultValue={values.token_cap}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cost_cap_usd">Cost cap (USD)</Label>
          <Input
            id="cost_cap_usd"
            name="cost_cap_usd"
            type="number"
            min={0}
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
