import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ status: "pending", verify: true, owned: true, rpc: vi.fn(), bump: vi.fn(), revalidate: vi.fn(), filters: [] as string[][] }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
vi.mock("@/lib/resources/mutation-revision", () => ({ bumpResourceRevision: state.bump }));
vi.mock("@/lib/auth", () => ({ requireProfile: async () => ({ id: "owner", role: "admin" }) }));
vi.mock("@/lib/env", () => ({ isSupabaseAdminConfigured: () => true }));
vi.mock("@/lib/intelligence/subjects", () => ({ listChannelsForSubject: vi.fn(), listBriefVersionsForSubject: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: state.rpc, from: (table: string) => {
  let selection = "";
  const q = { select: (fields: string) => { selection = fields; return q; }, eq: (key: string, value: string) => { state.filters.push([table, key, value]); return q; }, maybeSingle: async () => ({ data: table === "subjects" ? (state.owned ? { id: "subject" } : null) : selection === "status" ? { status: state.verify ? state.status : "pending" } : { subject_id: "subject" }, error: null }) };
  return q;
} }) }));
import { resolveBriefProposalAction } from "./intelligence";
beforeEach(() => {
  state.status = "pending"; state.verify = true; state.owned = true; state.filters = [];
  state.bump.mockReset(); state.revalidate.mockReset();
  state.rpc.mockReset().mockImplementation(async (_name, args) => { state.status = args.p_status; return { data: null, error: null }; });
});
it.each(["accepted", "rejected"] as const)("returns verified refresh and bumps the subject after %s", async status => {
  const result = await resolveBriefProposalAction({ proposalId: "11111111-1111-4111-8111-111111111111", status });
  expect(result).toEqual({ ok: true, mode: "live", subjectId: "subject", refresh: true });
  expect(state.filters).toContainEqual(["subjects", "user_id", "owner"]);
  expect(state.bump).toHaveBeenCalledWith("subjects");
  expect(state.revalidate).toHaveBeenCalledWith("/subjects/subject");
  expect(state.revalidate).toHaveBeenCalledWith("/audits/new");
});
it("does not claim success or bump cache when proposal readback disagrees", async () => {
  state.verify = false;
  expect((await resolveBriefProposalAction({ proposalId: "11111111-1111-4111-8111-111111111111", status: "accepted" })).ok).toBe(false);
  expect(state.bump).not.toHaveBeenCalled();
});
it("denies a foreign proposal even for an admin customer route", async () => {
  state.owned = false;
  expect((await resolveBriefProposalAction({ proposalId: "11111111-1111-4111-8111-111111111111", status: "accepted" })).ok).toBe(false);
  expect(state.rpc).not.toHaveBeenCalled();
});
