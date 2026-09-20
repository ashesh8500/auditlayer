import { describe, expect, it } from "vitest";
import { modelCatalog, enrollment } from "./catalog";
import { validate } from "@/lib/workspace-contracts";
describe("workspace availability", () => {
  it("publishes only canonical unavailable candidates without invented rates", () => {
    expect(modelCatalog).toHaveLength(2);
    for (const option of modelCatalog) {
      expect(validate("ModelOption", option)).toEqual(option);
      expect(option.availability).toBe("unavailable");
      expect(option.rate_card_version).toBeNull();
      expect(option.allowed_tools).toEqual([]);
    }
    expect(enrollment.available).toBe(false);
    expect(enrollment.blockers).toContain("Final retention, expiry and refund terms are not approved.");
  });
});
