import { afterEach, expect, it, vi } from "vitest";
import { QueryObserver } from "@tanstack/react-query";
import { createWorkspaceClient, resourceKey, metadataOptions, fencedJson } from "./workspace";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("bounds inactive HTML by count, logical UTF-8 bytes and per-report admission without evicting a mounted reader", async () => {
  const client = createWorkspaceClient();
  const activeKey = resourceKey("a", "reports", "0", "reader:current");
  const active = { html: "x".repeat(5 * 1024 * 1024) };
  const observer = new QueryObserver(client, { queryKey: activeKey, queryFn: async () => active });
  const unsubscribe = observer.subscribe(() => {});
  await client.fetchQuery({ queryKey: activeKey, queryFn: async () => active });
  for (let i = 0; i < 48; i++) {
    client.setQueryData(["workspace", "a", "report-version", String(i)], { html: "é".repeat(1024 * 1024) });
  }
  const inactive = () => client.getQueryCache().getAll().filter(q => !q.getObserversCount() && (q.state.data as {html?:string})?.html);
  expect(inactive().length).toBeLessThanOrEqual(8);
  expect(inactive().reduce((sum, q) => sum + new TextEncoder().encode((q.state.data as {html:string}).html).byteLength, 0)).toBeLessThanOrEqual(16 * 1024 * 1024);
  expect(client.getQueryData(activeKey)).toBe(active);
  const hugeKey = ["workspace", "a", "report-version", "huge"];
  client.setQueryData(hugeKey, active);
  expect(client.getQueryData(hugeKey)).toBeUndefined();
  unsubscribe();
  expect(client.getQueryData(activeKey)).toBeUndefined();
  client.clear();
  expect(client.getQueryCache().getAll()).toHaveLength(0);
});

it("charges pointer and immutable payloads together and enforces bytes independently of count", () => {
  const client = createWorkspaceClient();
  for (let i = 0; i < 8; i++) {
    const data = { html: "x".repeat(3 * 1024 * 1024) };
    client.setQueryData(["workspace", "a", "report-version", String(i)], data);
    client.setQueryData(resourceKey("a", "reports", "0", `reader:${i}`), data);
  }
  const entries = client.getQueryCache().getAll();
  expect(entries.length).toBe(5);
  expect(entries.reduce((n, q) => n + (q.state.data as {html:string}).html.length, 0)).toBeLessThanOrEqual(16 * 1024 * 1024);
  client.clear();
  for (let i = 0; i < 48; i++) client.setQueryData(["workspace", "a", "report-version", String(i)], {html:""});
  expect(client.getQueryCache().getAll()).toHaveLength(8);
  client.clear();
});
it("garbage-collects inactive data independently of freshness", async () => {
  vi.useFakeTimers();
  const client = createWorkspaceClient();
  const key = resourceKey("owner-a", "reports", "1");
  await client.fetchQuery({ queryKey: key, queryFn: async () => [], staleTime: Infinity });
  expect(client.getQueryData(key)).toEqual([]);
  await vi.advanceTimersByTimeAsync(metadataOptions.gcTime + 1);
  expect(client.getQueryData(key)).toBeUndefined();
  client.clear();
});
it("deduplicates concurrent readers and reuses an empty success until the five minute TTL", async () => {
  vi.useFakeTimers();
  const client = createWorkspaceClient();
  const read = vi.fn(async () => []);
  const options = { ...metadataOptions, queryKey: resourceKey("owner-a", "reports", "1", "page=1"), queryFn: read };
  await Promise.all([client.fetchQuery(options), client.fetchQuery(options)]);
  await client.fetchQuery(options);
  expect(read).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(300001);
  await client.fetchQuery(options);
  expect(read).toHaveBeenCalledTimes(2);
  client.clear();
});
it("does not accept another owner's DTO or a cancelled late response", async () => {
  const controller = new AbortController();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ ownerId: "b" }) })));
  await expect(fencedJson("/api/resources/reports", "a", controller.signal)).rejects.toThrow();
  controller.abort();
  await expect(fencedJson("/api/resources/reports", "b", controller.signal)).rejects.toThrow();
});
