// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CustomerWaitState } from "./customer-wait-state";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
let root: Root;
let calls = 0;
let container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers(); calls = 0; refresh.mockClear();
  Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  container = document.createElement("div");
  root = createRoot(container);
  vi.stubGlobal("fetch", vi.fn(async () => {
    calls++;
    // Bound the old response loop so the regression fails, rather than hangs.
    if (calls > 10) return new Promise(() => {});
    return { ok: true, json: async () => ({ phase: "analyzing", terminal: null, startedAt: null }) };
  }));
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("review can be checked explicitly without requeueing and recover to ready", async () => {
 await act(async()=>root.render(<CustomerWaitState auditId="a" internalStatus="needs_review" startedAt={null}/>));
 expect(fetch).not.toHaveBeenCalled();
 const button = [...container.querySelectorAll("button")].find(b=>b.textContent==="Check again");
 expect(button).toBeTruthy();
 vi.mocked(fetch).mockResolvedValue({ok:true,json:async()=>({phase:"finalizing",terminal:"ready"})} as Response);
 await act(async()=>button!.click());
 expect(fetch).toHaveBeenCalledTimes(1);
 expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBeUndefined();
 expect(refresh).toHaveBeenCalledTimes(1);
});
it("unauthorized observation stops with explicit recovery instead of silent spinning",async()=>{
 vi.mocked(fetch).mockResolvedValue({status:401,ok:false} as Response);
 await act(async()=>root.render(<CustomerWaitState auditId="a" internalStatus="running" startedAt={null}/>));
 expect(container.textContent).toContain("Sign in again");
 expect(container.textContent).toContain("Check again");
 await act(async()=>vi.advanceTimersByTimeAsync(120000));
 expect(fetch).toHaveBeenCalledTimes(1);
});
it("does not promise notifications, continued processing or verified evidence",async()=>{
 await act(async()=>root.render(<CustomerWaitState auditId="a" internalStatus="failed" startedAt={null}/>));
 expect(container.textContent).not.toContain("has been notified");
 expect(container.textContent).not.toContain("need to take any action");
});

it("does not poll again on a successful response or rerender before its cadence", async () => {
  await act(async () => root.render(<CustomerWaitState auditId="a" internalStatus="running" startedAt={null} />));
  expect(calls).toBe(1);
  await act(async () => vi.advanceTimersByTimeAsync(7999));
  expect(calls).toBe(1);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(calls).toBe(2);
});

it("pauses hidden/offline and aborts pending work on unmount", async () => {
  let signal: AbortSignal | undefined;
  vi.stubGlobal("fetch", vi.fn((_url, options) => { calls++; signal = options.signal; return new Promise(() => {}); }));
  await act(async () => root.render(<CustomerWaitState auditId="a" internalStatus="running" startedAt={null} />));
  expect(calls).toBe(1);
  await act(async () => { Object.defineProperty(document, "hidden", { value: true }); document.dispatchEvent(new Event("visibilitychange")); });
  expect(signal?.aborted).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(calls).toBe(1);
  await act(async () => { Object.defineProperty(document, "hidden", { value: false }); Object.defineProperty(navigator, "onLine", { value: false }); window.dispatchEvent(new Event("offline")); });
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(calls).toBe(1);
  await act(async () => { Object.defineProperty(navigator, "onLine", { value: true }); window.dispatchEvent(new Event("online")); });
  await act(async () => vi.advanceTimersByTimeAsync(8000));
  expect(calls).toBe(2);
  await act(async () => root.render(null));
  expect(signal?.aborted).toBe(true);
});
it.each(["ready", "failed", "blocked", "needs_review"])("stops at %s and refreshes ready exactly once", async terminal => {
  vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ phase: "finalizing", terminal }) } as Response);
  await act(async () => root.render(<CustomerWaitState auditId="a" internalStatus="running" startedAt={null} />));
  await act(async () => vi.advanceTimersByTimeAsync(120000));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(refresh).toHaveBeenCalledTimes(terminal === "ready" ? 1 : 0);
});
it("backs off transient failures without an immediate response loop", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));
  await act(async () => root.render(<CustomerWaitState auditId="a" internalStatus="running" startedAt={null} />));
  await act(async () => vi.advanceTimersByTimeAsync(15999));
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("ignores late ready after switching audit ids", async () => {
  let resolve!: (r: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await act(async () => root.render(<CustomerWaitState auditId="a" internalStatus="running" startedAt={null} />));
  await act(async () => root.render(<CustomerWaitState auditId="b" internalStatus="running" startedAt={null} />));
  await act(async () => resolve({ ok: true, json: async () => ({ phase: "finalizing", terminal: "ready" }) } as Response));
  expect(refresh).not.toHaveBeenCalled();
});
it("honors a terminal server prop even after nonterminal responses", async () => {
  await act(async () => root.render(<CustomerWaitState auditId="a" internalStatus="running" startedAt={null} />));
  await act(async () => root.render(<CustomerWaitState auditId="a" internalStatus="failed" startedAt={null} />));
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(fetch).toHaveBeenCalledTimes(1);
});

