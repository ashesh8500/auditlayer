import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import type { Database } from "@/lib/supabase/types";

type AuditRow = Database["public"]["Tables"]["audits"]["Row"];

export type AuditAccessResult =
  | { audit: AuditRow }
  | { error: "not_found" | "forbidden" | "unauthorized" };

/** Verify the current user may view/download this audit's artifacts. */
export async function getAuditForViewer(
  auditId: string,
): Promise<AuditAccessResult> {
  const profile = await getProfile();
  if (!profile) return { error: "unauthorized" };
  const supabase = await createClient();
  const { data: audit } = await supabase
    .from("audits")
    .select("*")
    .eq("id", auditId)
    .maybeSingle();

  if (!audit) return { error: "not_found" };
  if (audit.user_id !== profile.id && profile.role !== "admin") {
    return { error: "forbidden" };
  }
  return { audit };
}
