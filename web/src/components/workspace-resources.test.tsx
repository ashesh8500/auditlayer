// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceResources, useWorkspaceQuery } from "./workspace-resources";
const auth = vi.hoisted(() => ({ callback: undefined as undefined | ((event: string, session: unknown) => void) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { onAuthStateChange: (callback: typeof auth.callback) => { auth.callback = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; } } }) }));
let root: Root; let host: HTMLDivElement;
const revisions = { reports: "0", connections: "0", subjects: "0" };
function View({ name = "reports" }: { name?: "reports" | "connections" }) {
  const q = useWorkspaceQuery<{ ownerId: string; label: string }>(name, "page=1");
  return <div>{q.data?.label ?? "loading"}{q.error && " refresh failed"}<button onClick={() => void q.refetch({ cancelRefetch: false })}>Refresh</button></div>;
}
const tree = (owner: string, children: React.ReactNode, revision = "0") => <WorkspaceResources ownerId={owner} revisions={{ ...revisions, reports: revision }}>{children}</WorkspaceResources>;
async function settle() { await act(async () => { await new Promise(r => setTimeout(r, 20)); }); }
beforeEach(() => {
  Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); root = createRoot(host);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => ({ ownerId: "a", label: url.includes("connections") ? "connections data" : "reports data" }) })));
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
it("deduplicates two consumers and paints retained data on repeat navigation without another origin read", async () => {
  await act(async () => root.render(tree("a", <><View /><View /></>))); await settle();
  expect(fetch).toHaveBeenCalledTimes(1); expect(host.textContent).toContain("reports data");
  await act(async () => root.render(tree("a", <View name="connections" />))); await settle();
  await act(async () => root.render(tree("a", <View />))); await settle();
  expect(fetch).toHaveBeenCalledTimes(2); expect(host.textContent).toContain("reports data");
  window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("online")); await settle();
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("manual refresh keeps data plus error without retrying or relabeling success", async () => {
  await act(async () => root.render(tree("a", <View />))); await settle();
  vi.mocked(fetch).mockRejectedValue(new Error("unavailable"));
  await act(async () => host.querySelector("button")!.click()); await settle();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain("reports data refresh failed");
});
it("mutation revision changes cannot paint the old resource while fetching the new generation", async () => {
  await act(async () => root.render(tree("a", <View />))); await settle();
  vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
  await act(async () => root.render(tree("a", <View />, "mutation-1"))); await settle();
  expect(host.textContent).not.toContain("reports data"); expect(fetch).toHaveBeenCalledTimes(2);
});
it.each([true, false])("fences late A success/error after owner switch (success=%s)", async success => {
  let finish!: (value: Response) => void; let signal!: AbortSignal;
  vi.mocked(fetch).mockImplementationOnce((_url, options) => { signal = options!.signal as AbortSignal; return new Promise(r => { finish = r; }); });
  await act(async () => root.render(tree("a", <View />)));
  vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ ownerId: "b", label: "B private" }) } as Response);
  await act(async () => root.render(tree("b", <View />))); await settle();
  expect(signal.aborted).toBe(true);
  await act(async () => finish({ ok: success, status: success ? 200 : 401, json: async () => ({ ownerId: "a", label: "A private" }) } as Response)); await settle();
  expect(host.textContent).toContain("B private"); expect(host.textContent).not.toContain("A private");
});
it("signout hides cached private data and aborts in-flight work", async () => {
  await act(async () => root.render(tree("a", <View />))); await settle();
  await act(async () => auth.callback?.("SIGNED_OUT", null));
  expect(host.textContent).not.toContain("reports data"); expect(host.textContent).toContain("Sign in again");
});
it("authorization failure removes stale success instead of displaying cached private data", async () => {
  await act(async () => root.render(tree("a", <View />))); await settle();
  vi.mocked(fetch).mockResolvedValue({ ok: false, status: 403 } as Response);
  await act(async () => host.querySelector("button")!.click()); await settle();
  expect(host.textContent).not.toContain("reports data"); expect(host.textContent).toContain("Sign in again");
});
