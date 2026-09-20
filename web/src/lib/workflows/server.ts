import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";
import type { WorkflowResourceView } from "@/lib/workflows/dto";

/**
 * Server-side workflow projections. Every read/write passes the current
 * authenticated owner; SQL re-checks ownership, current grants and staleness.
 * Never schedule, charge, send mail or generate reports here.
 */
export async function workflowRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (!isSupabaseAdminConfigured()) throw new Error("Workflows are not configured.");
  const { data, error } = await (createAdminClient() as unknown as {
    rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  }).rpc(`brand_workflow_${name}`, { p: args });
  if (error) throw new Error("Workflow request rejected.");
  return data ?? null;
}

export async function readWorkflows(ownerId: string): Promise<WorkflowResourceView> {
  const resource = await workflowRpc("resource", { owner_id: ownerId }) as WorkflowResourceView;
  if (!resource || resource.ownerId !== ownerId) throw new Error("Workflow scope changed.");
  return resource;
}
