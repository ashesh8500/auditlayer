"use client";

import { useQuery } from "@tanstack/react-query";
import { useWorkspaceResources } from "@/components/workspace-resources";
import { fencedJson, metadataOptions } from "@/lib/resources/workspace";
import { WorkflowOwner } from "@/components/workflows/workflow-owner";
import type { WorkflowResourceView } from "@/lib/workflows/dto";

/**
 * Owner-scoped workflow resource. Reuses the retained TanStack owner and the
 * retained fenced fetch helper; it does not add a second cache, provider or
 * server read, and this read never schedules, charges or sends anything.
 */
export const workflowResourceKey = (ownerId: string, revision: string) =>
  ["workspace", ownerId, "workflows", revision, ""] as const;
export const workflowResourceUrl = () => "/api/resources/workflows";

export function WorkflowsLibrary({ revision = "0" }: { revision?: string }) {
  const scope = useWorkspaceResources();
  if (!scope) throw new Error("Workspace resource provider missing");
  const query = useQuery<WorkflowResourceView & { fetchedAt: string }>({
    ...metadataOptions,
    queryKey: workflowResourceKey(scope.ownerId, revision),
    queryFn: ({ signal }) => fencedJson<WorkflowResourceView & { fetchedAt: string }>(workflowResourceUrl(), scope.ownerId, signal),
  });

  if (!query.data) {
    return (
      <main className="alm-shell py-12" data-testid="workflows-content">
        <h1 className="text-xl font-semibold">Brand reviews</h1>
        <p role="status" className="mt-2 text-sm">
          {query.isError ? "Saved brand reviews are unavailable right now. Nothing was scheduled and nothing was sent." : "Loading saved brand reviews."}
        </p>
      </main>
    );
  }
  return (
    <main data-testid="workflows-content">
      <WorkflowOwner ownerId={scope.ownerId} resource={query.data} />
    </main>
  );
}
