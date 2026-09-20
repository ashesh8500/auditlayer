// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/components/brand", () => ({ Brand: () => <span>ALM</span> }));
vi.mock("@/components/immersive-report", () => ({ ImmersiveReport: () => <div data-report>Report</div> }));
import { ShareReportView } from "./share-report-view";
let root: Root, container: HTMLDivElement;
beforeEach(async () => {
  Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })));
  await act(async () => root.render(<ShareReportView token="test_token" needsVerification />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function input(id: string, value: string) {
  await act(async () => {
    const field = container.querySelector<HTMLInputElement>(`#${id}`)!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() { await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }
async function requestCode() { await input("verify-email", "recipient@example.test"); await submit(); }
it("keeps the same code form mounted while pending and after a typo, then succeeds", async () => {
  await requestCode(); await input("verify-code", "123456");
  const field = container.querySelector("#verify-code");
  let resolve!: (value: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await submit();
  expect(container.querySelector("#verify-code")).toBe(field);
  expect(container.querySelector("#verify-email")).toBeNull();
  expect([...container.querySelectorAll("button")].every(b => b.disabled)).toBe(true);
  await act(async () => resolve({ ok: false, json: async () => ({ error: "Invalid code" }) } as Response));
  expect(container.querySelector("#verify-code")).toBe(field);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Invalid code");
  await input("verify-code", "654321");
  vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ verified: true }) } as Response);
  await submit(); expect(container.querySelector("[data-report]")).not.toBeNull();
});
it("retains retryable code stage on network error and bounds immediate resend", async () => {
  await requestCode(); await input("verify-code", "123456");
  vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
  await submit(); expect(container.querySelector("#verify-code")).not.toBeNull();
  expect(container.textContent).toContain("Network error");
  const calls = vi.mocked(fetch).mock.calls.length;
  await act(async () => [...container.querySelectorAll("button")].find(b => b.textContent === "Resend code")!.click());
  expect(fetch).toHaveBeenCalledTimes(calls); expect(container.textContent).toContain("wait a minute");
});
it("uses conditional delivery copy and does not disclose the bound email", async () => {
  expect(container.textContent).toContain("specific email");
  await requestCode(); expect(container.textContent).toContain("If this email matches the recipient");
});
