// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IntelligenceWizard } from "./intelligence-wizard";
const mocks = vi.hoisted(() => ({ submit: vi.fn(), load: vi.fn(), push: vi.fn() }));
vi.mock("@/lib/actions/intelligence", () => ({ prepareAndSubmitIntelligenceBatch: mocks.submit, loadSubjectWizardContextAction: mocks.load }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/components/navigation-progress", () => ({ startNavigationProgress: vi.fn() }));
vi.mock("@/components/intelligence/living-brief-view", () => ({ LivingBriefView: () => <div>Saved brief</div> }));
let root: Root; let host: HTMLDivElement;
const channel = { id: "channel-1", subjectId: "subject-1", platform: "instagram" as const, handle: "example", url: null, displayName: "Example", connected: false, avatarUrl: null, ownershipStatus: "managed" as const };
const subject = { id: "subject-1", name: "Example", type: "creator" as const, avatarUrl: null, channelCount: 1, lastAuditAt: null };
beforeEach(() => {
  Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); root = createRoot(host);
  mocks.submit.mockReset(); mocks.load.mockReset(); mocks.push.mockReset();
});
afterEach(async () => { await act(async () => root.unmount()); });
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find((item) => item.textContent?.includes(text));
  expect(button, text).toBeTruthy();
  await act(async () => button!.click());
}
async function mount(allowed: ("pulse" | "standard" | "extended" | "enterprise")[] = ["pulse", "standard", "extended"], reconnect = false) {
  await act(async () => root.render(<IntelligenceWizard plan="pro" initialSubjectId="subject-1" initialChannelId="channel-1" initialSubjects={[subject]} entitledReportTypes={allowed} initialChannelsBySubject={{ "subject-1": [channel, { ...channel, id: "channel-2", handle: "other", displayName: "Reconnect me", reconnectRequired: reconnect }] }} initialBriefsBySubject={{ "subject-1": [] }} />));
  await click("Continue");
  await click("Review batch");
}
it("submits the selected Extended type, recovers rejected transport, and routes the entire batch", async () => {
  await mount();
  const selector = host.querySelector("select")!;
  expect([...selector.options].map((option) => option.value)).toContain("extended");
  await act(async () => { selector.value = "extended"; selector.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(host.textContent).toContain("Extended");
  mocks.submit.mockRejectedValueOnce(new Error("transport"));
  await click("Submit");
  expect(host.textContent).toContain("Retry the same batch");
  expect(host.querySelector("button[disabled]")?.textContent ?? "").not.toContain("Submitting");
  expect(mocks.submit.mock.calls[0][0].submission.requests[0].reportType).toBe("extended");
  mocks.submit.mockResolvedValueOnce({ ok: true, subjectId: "subject-1", batchId: "batch-1", auditIds: ["a", "b"] });
  await click("Submit");
  expect(mocks.push).toHaveBeenCalledWith("/subjects/subject-1?batch=batch-1");
});
it("offers only authoritative types including a trial-specific grant", async () => {
  await mount(["pulse", "standard", "enterprise"]);
  expect([...host.querySelector("select")!.options].map((option) => option.value)).toEqual(["pulse", "standard", "enterprise"]);
});
it("does not offer reconnect-required channels again at batch review", async () => {
  await mount(["pulse", "standard"], true);
  expect(host.textContent).not.toContain("Reconnect me");
});
it("catches rejected context loads and supports retry without changing subject", async () => {
  mocks.load.mockRejectedValueOnce(new Error("network"));
  await act(async () => root.render(<IntelligenceWizard plan="starter" initialSubjectId="subject-1" initialSubjects={[subject]} />));
  expect(host.textContent).toContain("Could not load channels");
  mocks.load.mockResolvedValueOnce({ ok: true, channels: [channel], briefs: [] });
  await click("Retry loading channels");
  expect(mocks.load).toHaveBeenCalledTimes(2);
  expect(host.textContent).not.toContain("Could not load channels");
});
