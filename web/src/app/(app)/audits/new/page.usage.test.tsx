import React from "react";
import { expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import NewAuditPage from "./page";
vi.mock("@/lib/auth", () => ({ requireProfile: async () => ({ id: "admin-owner", role: "admin", plan: "pro" }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/intelligence/subjects", () => ({ listSubjectsForUser: async () => ({ subjects: [] }), listChannelsForSubject: vi.fn(), listBriefVersionsForSubject: vi.fn() }));
vi.mock("@/components/intelligence/intelligence-wizard", () => ({ IntelligenceWizard: () => null }));
Object.assign(globalThis, { React });
it("counts only this owner's usage without downloading capped rows", async () => {
  const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), then: (resolve: (v: unknown) => unknown) => resolve({ data: [], count: 1, error: null }) };
  vi.mocked(createClient).mockResolvedValue({ from: () => q } as never);
  await NewAuditPage({ searchParams: Promise.resolve({}) });
  expect(q.eq).toHaveBeenCalledWith("user_id", "admin-owner");
  expect(q.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
  expect(q.in).toHaveBeenCalledWith("status", expect.any(Array));
});
