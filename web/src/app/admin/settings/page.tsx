import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";
import { SettingsForm, type SettingsValues } from "./settings-form";

export default async function AdminSettingsPage() {
  if (!isSupabaseAdminConfigured()) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-10 text-sm text-muted-foreground">
        Service-role key required to load worker config.
      </main>
    );
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("app_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  const toolsets = Array.isArray(data?.enabled_toolsets)
    ? (data.enabled_toolsets as string[])
    : [];

  const values: SettingsValues = {
    hermes_model: data?.hermes_model ?? "deepseek-v4-flash",
    enabled_toolsets: toolsets.join(", "),
    token_cap: data?.token_cap ?? 120000,
    cost_cap_usd: data?.cost_cap_usd ?? 3,
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Worker configuration</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Controls the Hermes generation worker. Changes apply to the next audit
        the worker claims.
      </p>
      <div className="mt-8 rounded-[var(--radius)] border border-border bg-card p-6">
        <SettingsForm values={values} />
      </div>
    </main>
  );
}
