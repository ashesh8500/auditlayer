import { QueryClient } from "@tanstack/react-query";
export type ResourceName = "reports" | "connections" | "subjects";
export const metadataOptions = {
  staleTime: 5 * 60 * 1000,
  gcTime: 15 * 60 * 1000,
  retry: false as const,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
};
// Logical UTF-8 payload limits, not a JavaScript heap measurement. Observed
// readers are exempt until unmounted; even duplicate pointer payloads are charged.
export const reportCacheBudget = { entries: 8, bytes: 16 * 1024 * 1024, perReportBytes: 4 * 1024 * 1024 };
export function createWorkspaceClient() {
  const client = new QueryClient({ defaultOptions: { queries: metadataOptions } });
  const cache = client.getQueryCache();
  // Numeric accounting only; TanStack remains the sole payload/lifecycle owner.
  const sizes = new WeakMap<object, number>();
  cache.subscribe(event => {
    if (event.type !== "observerRemoved" && !(event.type === "updated" && event.action.type === "success")) return;
    const inactive = cache.getAll().filter(query => {
      const key = query.queryKey;
      return key[0] === "workspace" && (key[2] === "report-version" || (key[2] === "reports" && String(key[4]).startsWith("reader:")))
        && query.getObserversCount() === 0 && query.state.fetchStatus === "idle"
        && typeof (query.state.data as { html?: unknown } | undefined)?.html === "string";
    }).reverse().sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
    let entries = 0; let bytes = 0;
    for (const query of inactive) {
      const data = query.state.data as { html: string };
      const size = sizes.get(data) ?? new TextEncoder().encode(data.html).byteLength;
      sizes.set(data, size);
      if (size > reportCacheBudget.perReportBytes || entries >= reportCacheBudget.entries || bytes + size > reportCacheBudget.bytes) cache.remove(query);
      else { entries++; bytes += size; }
    }
  });
  return client;
}
export const resourceKey = (owner: string, name: string, revision: string, params = "") =>
  ["workspace", owner, name, revision, params] as const;
export class ResourceAuthError extends Error {}
export async function fencedJson<T extends { ownerId: string }>(url: string, owner: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store", credentials: "same-origin" });
  signal.throwIfAborted();
  if (response.status === 401 || response.status === 403) throw new ResourceAuthError("Your session has changed. Please sign in again.");
  if (!response.ok) throw new Error("Could not load saved data. Please try again.");
  const data = await response.json() as T;
  signal.throwIfAborted();
  if (data.ownerId !== owner) throw new ResourceAuthError("Your session has changed. Please sign in again.");
  return data;
}
