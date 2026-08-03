import { describe, expect, it } from "vitest";

import {
  projectBriefField,
  projectLivingBriefContent,
  contentToKernelPayload,
} from "./brief-project";
import { emptyBriefContent } from "./brief-project";

describe("projectBriefField", () => {
  it("never returns raw JSON for nested objects", () => {
    const text = projectBriefField({
      name: "Narin Fazlalipour",
      role: "Co-founder",
      niche: "biohacking",
    });
    expect(text).toContain("Narin Fazlalipour");
    expect(text).not.toContain("{");
    expect(text).not.toContain('"name"');
  });

  it("joins string arrays as prose lines", () => {
    expect(projectBriefField(["Grow IG", "Ship Standard reports"])).toBe(
      "Grow IG\nShip Standard reports",
    );
  });

  it("prefers summary fields", () => {
    expect(projectBriefField({ summary: "Clinical wellness brand." })).toBe(
      "Clinical wellness brand.",
    );
  });
});

describe("projectLivingBriefContent", () => {
  it("maps identity extras into vision/voice/success", () => {
    const content = projectLivingBriefContent("brand", {
      identity: {
        summary: "AuditLayerMedia builds creator audits.",
        vision: "Become the trusted research desk.",
        voice: "Clinical-calm.",
        success_criteria: "Connected IG QA path works.",
      },
      audience: { summary: "Wellness creators." },
      positioning: { summary: "Domain-calibrated." },
      offers: ["Pulse", "Standard"],
      goals: ["Grow @auditlayermedia"],
      constraints: ["No customer-facing JSON"],
      experiments: ["Preview tester setup"],
      decisions: ["Living Brief is a story board"],
    });

    expect(content.identity).toContain("AuditLayerMedia");
    expect(content.vision).toContain("research desk");
    expect(content.voice).toContain("Clinical-calm");
    expect(content.successCriteria).toContain("Connected IG");
    expect(content.goals).toContain("@auditlayermedia");
    expect(content.plannedChanges).toContain("story board");
    expect(content.identity).not.toContain("{");
    expect(content.offers).toBe("Pulse\nStandard");
  });
});

describe("contentToKernelPayload", () => {
  it("round-trips narrative fields into kernel-shaped JSON", () => {
    const content = emptyBriefContent("brand");
    content.identity = "AuditLayerMedia builds creator audits.";
    content.audience = "Wellness creators.";
    content.positioning = "Domain-calibrated.";
    content.offers = "Pulse\nStandard";
    content.goals = "Grow IG";
    content.vision = "Research desk";
    content.voice = "Clinical-calm";
    content.successCriteria = "Clear next move";
    content.constraints = "No hype";
    content.activeExperiments = "Subject home first";
    content.plannedChanges = "Ship Living Brief edit";

    const payload = contentToKernelPayload(content);
    expect(payload.identity.summary).toContain("AuditLayerMedia");
    expect(payload.identity.vision).toBe("Research desk");
    expect(payload.offers).toEqual(["Pulse", "Standard"]);
    expect(payload.goals).toEqual(["Grow IG"]);
    expect(payload.decisions).toEqual(["Ship Living Brief edit"]);
  });
});
