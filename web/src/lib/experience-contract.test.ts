import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  EXPERIENCE_CONTRACT_VERSION,
  scanExperienceContract,
  EXPERIENCE_EXCEPTIONS,
  type ExperienceReport,
} from "./experience-contract";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("experience-contract scanner", () => {
  it("covers every current route page and state file", () => {
    const report = scanExperienceContract(webRoot);
    expect(report.routes.total).toBe(28);
    expect(report.routes.files.length).toBe(28);
    // Every route file is relative to web/ and exists on disk.
    for (const f of report.routes.files) {
      expect(f.startsWith("src/app/")).toBe(true);
      expect(f.endsWith("page.tsx")).toBe(true);
    }
    expect(report.stateFiles.loading.length).toBe(4);
    expect(report.stateFiles.error.length).toBe(0);
    expect(report.stateFiles.globalError.length).toBe(1);
  });

  it("enumerates every shared UI primitive and shared component", () => {
    const report = scanExperienceContract(webRoot);
    expect(report.primitives.ui.length).toBeGreaterThanOrEqual(8); // button/card/badge/input/label/textarea/led + new primitives
    expect(report.primitives.shared.length).toBeGreaterThan(0);
  });

  it("evaluates every declared rule deterministically", () => {
    const report = scanExperienceContract(webRoot);
    const expectedRules = [
      "route-coverage",
      "semantic-color",
      "radius",
      "panel",
      "header",
      "button",
      "banner",
      "state",
      "focus",
      "target",
    ];
    expect(Object.keys(report.rules).sort()).toEqual(expectedRules.sort());
  });

  it("is deterministic across runs (no timestamps, no absolute paths)", () => {
    const a = scanExperienceContract(webRoot);
    const b = scanExperienceContract(webRoot);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const serialized = JSON.stringify(a);
    // No timestamps.
    expect(serialized).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    // No absolute environment paths.
    expect(serialized).not.toContain("/home/");
    expect(serialized).not.toContain("worktrees/");
  });

  it("reports zero violations or only registered exceptions per rule", () => {
    const report = scanExperienceContract(webRoot);
    for (const [rule, r] of Object.entries(report.rules)) {
      expect(r.violations.length).toBe(0);
      // Every exception maps back to a registry entry for that rule.
      for (const id of r.exceptionIds) {
        const entry = EXPERIENCE_EXCEPTIONS.find((e) => e.id === id);
        expect(entry, `exception ${id} must exist`).toBeDefined();
        expect(entry!.rule, `exception ${id} must match rule ${rule}`).toBe(rule);
      }
    }
  });

  it("reports no stale exceptions (registry matches reality)", () => {
    const report = scanExperienceContract(webRoot);
    const used = new Set<string>();
    for (const r of Object.values(report.rules)) {
      for (const id of r.exceptionIds) used.add(id);
    }
    const stale = EXPERIENCE_EXCEPTIONS.filter((e) => !used.has(e.id));
    expect(stale.map((e) => e.id)).toEqual([]);
  });

  it("reports the browser-only 44px probe as UNKNOWN, not as proof", () => {
    const report = scanExperienceContract(webRoot);
    expect(report.unknownBrowserOnly.length).toBeGreaterThan(0);
    const targetUnknown = report.unknownBrowserOnly.find((u) => u.rule === "target");
    expect(targetUnknown).toBeDefined();
    expect(targetUnknown!.detail).toContain("Playwright");
    expect(targetUnknown!.detail).toContain("390px");
  });

  it("reports correction tips that are non-empty and deterministic", () => {
    const report = scanExperienceContract(webRoot);
    expect(report.correctionTips.length).toBeGreaterThan(0);
    expect([...report.correctionTips].sort()).toEqual(report.correctionTips);
  });

  it("includes contract version and scanRoot", () => {
    const report = scanExperienceContract(webRoot);
    expect(report.contract).toBe("experience-contract");
    expect(report.version).toBe(EXPERIENCE_CONTRACT_VERSION);
    expect(report.scanRoot).toBe("web/");
  });
});

describe("experience-contract artifact", () => {
  it("matches the committed JSON report shape", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const artifact = require("../../artifacts/experience-contract.json") as ExperienceReport;
    expect(artifact.contract).toBe("experience-contract");
    expect(artifact.version).toBe(EXPERIENCE_CONTRACT_VERSION);
    expect(artifact.routes.total).toBe(28);
  });
});
