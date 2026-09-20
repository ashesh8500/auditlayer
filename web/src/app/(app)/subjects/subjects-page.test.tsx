import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({fail: false}));
vi.mock("@/lib/auth", () => ({getProfile: async () => ({id: "A"})}));
vi.mock("@/lib/intelligence/subjects", () => ({listSubjectsForUser: async () => {
 if (state.fail) throw new Error("query failed");
 return {subjects: [], source: "live"};
}}));
import Page from "./page";
import { GET } from "@/app/api/resources/subjects/route";
import { useWorkspaceQuery } from "@/components/workspace-resources";
vi.mock("@/components/workspace-resources", () => ({ useWorkspaceQuery: vi.fn() }));
Object.assign(globalThis, { React });
async function SubjectsPage() {
 const response = await GET();
 const dto = await response.json();
 vi.mocked(useWorkspaceQuery).mockReturnValue({ data: response.ok ? dto : undefined, error: response.ok ? null : new Error("Unavailable"), dataUpdatedAt: 0, refetch: vi.fn() } as never);
 return Page();
}
it("empty workspace offers Connections without pretending a failed read is empty", async () => {
 const html = renderToStaticMarkup(await SubjectsPage());
 expect(html).toContain("No subjects yet");
 expect(html).toContain('href="/settings/connections"');
 state.fail = true;
 const failed = renderToStaticMarkup(await SubjectsPage());
 expect(failed).toContain("Subjects could not be loaded");
 expect(failed).not.toContain("No subjects yet");
 expect(failed).not.toContain("subjects-content");
});
it("has a recoverable route error state distinct from empty and loading", async () => {
 const {default: ErrorState} = await import("./error");
 const {default: LoadingState} = await import("./loading");
 const html = renderToStaticMarkup(<ErrorState reset={() => {}} error={new Error("secret database detail")} />);
 expect(html).toContain("Retry");
 expect(html).toContain("could not be loaded");
 expect(html).not.toContain("No subjects yet");
 expect(html).not.toContain("secret database detail");
 expect(renderToStaticMarkup(<LoadingState />)).toContain('role="status"');
});
