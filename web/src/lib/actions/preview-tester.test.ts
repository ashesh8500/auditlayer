import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ bump: vi.fn(), plan: vi.fn(), seed: vi.fn(), allowed: true }));
vi.mock("@/lib/auth", () => ({ requireProfile: async () => ({ id: "fixture", email: "fixture@example.test" }) }));
vi.mock("@/lib/env", () => ({ isPreviewLoginAllowed: () => m.allowed, isPreviewTesterEmail: () => true, isSupabaseAdminConfigured: () => true }));
vi.mock("@/lib/auth/preview-seed", () => ({ applyPreviewTesterPlan: m.plan, seedPreviewDemoSubjects: m.seed }));
vi.mock("@/lib/resources/mutation-revision", () => ({ bumpResourceRevision: m.bump }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { reseedPreviewDemoSubjects, setPreviewTesterPlan } from "./preview-tester";
beforeEach(() => { vi.clearAllMocks(); m.allowed = true; m.seed.mockResolvedValue({ subjectIds: ["one"] }); });
it("invalidates subjects only after successful reseed", async () => {
 expect((await reseedPreviewDemoSubjects({ status: "idle" }, new FormData())).status).toBe("ok");
 expect(m.bump).toHaveBeenCalledWith("subjects");
});
it("invalidates reports after plan change", async () => {
 const f = new FormData(); f.set("plan", "pro");
 expect((await setPreviewTesterPlan({ status: "idle" }, f)).status).toBe("ok");
 expect(m.bump).toHaveBeenCalledWith("reports");
});
it("does not seed outside preview or on failed mutation", async () => {
 m.allowed = false;
 expect((await reseedPreviewDemoSubjects({ status: "idle" }, new FormData())).status).toBe("error");
 expect(m.seed).not.toHaveBeenCalled();
 expect(m.bump).not.toHaveBeenCalled();
 m.allowed = true; m.seed.mockRejectedValueOnce(new Error("failed"));
 expect((await reseedPreviewDemoSubjects({ status: "idle" }, new FormData())).status).toBe("error");
 expect(m.bump).not.toHaveBeenCalled();
});
