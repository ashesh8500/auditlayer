import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import type { Database } from "@/lib/supabase/types";
import {
  decideArtifactAccess,
  isAdminPrincipal,
  type Principal,
} from "@/lib/access-boundary";

type AuditRow = Database["public"]["Tables"]["audits"]["Row"];

export type AuditAccessResult =
  | { audit: AuditRow }
  | { error: "not_found" | "forbidden" | "unauthorized" };

/** Build the canonical principal from a server-verified profile. */
function principalFromProfile(profile: NonNullable<Awaited<ReturnType<typeof getProfile>>>): Principal {
  if (profile.role === "admin") {
    return { kind: "admin", userId: profile.id, role: profile.role };
  }
  return { kind: "owner", userId: profile.id, role: profile.role };
}

/**
 * Verify the current user may view/download this audit's artifacts.
 *
 * The canonical `decideArtifactAccess` contract runs BEFORE any service-role
 * client is constructed: the audit row is fetched through the user-scoped
 * (RLS-honouring) client, and the owner/admin decision is computed purely.
 */
export async function getAuditForViewer(
  auditId: string,
): Promise<AuditAccessResult> {
  const profile = await getProfile();
  if (!profile) return { error: "unauthorized" };
  const principal = principalFromProfile(profile);

  const supabase = await createClient();
  const { data: audit } = await supabase
    .from("audits")
    .select("*")
    .eq("id", auditId)
    .maybeSingle();

  if (!audit) return { error: "not_found" };

  const decision = decideArtifactAccess({
    principal,
    resource: { resourceClass: "audit", ownerUserId: audit.user_id },
  });
  if (decision === "deny") return { error: "forbidden" };

  return { audit };
}

export { isAdminPrincipal };
