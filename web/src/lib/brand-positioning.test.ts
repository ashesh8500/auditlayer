import { describe, expect, it } from "vitest";

import {
  PUBLIC_BRAND_KICKER,
  PUBLIC_METADATA_DESCRIPTION,
} from "./brand-positioning";

const RESTRICTED_VERTICAL_ONLY_POSITIONING =
  /for\s+(?:health|wellness|biohacking)|health,\s*wellness,\s*and\s*expert-led/i;

describe("public brand positioning", () => {
  it("positions AuditLayerMedia as a general brand and social media product", () => {
    expect(PUBLIC_BRAND_KICKER).toContain("Brand and social media intelligence");
    expect(PUBLIC_METADATA_DESCRIPTION).toContain(
      "brand and social media intelligence",
    );
  });

  it("does not present a specialist vertical as the market boundary", () => {
    expect(PUBLIC_BRAND_KICKER).not.toMatch(
      RESTRICTED_VERTICAL_ONLY_POSITIONING,
    );
    expect(PUBLIC_METADATA_DESCRIPTION).not.toMatch(
      RESTRICTED_VERTICAL_ONLY_POSITIONING,
    );
  });
});
