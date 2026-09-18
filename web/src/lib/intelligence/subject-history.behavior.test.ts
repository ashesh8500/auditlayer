import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ owner: "A", rows: {} as Record<string, Record<string, unknown>[]>, fail: "", calls: [] as string[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireProfile: async () => ({ id: state.owner, role: state.owner === "admin" ? "admin" : "user" }) }));
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from(table: string) {
  const predicates: ((r: Record<string, unknown>) => boolean)[] = [];
  let start = 0, end = Infinity, single = false;
  const q = {
    select: () => q,
    eq: (k: string, v: unknown) => { predicates.push(r => r[k] === v); return q; },
    in: (k: string, v: unknown[]) => { predicates.push(r => v.includes(r[k])); return q; },
    order: () => q,
    limit: (n: number) => { end = n - 1; return q; },
    range: (a: number, b: number) => { start = a; end = b; return q; },
    maybeSingle: () => { single = true; return q; },
    then(resolve: (v: unknown) => unknown) {
      state.calls.push(table);
      const rows = (state.rows[table] ?? []).filter(r => predicates.every(p => p(r))).slice(start, Math.min(end + 1, start + 7));
      return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: state.fail === table ? { message: "private database detail" } : null }).then(resolve);
    },
  }; return q;
} }) }));
import { getSubjectHomeBundle, listSubjectsForUser, listChannelsForSubject } from "./subjects";
beforeEach(() => {
 state.owner = "A"; state.fail = ""; state.calls = [];
 state.rows = { subjects: [{ id: "s", user_id: "A", name: "Brand", subject_type: "brand" }], subject_channels: [{ id: "c", subject_id: "s", channel_type: "instagram", locator: "brand", managed: true, account_id: "a" }], accounts: [{ id: "a", user_id: "A" }], audits: [{ id: "legacy", user_id: "A", account_id: "a", status: "ready", created_at: "2026-01-01" }] };
});
it.each(["A", "B", "admin"])("isolates subject and direct channel reads for %s", async owner => {
 state.owner = owner;
 expect((await listSubjectsForUser()).subjects.map(s => s.id)).toEqual(owner === "A" ? ["s"] : []);
 if (owner !== "A") {
   expect(await getSubjectHomeBundle("s")).toBeNull();
   expect(await listChannelsForSubject("s")).toEqual([]);
 }
});
it("does not mistake failed queries for empty workspaces or partial detail", async () => {
 state.fail = "subjects";
 await expect(listSubjectsForUser()).rejects.toThrow("Subject data could not be loaded");
 await expect(getSubjectHomeBundle("s")).rejects.toThrow("Subject data could not be loaded");
});
it.each(["subject_channels", "living_brief_versions", "context_update_proposals", "intelligence_runs", "audit_batches", "accounts", "audits"])("fails honestly when %s is unavailable", async table => {
 state.fail = table;
 await expect(getSubjectHomeBundle("s")).rejects.toThrow("Subject data could not be loaded");
});
it("paginates the complete subject list past the server cap", async () => {
 state.rows.subjects = Array.from({length: 16}, (_, i) => ({id: `s${i}`, user_id: "A", name: `Brand ${i}`, subject_type: "brand"}));
 expect((await listSubjectsForUser()).subjects).toHaveLength(16);
});
it("managed Instagram with a missing account requires reconnect, while observed targets stay public", async () => {
 expect((await listChannelsForSubject("s"))[0]).toMatchObject({connected: false, reconnectRequired: true});
 state.rows.subject_channels[0].managed = false;
 expect((await listChannelsForSubject("s"))[0]).toMatchObject({connected: false, reconnectRequired: false});
});
it("never trusts foreign account/connection health from a broad admin join", async () => {
 state.rows.subject_channels[0].accounts = {user_id: "B", ownership_status: "connected", ig_connection_id: "foreign", display_name: "Foreign secret", instagram_connections: {user_id: "B", is_active: true, connection_status: "connected", long_lived_expires_at: "2099-01-01"}};
 const channel = (await listChannelsForSubject("s"))[0];
 expect(channel.connected).toBe(false);
 expect(channel.displayName).not.toBe("Foreign secret");
});
it("paginates channels and brief versions instead of reporting a capped total", async () => {
 state.rows.subject_channels = Array.from({length: 16}, (_, i) => ({id: `c${i}`, subject_id: "s", channel_type: "instagram", locator: `brand${i}`, managed: true}));
 state.rows.living_brief_versions = Array.from({length: 16}, (_, i) => ({id: `v${i}`, subject_id: "s", version: i}));
 const bundle = await getSubjectHomeBundle("s");
 expect(bundle?.subject.channelCount).toBe(16);
 expect(bundle?.briefVersions).toHaveLength(16);
});
it("counts canonical duplicate channel locators consistently on list and detail", async () => {
 state.rows.subject_channels = ["@Brand", "https://instagram.com/brand/"].map((locator, i) => ({id: `c${i}`, subject_id: "s", channel_type: "instagram", locator, managed: true}));
 expect((await listSubjectsForUser()).subjects[0].channelCount).toBe(1);
 expect((await getSubjectHomeBundle("s"))?.subject.channelCount).toBe(1);
});
it.each(["scores", "recommendations", "decisions"])("does not show an empty %s panel after a failed child read", async table => {
 state.rows.intelligence_runs = [{id: "run", subject_id: "s"}];
 state.rows.recommendations = [{id: "rec", intelligence_run_id: "run", recommendation_ref: "r"}];
 state.fail = table;
 await expect(getSubjectHomeBundle("s")).rejects.toThrow("Subject data could not be loaded");
});
it("ignores legacy accounts owned by another tenant even if the audit owner matches", async () => {
 state.rows.accounts[0].user_id = "B";
 expect((await getSubjectHomeBundle("s"))?.reports).toEqual([]);
});
it("unions exact owned legacy history with paginated batch history, deduping without handle inference", async () => {
 state.rows.audit_batches = Array.from({length: 15}, (_, i) => ({ id: `b${i}`, subject_id: "s", user_id: "A" }));
 state.rows.batch_audits = state.rows.audit_batches.map((b, i) => ({batch_id: b.id, audit_id: `r${i}`}));
 state.rows.batch_audits.push({batch_id: "b0", audit_id: "legacy"}, {batch_id: "b0", audit_id: "foreign"});
 state.rows.audits.push(...Array.from({length: 15}, (_, i) => ({id: `r${i}`, user_id: "A", status: i === 0 ? "failed" : "ready", created_at: "2026-02-01"})), {id: "foreign", user_id: "B", account_id: "a", status: "ready"}, {id: "unassigned", user_id: "A", handle: "brand", status: "ready"});
 const result = await getSubjectHomeBundle("s");
 expect(result?.reports).toHaveLength(16);
 expect(new Set(result?.reports.map(r => r.id)).size).toBe(16);
 expect(result?.reports.find(r => r.id === "r0")).toMatchObject({status: "failed"});
});
