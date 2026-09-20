import React from "react";
import { expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import NewAuditPage from "./page";
vi.mock("@/lib/auth", () => ({ requireProfile: async () => ({ id: "admin-owner", role: "admin", plan: "pro" }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/intelligence/subjects", () => ({ listSubjectsForUser: async () => ({ subjects: [] }), listChannelsForSubject: vi.fn(), listBriefVersionsForSubject: vi.fn() }));
vi.mock("@/components/intelligence/intelligence-wizard", () => ({ IntelligenceWizard: () => null }));
Object.assign(globalThis, { React });
it("reads canonical owner allowance without an independent lifetime count", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { effective_plan: "pro", allowed_report_types: ["pulse", "standard", "extended"], usage: 0, can_submit: true }, error: null });
  vi.mocked(createClient).mockResolvedValue({ rpc } as never);
  await NewAuditPage({ searchParams: Promise.resolve({}) });
  expect(rpc).toHaveBeenCalledWith("audit_allowance", { p_user_id: "admin-owner" });
});
it("keeps exhausted intake reachable for safe lost-response retries", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { effective_plan: "free", allowed_report_types: ["pulse"], usage: 1, can_submit: false, window_valid: true }, error: null });
  vi.mocked(createClient).mockResolvedValue({ rpc } as never);
  const { renderToStaticMarkup } = await import("react-dom/server");
  const html = renderToStaticMarkup(await NewAuditPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain("Your current audit allowance is used");
  expect(html).not.toContain("unconfigured");
});
