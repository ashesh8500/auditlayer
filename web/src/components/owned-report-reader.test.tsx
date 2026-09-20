// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceResources, useWorkspaceResources } from "./workspace-resources";
import { OwnedReportReader } from "./owned-report-reader";
import { REPORT_PRESENTATION_REVISION } from "@/lib/resources/report";
const auth = vi.hoisted(() => ({ callback: undefined as undefined | ((event: string, session: unknown) => void) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { onAuthStateChange: (callback: typeof auth.callback) => { auth.callback = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; } } }) }));
vi.mock("./immersive-report", () => ({ ImmersiveReport: ({ reportHtml }: {reportHtml: string}) => <article>{reportHtml.slice(0, 20)}</article> }));
let root: Root; let host: HTMLDivElement;
let scope: NonNullable<ReturnType<typeof useWorkspaceResources>>;
function Capture() { const value = useWorkspaceResources()!; React.useEffect(() => { scope = value; }, [value]); return null; }
const tree = (show = true, ownerId = "a") => <WorkspaceResources ownerId={ownerId} revisions={{reports:"0",connections:"0",subjects:"0"}}><Capture />{show && <OwnedReportReader id="current" />}</WorkspaceResources>;
async function settle() { await act(async () => { await new Promise(r => setTimeout(r, 20)); }); }
beforeEach(() => {
 Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
 host = document.createElement("div"); root = createRoot(host);
 // The reader first reads owner-scoped metadata, then the exact immutable bytes.
 vi.stubGlobal("fetch", vi.fn(async (input: unknown) => ({ ok: true, json: async () => String(input).includes("metadata=1")
  ? { ownerId:"a", reportId:"current", version:1, latestVersion:1, presentationRevision:REPORT_PRESENTATION_REVISION, handle:"current", fetchedAt:"2026-09-19T12:00:00Z", contextVersion:1, evidenceSnapshotId:null, methodology:null, versions:[{version:1,createdAt:"2026-09-19T12:00:00Z",changeType:"initial",changedSection:null}] }
  : { ownerId:"a", reportId:"current", version:1, contentHash:"a".repeat(64), presentationRevision:REPORT_PRESENTATION_REVISION, html:"CURRENT private" + "x".repeat(5 * 1024 * 1024), fetchedAt:"2026-09-19T12:00:00Z", handle:"current" } })));
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
it.each([true, false])("fences a late reader response after switching identity (success=%s)", async success => {
 let finish!: (value: Response) => void;
 vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
 await act(async () => root.render(tree()));
 const oldClient = scope.client;
 vi.mocked(fetch).mockResolvedValue({ok:true,json:async () => ({ownerId:"b",reportId:"current",version:1,contentHash:"b".repeat(64),presentationRevision:REPORT_PRESENTATION_REVISION,html:"B private",handle:"b",fetchedAt:"2026-09-19T12:00:00Z"})} as Response);
 await act(async () => root.render(tree(true, "b"))); await settle();
 await act(async () => finish({ok:success,status:success ? 200 : 401,json:async () => ({ownerId:"a",html:"A private"})} as Response)); await settle();
 expect(host.textContent).toContain("B private");
 expect(host.textContent).not.toContain("A private");
 expect(oldClient.getQueryCache().getAll()).toHaveLength(0);
});
it("keeps an oversized mounted report through budget pressure, drops it on departure and clears on signout", async () => {
 await act(async () => root.render(tree())); await settle();
 for (let i = 0; i < 48; i++) scope.client.setQueryData(["workspace","a","report-version",String(i)], {html:"x".repeat(1024 * 1024)});
 await settle();
 expect(host.textContent).toContain("CURRENT private");
 expect(fetch).toHaveBeenCalledTimes(2); // metadata read + exact immutable bytes
 expect(scope.client.getQueryCache().getAll().filter(q => q.getObserversCount() === 0).length).toBeLessThanOrEqual(8);
 await act(async () => root.render(tree(false))); await settle();
 expect(scope.client.getQueryCache().getAll().some(q => { const data = q.state.data as {reportId?:string; html?:unknown}; return data?.reportId === "current" && typeof data.html === "string"; })).toBe(false);
 await act(async () => root.render(tree())); await settle();
 expect(fetch).toHaveBeenCalledTimes(4);
 expect(host.textContent).toContain("CURRENT private");
 await act(async () => auth.callback?.("SIGNED_OUT", null));
 expect(host.textContent).not.toContain("CURRENT private");
 expect(scope.client.getQueryCache().getAll()).toHaveLength(0);
});
