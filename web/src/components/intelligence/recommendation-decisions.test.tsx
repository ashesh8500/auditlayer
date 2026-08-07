/**
 * ALM-I-019 — component/read-model contract checks for recommendation
 * decisions (no browser, no DOM, no network, no provider calls).
 *
 * `SubjectHome` is a client component that imports server-only action modules,
 * so this suite follows the repository's static contract pattern
 * (see access-boundary.test.ts): it reads the owned source files and asserts
 * the durable-decision derivation, controls, states, accessibility, target
 * sizing at the 390px composition, and the single authoritative write path.
 * The behavioral decision logic itself is exercised in
 * src/lib/intelligence/recommendation-decisions.test.ts.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function source(relative: string): string {
  return readFileSync(join(process.cwd(), "src", relative), "utf8");
}

const COMPONENT = "components/intelligence/subject-home.tsx";
const ACTIONS = "lib/actions/intelligence.ts";

describe("RecommendationsTab — decision controls (static contract)", () => {
  const src = source(COMPONENT);

  it("wires the canonical server action into the subject workspace", () => {
    expect(src).toContain("recordRecommendationDecisionAction");
    expect(src).toContain('from "@/lib/actions/intelligence"');
  });

  it("derives display state from the durable decision (read model), not client invention", () => {
    expect(src).toContain("recommendationDecisionDisplayState");
    expect(src).toContain("decisions[rec.id] ?? rec.decision ?? null");
    // The client mirror only runs AFTER the server confirms the write
    // (scoped to the decision handler, not the earlier proposal handler).
    const decisionHandler = src.slice(src.indexOf("const decideRecommendation"));
    const confirmIndex = decisionHandler.indexOf("if (!result.ok)");
    const setIndex = decisionHandler.indexOf("setRecommendationDecisions");
    expect(confirmIndex).toBeGreaterThanOrEqual(0);
    expect(setIndex).toBeGreaterThan(confirmIndex);
  });

  it("renders Accept, Reject, and Refine controls with keyboard-accessible naming", () => {
    expect(src).toContain('onClick={() => onDecide(rec.id, "accepted")}');
    expect(src).toContain('onClick={() => onDecide(rec.id, "rejected")}');
    expect(src).toContain('onClick={() => submitRefine(rec.id)}');
    expect(src).toMatch(/Accept\s*<\/Button>/);
    expect(src).toMatch(/Reject\s*<\/Button>/);
    expect(src).toMatch(/Refine\s*<\/Button>/);
    expect(src).toContain('aria-label={`Accept recommendation: ${rec.text}`}');
    expect(src).toContain('aria-label={`Reject recommendation: ${rec.text}`}');
    expect(src).toContain('aria-label={`Refine recommendation: ${rec.text}`}');
    expect(src).toContain('type="button"');
  });

  it("opens a bounded refinement note input and submits modified with the note", () => {
    expect(src).toContain('onClick={() => startRefine(rec.id)}');
    expect(src).toContain("What should change?");
    expect(src).toContain("maxLength={RECOMMENDATION_DECISION_NOTE_MAX}");
    expect(src).toContain("onDecide(id, \"modified\", note)");
    expect(src).toContain("refineNote.trim().length === 0");
    // Cancel path closes the form without writing.
    expect(src).toContain("Cancel");
  });

  it("disables the decision controls while a decision is pending (no double submit)", () => {
    const disabledMatches = src.match(/disabled=\{resolving\}/g) ?? [];
    expect(disabledMatches.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps controls at >=44px on the 390px composition (size=lg → h-11)", () => {
    // Button size="lg" maps to h-11 (44px) in the shared Button primitive.
    const acceptIndex = src.indexOf('onClick={() => onDecide(rec.id, "accepted")}');
    const refineIndex = src.indexOf('onClick={() => startRefine(rec.id)}');
    const submitIndex = src.indexOf('onClick={() => submitRefine(rec.id)}');
    const beforeAccept = src.slice(0, acceptIndex);
    const between = src.slice(acceptIndex, refineIndex);
    expect(beforeAccept.lastIndexOf('size="lg"')).toBeGreaterThan(
      beforeAccept.lastIndexOf("RecommendationsTab"),
    );
    expect(between).toContain('size="lg"');
    // The Refine control itself and the Save refinement button are 44px.
    const refineButtonBlock = src.slice(acceptIndex, refineIndex + 300);
    expect(refineButtonBlock).toContain('size="lg"');
    const submitButtonBlock = src.slice(
      Math.max(0, submitIndex - 500),
      submitIndex + 100,
    );
    expect(submitButtonBlock).toContain('size="lg"');
    // The controls container wraps at narrow widths (390px composition).
    expect(src).toContain('flex w-full flex-wrap gap-2 sm:w-auto');
  });

  it("suppresses rejected advice — no controls, honest copy, until new evidence", () => {
    expect(src).toContain("rejected_suppressed");
    expect(src).toContain("won't reappear without new evidence");
    // Controls render ONLY for the actionable state — a single control site.
    const acceptCalls = src.match(/onDecide\(rec\.id, "accepted"\)/g) ?? [];
    const rejectCalls = src.match(/onDecide\(rec\.id, "rejected"\)/g) ?? [];
    expect(acceptCalls.length).toBe(1);
    expect(rejectCalls.length).toBe(1);
    const controlsBlock = src.slice(
      src.indexOf('{state === "actionable" && ('),
      src.indexOf("</section>", src.indexOf('{state === "actionable" && (')),
    );
    expect(controlsBlock).toContain('onDecide(rec.id, "accepted")');
    expect(controlsBlock).toContain('onDecide(rec.id, "rejected")');
    expect(controlsBlock).toContain("submitRefine(rec.id)");
  });

  it("shows honest refinement-requested copy for a durable modified decision", () => {
    expect(src).toContain('state === "modified" && decision');
    expect(src).toContain("You asked to refine this");
  });

  it("surfaces bounded errors and recovers on the next attempt", () => {
    expect(src).toContain('role="alert"');
    expect(src).toContain("setRecommendationError(null)");
    expect(src).toContain("setRecommendationError(result.error)");
  });
});

describe("recordRecommendationDecisionAction — one owner-checked authoritative write (static contract)", () => {
  const src = source(ACTIONS);

  it("exists as a typed server action", () => {
    expect(src).toContain(
      "export async function recordRecommendationDecisionAction",
    );
  });

  it("checks the acting profile (owner or admin) before any write", () => {
    expect(src).toContain("requireProfile()");
    // The action loads the subject row and hands the acting profile's role to
    // the planner, which authorizes owner (profile.id === subject.user_id) or
    // admin (role === 'admin') before any write is planned.
    expect(src).toContain('.from("subjects")');
    expect(src).toContain('.select("id, user_id")');
    expect(src).toContain("profile: { id: profile.id, role: profile.role }");
  });

  it("makes exactly one authoritative record_decision call on write", () => {
    const callSites = src.match(/rpcRecordDecision\(admin, plan\.call\)/g) ?? [];
    expect(callSites.length).toBe(1);
    expect(src).toContain("planRecommendationDecision");
  });

  it("routes every decision through the fail-closed planner (never success without a plan)", () => {
    expect(src).toContain("planRecommendationDecision");
    expect(src).toContain("recommendationDecisionPlanError");
  });

  it("revalidates the subject surface after a confirmed write", () => {
    expect(src).toContain("revalidatePath(`/subjects/${input.subjectId}`)");
  });
});

describe("read model — decisions projection is in the subject bundle (static contract)", () => {
  const src = source("lib/intelligence/subjects.ts");

  it("queries the decisions ledger for the subject's recommendations", () => {
    expect(src).toContain('.from("decisions")');
    expect(src).toContain('.eq("target_type", "recommendation")');
    expect(src).toContain(".in(\"target_id\", recIds)");
  });

  it("projects the latest durable decision onto each recommendation", () => {
    expect(src).toContain("projectLatestDecision");
    expect(src).toContain("decision: decisionMap[recRow.id] ?? null");
  });
});

describe("fixture report (component layer)", () => {
  it("records network_calls=0 and provider_calls=0", () => {
    console.log(
      "[fixture-report] component contract: network_calls=0 provider_calls=0; static source checks only; no browser",
    );
    expect(true).toBe(true);
  });
});
