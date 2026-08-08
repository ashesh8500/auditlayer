/**
 * Tenant-scope regression contract for subject-backed product flows.
 *
 * Admins have a broad database policy for founder operations, but customer
 * product routes still represent one user's workspace. These assertions keep
 * unowned subjects out of those routes and require batch ownership to be
 * checked before any entitled audit is created.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function source(relative: string): string {
  return readFileSync(join(process.cwd(), "src", relative), "utf8");
}

function functionSection(
  src: string,
  startMarker: string,
  endMarker: string,
): string {
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

const actions = source("lib/actions/intelligence.ts");
const subjects = source("lib/intelligence/subjects.ts");

describe("subject workspace tenant scope", () => {
  it("checks ownership and delegates all batch mutations to one atomic RPC", () => {
    const section = functionSection(
      actions,
      "export async function prepareAndSubmitIntelligenceBatch",
      "export async function resolveBriefProposalAction",
    );
    const ownershipCheckAt = section.indexOf('.from("subjects")');
    const atomicSubmitAt = section.indexOf("rpcSubmitEntitledAuditBatch");

    expect(ownershipCheckAt).toBeGreaterThanOrEqual(0);
    expect(atomicSubmitAt).toBeGreaterThan(ownershipCheckAt);

    const preflight = section.slice(ownershipCheckAt, atomicSubmitAt);
    expect(preflight).toContain('.eq("id", existingSubjectId)');
    expect(preflight).toContain('.eq("user_id", profile.id)');
    expect(preflight).toContain('error: "Subject not found."');
    expect(section).not.toContain('admin.rpc("submit_entitled_audit"');
    expect(section).not.toContain("rpcLinkSubjectChannel");
    expect(section).not.toContain('.from("audit_events").insert');
    expect(section).not.toContain("rpcSubmitAuditBatch");
  });

  it("lists only subjects owned by the signed-in profile, including for admins", () => {
    const section = functionSection(
      subjects,
      "export async function listSubjectsForUser",
      "export async function listChannelsForSubject",
    );

    expect(subjects).toContain('import { requireProfile } from "@/lib/auth";');
    expect(section).toContain("const profile = await requireProfile();");
    expect(section).toContain('.eq("user_id", profile.id)');
  });

  it("owner-scopes subject detail and wizard context before loading children", () => {
    const detailSection = functionSection(
      subjects,
      "export async function getSubjectHomeBundle",
      "const [",
    );
    expect(detailSection).toContain("const profile = await requireProfile();");
    expect(detailSection).toContain('.eq("user_id", profile.id)');

    const wizardSection = functionSection(
      actions,
      "export async function loadSubjectWizardContextAction",
      "/**\n * Record a customer decision",
    );
    expect(wizardSection).toContain("const profile = await requireProfile();");
    expect(wizardSection).toContain('.eq("user_id", profile.id)');
  });
});
