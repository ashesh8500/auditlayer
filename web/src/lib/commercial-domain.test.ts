import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { allowedReportTypesForProfile, auditLimitForProfile, effectivePlanForProfile, MAX_RETRIES } from "./domain";
afterEach(() => vi.useRealTimers());
it("uses the active trial plan even without gifts, and removes expired grants", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-19T12:00:00Z"));
  const profile = { plan: "free" as const, role: "client", account_type: "trial", gifted_audits: 0, trial_plan: "pro" as const, trial_report_types: ["enterprise" as const], trial_expires_at: "2026-09-20T00:00:00Z" };
  expect(auditLimitForProfile(profile)).toBe(15);
  expect(allowedReportTypesForProfile(profile)).toContain("enterprise");
  expect(auditLimitForProfile({ ...profile, gifted_audits: 3 })).toBe(15); // gifts are not infinity
  const expired = { ...profile, gifted_audits: 3, trial_expires_at: "2026-09-18T00:00:00Z" };
  expect(effectivePlanForProfile(expired)).toBe("free");
  expect(auditLimitForProfile(expired)).toBe(1);
  expect(allowedReportTypesForProfile(expired)).toEqual(["pulse"]);
});
it("keeps customer retry labels in parity with the executing worker", () => {
  const source = readFileSync(resolve(process.cwd(), "../worker/auditlayer_worker/core.py"), "utf8");
  expect(Number(source.match(/^MAX_RETRIES\s*=\s*(\d+)/m)?.[1])).toBe(MAX_RETRIES);
});
