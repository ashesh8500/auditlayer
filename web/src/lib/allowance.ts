import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Plan, ReportType } from "@/lib/domain";

/** Exact DB projection used by display and intake; no JavaScript reset math. */
export type AuditAllowance = {
  effective_plan: Plan;
  allowed_report_types: ReportType[];
  limit: number | null;
  usage: number;
  gifts: number;
  remaining: number | null;
  can_submit: boolean;
  window_kind: "stripe" | "lifetime";
  window_start: string | null;
  window_end: string | null;
  window_valid: boolean;
  trial_active: boolean;
  trial_expires_at: string | null;
};

export async function loadAuditAllowance(client: SupabaseClient<Database>, ownerId: string): Promise<AuditAllowance> {
  const { data, error } = await client.rpc("audit_allowance", { p_user_id: ownerId });
  if (error || !data || typeof data !== "object" || Array.isArray(data) ||
      typeof data.can_submit !== "boolean" || typeof data.usage !== "number" ||
      !Array.isArray(data.allowed_report_types)) {
    throw new Error("Audit allowance could not be loaded. Please try again.");
  }
  return data as AuditAllowance;
}
