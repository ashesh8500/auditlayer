import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";

export type TrialTokenResult =
  | {
      valid: true;
      auditsGranted: number;
      offerPlan: string;
      reportTypes: string[];
      accessDays: number;
    }
  | { valid: false; reason: "not_found" | "expired" | "revoked" | "exhausted" };

/**
 * Validate a trial link token against the `trial_links` table.
 * Uses the service-role client so it works on unauthenticated pages.
 */
export async function validateTrialToken(
  token: string,
): Promise<TrialTokenResult> {
  if (!isSupabaseAdminConfigured()) {
    return { valid: false, reason: "not_found" };
  }

  const admin = createAdminClient();

  const { data } = await (admin as any)
    .from("trial_links")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!data) return { valid: false, reason: "not_found" };
  if (data.revoked_at) return { valid: false, reason: "revoked" };
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { valid: false, reason: "expired" };
  }
  if (data.max_uses && data.used_count >= data.max_uses) {
    return { valid: false, reason: "exhausted" };
  }

  return {
    valid: true,
    auditsGranted: data.audits_granted,
    offerPlan: data.offer_plan,
    reportTypes: data.report_types,
    accessDays: data.access_days,
  };
}
