import "server-only";
import type { createClient } from "@/lib/supabase/server";

type ContextAudit = { id: string; user_id: string; handle: string; status: string };
interface Membership {
  batch: { id: string; user_id: string; subject: { id: string; user_id: string; name: string }; items: { audit: ContextAudit | null }[] };
}
/** Read only after the root audit has been owner-authorized. Re-check joined
 * owners as defense in depth: broad admin RLS must not widen customer context. */
export async function loadAuditContext(client: Awaited<ReturnType<typeof createClient>>, auditId: string, ownerId: string) {
  const { data, error } = await client.from("batch_audits")
    .select("batch:audit_batches!inner(id,user_id,subject:subjects!inner(id,user_id,name),items:batch_audits(audit:audits!inner(id,user_id,handle,status)))")
    .eq("audit_id", auditId).eq("batch.user_id", ownerId).maybeSingle();
  if (error) throw new Error("audit_context_unavailable");
  const batch = (data as unknown as Membership | null)?.batch;
  if (!batch || batch.user_id !== ownerId || batch.subject?.user_id !== ownerId) return null;
  return {
    subject: { id: batch.subject.id, name: batch.subject.name },
    audits: (batch.items ?? []).flatMap(({ audit }) => audit?.user_id === ownerId ? [{ id: audit.id, handle: audit.handle, status: audit.status }] : []),
  };
}
