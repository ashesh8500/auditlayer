import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import NewAuditPage from "./page";
const state = vi.hoisted(() => ({ account: { id: "account" } as { id: string } | null, links: [{ id: "channel", subject_id: "subject" }], filters: [] as string[][] }));
vi.mock("@/lib/auth", () => ({ requireProfile: async () => ({ id: "owner", role: "admin" }) }));
vi.mock("@/lib/allowance", () => ({ loadAuditAllowance: async () => ({ effective_plan: "pro", allowed_report_types: ["pulse", "standard", "extended"], can_submit: true }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: (table: string) => {
  const q = { select: () => q, eq: (key: string, value: string) => { state.filters.push([table, key, value]); return q; }, order: () => q, limit: async () => ({ data: state.links, error: null }), maybeSingle: async () => ({ data: state.account, error: null }) };
  return q;
} }) }));
vi.mock("@/lib/intelligence/subjects", () => ({ listSubjectsForUser: async () => ({ subjects: [{ id: "subject", name: "Owned", type: "creator" }] }), listChannelsForSubject: async () => [{ id: "channel", platform: "instagram" }], listBriefVersionsForSubject: async () => [] }));
vi.mock("@/components/intelligence/intelligence-wizard", () => ({ IntelligenceWizard: (props: { initialSubjectId?: string; initialChannelId?: string }) => <div data-subject={props.initialSubjectId} data-channel={props.initialChannelId} /> }));
Object.assign(globalThis, { React });
beforeEach(() => { state.account = { id: "account" }; state.links = [{ id: "channel", subject_id: "subject" }]; state.filters = []; });
it("resolves account to the owned subject/channel even for an admin", async () => {
  const html = renderToStaticMarkup(await NewAuditPage({ searchParams: Promise.resolve({ account_id: "account" }) }));
  expect(state.filters).toContainEqual(["accounts", "user_id", "owner"]);
  expect(html).toContain('data-subject="subject"'); expect(html).toContain('data-channel="channel"');
});
it("does not resolve a foreign account via broad admin RLS", async () => {
  state.account = null;
  const html = renderToStaticMarkup(await NewAuditPage({ searchParams: Promise.resolve({ account_id: "foreign" }) }));
  expect(html).toContain("not available in your workspace"); expect(html).not.toContain('data-channel="channel"');
});
it("warns rather than guessing an ambiguous or unassociated account", async () => {
  state.links = [];
  const html = renderToStaticMarkup(await NewAuditPage({ searchParams: Promise.resolve({ account_id: "account" }) }));
  expect(html).toContain("no unique subject association");
});
