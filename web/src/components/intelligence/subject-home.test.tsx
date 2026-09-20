import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("@/lib/actions/intelligence", () => ({resolveBriefProposalAction: vi.fn(), recordRecommendationDecisionAction: vi.fn(), saveLivingBriefAction: vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
import { SubjectHome } from "./subject-home";
const data = {
 subject: {id: "s", name: "Brand", type: "brand" as const, avatarUrl: null, channelCount: 1, lastAuditAt: null},
 channels: [{id: "c", subjectId: "s", platform: "instagram" as const, handle: "brand", displayName: "Brand", url: null, avatarUrl: null, connected: false, reconnectRequired: true, ownershipStatus: "managed" as const}],
 briefVersions: [], proposals: [], scores: [], recommendations: [], sinceLast: [], reports: [],
};
it("makes reconnect actionable at canonical Connections without guessing an identity", () => {
 const html = renderToStaticMarkup(<SubjectHome subjectId="s" data={data} />);
 expect(html).toMatch(/href="\/settings\/connections"[^>]*>Reconnect/);
 expect(html).not.toContain("Public research");
});
it("labels non-ready runs honestly and shows exact loaded history count", () => {
 const html = renderToStaticMarkup(<SubjectHome subjectId="s" data={{...data, reports: [{id: "r", auditId: "r", status: "failed", channelLabel: "@brand", reportVersion: 1, promptVersion: null, createdAt: "2026-01-01", href: "/audits/r"}]}} />);
 expect(html).toContain("failed");
 expect(html).toContain("View run");
 expect(html).not.toContain("Open report");
 expect(html).toContain("1 audit run");
});
it("distinguishes an empty report archive", () => {
 expect(renderToStaticMarkup(<SubjectHome subjectId="s" data={data} />)).toContain("No audit history yet");
});
