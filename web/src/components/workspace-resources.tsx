"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { createWorkspaceClient, fencedJson, metadataOptions, resourceKey, ResourceAuthError, type ResourceName } from "@/lib/resources/workspace";

type Scope = { ownerId: string; revisions: Record<ResourceName, string>; client: ReturnType<typeof createWorkspaceClient>; invalidate: (name: ResourceName) => Promise<void> };
const Context = createContext<Scope | null>(null);
export function WorkspaceResources(props: { ownerId: string; revisions: Scope["revisions"]; children: ReactNode }) {
  // A principal change creates a completely new client; never reuse an A cache for B.
  return <OwnerResources key={props.ownerId} {...props} />;
}
function OwnerResources({ ownerId, revisions, children }: { ownerId: string; revisions: Scope["revisions"]; children: ReactNode }) {
  const [client] = useState(createWorkspaceClient);
  const [allowed, setAllowed] = useState(true);
  useEffect(() => {
    const { data: { subscription } } = createClient().auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session || session.user.id !== ownerId) {
        // Clear synchronously: cancellation also fences responses whose fetch ignores abort.
        client.clear();
        setAllowed(false);
      }
    });
    return () => { subscription.unsubscribe(); client.clear(); };
  }, [client, ownerId]);
  useEffect(() => client.getQueryCache().subscribe(event => {
    if (event.type === "updated" && event.query.state.error instanceof ResourceAuthError) {
      client.clear(); setAllowed(false);
    }
  }), [client]);
  const scope: Scope = { ownerId, revisions, client, invalidate: name => client.invalidateQueries({ queryKey: ["workspace", ownerId, name] }) };
  return <QueryClientProvider client={client}><Context.Provider value={scope}>
    {allowed ? children : <main className="alm-shell py-12" role="alert">Your session has changed. <a className="alm-focus inline-flex min-h-11 items-center underline" href="/login">Sign in again</a></main>}
  </Context.Provider></QueryClientProvider>;
}
export function useWorkspaceResources() { return useContext(Context); }
export function useWorkspaceQuery<T extends { ownerId: string }>(name: ResourceName, params: string) {
  const scope = useContext(Context);
  if (!scope) throw new Error("Workspace resource provider missing");
  return useQuery({ ...metadataOptions,
    queryKey: resourceKey(scope.ownerId, name, scope.revisions[name], params),
    queryFn: ({ signal }) => fencedJson<T & { fetchedAt: string }>(`/api/resources/${name}?${params}`, scope.ownerId, signal),
  });
}
