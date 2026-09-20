"use client";
import { Button } from "@/components/ui/button";
import type { UseQueryResult } from "@tanstack/react-query";
export function ResourceStatus({ query, label }: { query: Pick<UseQueryResult<{ fetchedAt: string }>, "data" | "error" | "isFetching" | "refetch" | "dataUpdatedAt">; label: string }) {
  return <div className="my-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground" aria-live="polite">
    {!query.data && !query.error && <span role="status">Loading {label.toLowerCase()}…</span>}
    {query.error && <span role="alert">{query.data ? `Could not refresh ${label.toLowerCase()}. Showing the previously loaded data.` : `${label} could not be loaded. Please try again.`}</span>}
    {query.data?.fetchedAt && <span>Last checked {new Date(query.data.fetchedAt).toLocaleTimeString()}</span>}
    {(Boolean(query.data) || Boolean(query.error)) && <Button variant="ghost" size="sm" type="button" disabled={query.isFetching} onClick={() => void query.refetch({ cancelRefetch: false })} className="min-h-11 underline disabled:opacity-50">{query.isFetching ? "Refreshing…" : query.error && !query.data ? "Try Again" : `Refresh ${label.toLowerCase()}`}</Button>}
  </div>;
}
