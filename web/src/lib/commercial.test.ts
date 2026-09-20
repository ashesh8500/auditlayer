import { describe, expect, it } from "vitest";
import { commercial } from "./commercial";

describe("approved commercial contract", () => {
  it("defines monthly single-owner offers without a legacy public competitor", () => {
    expect(commercial.version).toBe("ALM-2026-09.v1");
    expect(Object.keys(commercial.plans)).toEqual(["free", "brand", "studio", "enterprise"]);
    expect([commercial.plans.free, commercial.plans.brand, commercial.plans.studio].map(p => [p.monthly_usd, p.brands, p.monthly_credits, p.owners])).toEqual([[0,1,500,1],[199,1,5000,1],[499,5,15000,1]]);
    expect(commercial.welcome_credits).toBe(500);
    expect(commercial.credits_per_usd).toBe(100);
    expect(commercial.run_ceiling_microusd).toBe(15000000);
    expect(commercial.plans.free.topup_cap_microusd).toBe(0);
    expect(commercial.plans.brand.topup_cap_microusd).toBe(50000000);
    expect(commercial.plans.studio.consumption_cap_microusd).toBe(300000000);
    expect(commercial.purchased_expiry).toBeNull();
  });
});
