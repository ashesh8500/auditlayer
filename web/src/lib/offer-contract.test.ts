import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  OFFER_CONTRACT_VERSION,
  OFFER_MANIFEST,
  ONE_TIME_OFFERS,
  PLAN_OFFERS,
  TRIAL_OVERLAY_RULES,
  deriveBlueprintCopy,
  deriveEnterpriseCopy,
  derivePublicPricing,
  renderablePromises,
  unsupportedPromises,
  validateOfferContract,
  type EmpiricalGap,
  type EvidenceRef,
  type OfferPromiseStatus,
  type PlanOffer,
} from "./offer-contract";
import { PLAN_PRICES } from "./offer-pricing";
import {
  PLAN_LIMITS,
  allowedReportTypes,
  allowedReportTypesForProfile,
  effectivePlanForProfile,
  type Plan,
  type ReportType,
} from "./domain";

// ---------------------------------------------------------------------------
// Static SQL parity helpers (local static SQL inspection only — no live SQL)
// ---------------------------------------------------------------------------

function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "supabase", "migrations"))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not locate repository root from ${process.cwd()}`);
}

const ROOT = repoRoot();
const SQL_PATH = join(
  ROOT,
  "supabase",
  "migrations",
  "0022_commercial_entitlements.sql",
);
const SQL = readFileSync(SQL_PATH, "utf8");

/** Extract a `case` block body starting at the anchor (up to its `end;`). */
function extractCaseBlock(sql: string, anchor: string): string {
  const start = sql.indexOf(anchor);
  expect(start, `SQL anchor not found: ${anchor}`).toBeGreaterThan(-1);
  const body = sql.slice(start + anchor.length);
  const end = body.indexOf("end;");
  expect(end, `SQL block end not found after: ${anchor}`).toBeGreaterThan(-1);
  return body.slice(0, end);
}

/** Parse `when '<key>' then <value>` lines out of a case block (line-scoped). */
function whenMap(block: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /when\s+'([^']+)'\s+then\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    map.set(m[1], m[2].trim());
  }
  return map;
}

const PLANS: Plan[] = ["free", "starter", "pro", "enterprise"];
const ALL_OFFERS: PlanOffer[] = PLANS.map((plan) => PLAN_OFFERS[plan]);
const ALL_OFFER_LIKE = [...ALL_OFFERS, ...ONE_TIME_OFFERS];

function allEvidenceRefs(): EvidenceRef[] {
  const refs: EvidenceRef[] = [];
  for (const offer of ALL_OFFER_LIKE) {
    for (const promise of offer.promises) refs.push(...promise.evidence);
    for (const gap of offer.empirical) refs.push(...gap.evidence);
    if ("auditLimit" in offer) refs.push(...offer.auditLimit.evidence);
    if ("reportTypes" in offer) refs.push(...offer.reportTypes.evidence);
    if ("trialOverlay" in offer) refs.push(...offer.trialOverlay.evidence);
  }
  return refs;
}

// ---------------------------------------------------------------------------
// Contract coverage
// ---------------------------------------------------------------------------

describe("offer contract coverage", () => {
  it("declares a semver contract version", () => {
    expect(OFFER_CONTRACT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(OFFER_MANIFEST.version).toBe(OFFER_CONTRACT_VERSION);
  });

  it("covers 4/4 plans with names and prices", () => {
    const names = PLANS.map((plan) => PLAN_OFFERS[plan].name);
    expect(names).toEqual(["Pulse", "Starter", "Pro", "Enterprise"]);
    for (const plan of PLANS) {
      expect(PLAN_OFFERS[plan].price.display.length).toBeGreaterThan(0);
    }
  });

  it("covers the one-time Blueprint offer with a purchase path", () => {
    const blueprint = ONE_TIME_OFFERS.find((o) => o.id === "blueprint");
    expect(blueprint).toBeDefined();
    expect(blueprint!.price.amountUsd).toBe(79);
    expect(blueprint!.purchasePath).toBe("/support?topic=blueprint");
  });

  it("keeps every plan offer deterministically typed", () => {
    for (const offer of ALL_OFFERS) {
      expect(offer.auditLimit.status).toBe("enforced");
      expect(offer.reportTypes.status).toBe("enforced");
      expect(offer.trialOverlay.evidence.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Price parity (web / Stripe)
// ---------------------------------------------------------------------------

describe("price parity", () => {
  it("agrees with the canonical self-serve price table (2/2 prices)", () => {
    expect(PLAN_PRICES).toHaveLength(2);
    const priceByPlan = new Map(PLAN_PRICES.map((row) => [row.plan, row.amount]));
    expect(priceByPlan.get("starter")).toBe(30);
    expect(priceByPlan.get("pro")).toBe(50);
    for (const row of PLAN_PRICES) {
      expect(PLAN_OFFERS[row.plan].price.amountUsd).toBe(row.amount);
      expect(PLAN_OFFERS[row.plan].price.mode).toBe("self_serve");
      expect(PLAN_OFFERS[row.plan].price.cadence).toBe("month");
    }
  });

  it("keeps free self-serve and enterprise contact-sales", () => {
    expect(PLAN_OFFERS.free.price.amountUsd).toBe(0);
    expect(PLAN_OFFERS.free.price.mode).toBe("self_serve");
    expect(PLAN_OFFERS.enterprise.price.amountUsd).toBeNull();
    expect(PLAN_OFFERS.enterprise.price.mode).toBe("contact_sales");
    expect(PLAN_OFFERS.enterprise.price.cadence).toBe("contact");
  });

  it("keeps stripe.ts re-exporting the canonical price table", () => {
    const stripeSource = readFileSync(
      join(ROOT, "web", "src", "lib", "stripe.ts"),
      "utf8",
    );
    expect(stripeSource).toContain('from "@/lib/offer-pricing"');
    expect(stripeSource).toContain("PLAN_PRICES");
    expect(stripeSource).toContain("priceIdForPlan");
    expect(stripeSource).toContain("planForPriceId");
  });
});

// ---------------------------------------------------------------------------
// Domain parity (web runtime entitlements)
// ---------------------------------------------------------------------------

describe("domain parity", () => {
  it("audit limits agree with domain.ts for 4/4 plans", () => {
    for (const plan of PLANS) {
      expect(PLAN_OFFERS[plan].auditLimit.value).toBe(PLAN_LIMITS[plan]);
    }
    expect(PLAN_LIMITS).toEqual({ free: 1, starter: 5, pro: 15, enterprise: 10000 });
  });

  it("report-type access agrees with domain.ts for 4/4 plans", () => {
    for (const plan of PLANS) {
      expect(PLAN_OFFERS[plan].reportTypes.types).toEqual(
        allowedReportTypes(plan),
      );
    }
  });

  it("pro is a strict superset of starter entitlements", () => {
    const starterTypes = PLAN_OFFERS.starter.reportTypes.types;
    const proTypes = PLAN_OFFERS.pro.reportTypes.types;
    for (const type of starterTypes) {
      expect(proTypes).toContain(type);
    }
    expect(PLAN_OFFERS.pro.auditLimit.value).toBeGreaterThan(
      PLAN_OFFERS.starter.auditLimit.value,
    );
  });

  it("enterprise includes every report type", () => {
    expect(PLAN_OFFERS.enterprise.reportTypes.types).toHaveLength(5);
    for (const type of [
      "pulse",
      "standard",
      "extended",
      "enterprise",
      "blueprint",
    ] as ReportType[]) {
      expect(PLAN_OFFERS.enterprise.reportTypes.types).toContain(type);
    }
  });
});

// ---------------------------------------------------------------------------
// SQL entitlement parity (static inspection of migration 0022)
// ---------------------------------------------------------------------------

describe("SQL entitlement parity", () => {
  it("reads the service-role entitlement migration", () => {
    expect(existsSync(SQL_PATH)).toBe(true);
    expect(SQL).toContain("submit_entitled_audit");
  });

  it("SQL plan_limit agrees with domain limits for 4/4 plans", () => {
    const block = extractCaseBlock(SQL, "plan_limit := case effective_plan");
    const map = whenMap(block);
    for (const plan of PLANS) {
      expect(map.get(plan), `SQL plan_limit for ${plan}`).toBe(
        String(PLAN_LIMITS[plan]),
      );
    }
  });

  it("SQL allowed_types agrees with domain report types for 4/4 plans", () => {
    const block = extractCaseBlock(SQL, "allowed_types := case effective_plan");
    const map = whenMap(block);
    for (const plan of PLANS) {
      const expected = `array['${allowedReportTypes(plan).join("', '")}']::text[]`;
      expect(map.get(plan), `SQL allowed_types for ${plan}`).toBe(expected);
    }
  });

  it("SQL effective_plan treats admin as enterprise and active trial as override", () => {
    const block = extractCaseBlock(SQL, "effective_plan := case");
    expect(block).toContain("'admin' then 'enterprise'");
    expect(block).toContain("then profile_row.trial_plan");
    expect(block).toContain("else profile_row.plan");
  });

  it("SQL unions trial report types while a trial is active", () => {
    expect(SQL).toContain(
      "allowed_types := array(select distinct unnest(allowed_types || profile_row.trial_report_types));",
    );
  });

  it("SQL fails closed on invalid report types and over-limit usage", () => {
    expect(SQL).toContain("raise exception 'invalid_report_type'");
    expect(SQL).toContain("raise exception 'report_type_not_entitled'");
    expect(SQL).toContain("raise exception 'audit_limit_reached'");
  });

  it("SQL redemption copies offer plan/types/days into the expiring trial", () => {
    expect(SQL).toContain("trial_plan = offer.offer_plan");
    expect(SQL).toContain("trial_report_types = offer.report_types");
    expect(SQL).toContain("trial_expires_at = now() + make_interval(days => offer.access_days)");
  });
});

// ---------------------------------------------------------------------------
// Trial overlay rules
// ---------------------------------------------------------------------------

describe("trial overlay rules", () => {
  it("declares all six overlay behaviors", () => {
    expect(TRIAL_OVERLAY_RULES.adminTreatedAsEnterprise).toBe(true);
    expect(TRIAL_OVERLAY_RULES.activeTrialPlanOverridesBase).toBe(true);
    expect(TRIAL_OVERLAY_RULES.activeTrialReportTypesUnionedWithBase).toBe(true);
    expect(TRIAL_OVERLAY_RULES.expiredTrialIgnored).toBe(true);
    expect(TRIAL_OVERLAY_RULES.giftedAuditsConsumedBeforePlanCap).toBe(true);
    expect(TRIAL_OVERLAY_RULES.adminsBypassPlanCaps).toBe(true);
  });

  it("domain unions active trial report types into the base entitlement", () => {
    const profile = {
      plan: "starter" as Plan,
      role: "client",
      trial_plan: "pro" as Plan,
      trial_report_types: ["extended"] as ReportType[],
      trial_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    };
    expect(effectivePlanForProfile(profile)).toBe("pro");
    expect(allowedReportTypesForProfile(profile)).toEqual([
      "pulse",
      "standard",
      "extended",
      "blueprint",
    ]);
  });

  it("domain ignores expired trials", () => {
    const profile = {
      plan: "starter" as Plan,
      role: "client",
      trial_plan: "pro" as Plan,
      trial_report_types: ["extended"] as ReportType[],
      trial_expires_at: new Date(Date.now() - 86_400_000).toISOString(),
    };
    expect(effectivePlanForProfile(profile)).toBe("starter");
    expect(allowedReportTypesForProfile(profile)).toEqual(["pulse", "standard"]);
  });

  it("domain treats admins as enterprise", () => {
    const profile = {
      plan: "free" as Plan,
      role: "admin",
    };
    expect(effectivePlanForProfile(profile)).toBe("enterprise");
    expect(allowedReportTypesForProfile(profile)).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Evidence status
// ---------------------------------------------------------------------------

describe("evidence status", () => {
  it("classifies every promise as enforced, observed, or unknown", () => {
    const valid: OfferPromiseStatus[] = ["enforced", "observed", "unknown"];
    for (const offer of ALL_OFFER_LIKE) {
      for (const promise of offer.promises) {
        expect(valid, `${promise.id} status`).toContain(promise.status);
        expect(promise.evidence.length, `${promise.id} evidence`).toBeGreaterThan(0);
      }
    }
  });

  it("requires an explanation note on every UNKNOWN promise", () => {
    for (const offer of ALL_OFFER_LIKE) {
      for (const promise of offer.promises) {
        if (promise.status === "unknown") {
          expect(promise.note, `${promise.id} note`).toBeTruthy();
        }
      }
    }
  });

  it("types empirical business gaps as UNKNOWN for every offer", () => {
    const gapIds: EmpiricalGap["id"][] = [
      "delivery_cost",
      "funnel",
      "willingness_to_pay",
      "efficacy",
    ];
    for (const offer of ALL_OFFER_LIKE) {
      const ids = offer.empirical.map((gap) => gap.id);
      const key = "plan" in offer ? offer.plan : offer.id;
      for (const id of gapIds) {
        expect(ids, `${key} gap ${id}`).toContain(id);
      }
      for (const gap of offer.empirical) {
        expect(gap.status).toBe("unknown");
        expect(gap.note.length).toBeGreaterThan(0);
      }
    }
  });

  it("points every evidence reference at a real repository file", () => {
    const refs = allEvidenceRefs();
    expect(refs.length).toBeGreaterThan(20);
    for (const ref of refs) {
      expect(
        existsSync(join(ROOT, ref.path)),
        `evidence ref missing: ${ref.path}`,
      ).toBe(true);
    }
  });

  it("reports the full promise classification from the validator", () => {
    const report = validateOfferContract();
    expect(report.promiseCounts).toEqual({ enforced: 5, observed: 15, unknown: 5 });
    expect(report.empiricalGapCount).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Fail-closed unsupported promises
// ---------------------------------------------------------------------------

describe("fail-closed unsupported promises", () => {
  it("marks refinement-count promises UNKNOWN (no deterministic gate)", () => {
    const starter = unsupportedPromises(PLAN_OFFERS.starter).map((p) => p.id);
    const pro = unsupportedPromises(PLAN_OFFERS.pro).map((p) => p.id);
    expect(starter).toContain("starter_one_refinement");
    expect(pro).toContain("pro_two_refinements");
  });

  it("marks the six-dimension score UNKNOWN (runtime scoring is 8-dimensional)", () => {
    const free = unsupportedPromises(PLAN_OFFERS.free).map((p) => p.id);
    expect(free).toContain("pulse_six_dimension_score");
  });

  it("marks product-spec-only enterprise promises UNKNOWN", () => {
    const enterprise = unsupportedPromises(PLAN_OFFERS.enterprise).map((p) => p.id);
    expect(enterprise).toContain("enterprise_white_label_reports");
    expect(enterprise).toContain("enterprise_api_access");
  });

  it("renderablePromises never includes UNKNOWN promises", () => {
    for (const offer of ALL_OFFER_LIKE) {
      const renderable = renderablePromises(offer);
      for (const promise of renderable) {
        expect(promise.status).not.toBe("unknown");
      }
    }
  });

  it("public pricing copy never renders an unsupported promise", () => {
    const tiers = derivePublicPricing();
    const free = tiers.find((t) => t.name === "Pulse")!;
    const starter = tiers.find((t) => t.name === "Starter")!;
    const pro = tiers.find((t) => t.name === "Pro")!;
    expect(free.features).not.toContain("Six-dimension score");
    expect(starter.features).not.toContain("One refinement");
    expect(pro.features).not.toContain("Two refinements");
    expect(pro.features).not.toContain("One refinement");
  });

  it("validator reports parity ok with exact plan/promise counts", () => {
    const report = validateOfferContract();
    expect(report.ok).toBe(true);
    expect(report.planCount).toBe(4);
    expect(report.priceParity).toHaveLength(2);
    expect(report.limitParity).toHaveLength(4);
    expect(report.reportTypeParity).toHaveLength(4);
    expect(report.unknownPromises).toHaveLength(5);
    for (const row of [...report.priceParity, ...report.limitParity, ...report.reportTypeParity]) {
      expect(row.ok, `${row.plan}: ${row.detail}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Public copy derivation
// ---------------------------------------------------------------------------

describe("public copy derivation", () => {
  it("derives three pricing tiers with names, prices, and cadences", () => {
    const tiers = derivePublicPricing();
    expect(tiers.map((t) => t.name)).toEqual(["Pulse", "Starter", "Pro"]);
    expect(tiers.map((t) => t.price)).toEqual(["Free", "$30", "$50"]);
    expect(tiers.map((t) => t.cadence)).toEqual(["", "/ month", "/ month"]);
  });

  it("derives notes from enforced audit limits", () => {
    const tiers = derivePublicPricing();
    expect(tiers.find((t) => t.name === "Starter")!.note).toBe(
      "5 complete reports per month",
    );
    expect(tiers.find((t) => t.name === "Pro")!.note).toBe(
      "15 extended reports per month",
    );
  });

  it("renders only supported promises as features", () => {
    const tiers = derivePublicPricing();
    expect(tiers.find((t) => t.name === "Pulse")!.features).toEqual([
      "Primary constraint",
      "Three immediate moves",
    ]);
    expect(tiers.find((t) => t.name === "Starter")!.features).toEqual([
      "15-section intelligence report",
      "Same-tier peer benchmarking",
      "7-day and 90-day plans",
    ]);
    expect(tiers.find((t) => t.name === "Pro")!.features).toEqual([
      "Everything in Starter",
      "Extended content diagnosis",
      "Competitor deep-dives",
    ]);
  });

  it("marks Starter as featured with the expected CTAs", () => {
    const tiers = derivePublicPricing();
    expect(tiers.map((t) => t.featured)).toEqual([false, true, false]);
    expect(tiers.map((t) => t.cta)).toEqual([
      "Run a Free Pulse Audit",
      "Choose Starter",
      "Choose Pro",
    ]);
    expect(tiers.every((t) => t.href === "/login")).toBe(true);
  });

  it("derives enterprise copy from the contact-sales offer", () => {
    const copy = deriveEnterpriseCopy();
    expect(copy.title).toBe("Companies and agencies");
    expect(copy.blurb).toContain("Custom engagements");
    expect(copy.cta).toBe("Enterprise");
    expect(copy.href).toBe("/enterprise");
  });

  it("derives blueprint copy from the one-time offer", () => {
    const copy = deriveBlueprintCopy();
    expect(copy.name).toBe("Blueprint");
    expect(copy.price).toBe("$79");
    expect(copy.features[0]).toBe("Your 15-section launch foundation");
    expect(copy.features).toContain("Niche and positioning audit");
    expect(copy.features).toContain("Month-one content calendar");
    expect(copy.features).toContain("Launch readiness and blind spots");
    expect(copy.features).toContain("90-day roadmap");
    expect(copy.cta).toBe("Get the Blueprint");
    expect(copy.href).toBe("/support?topic=blueprint");
  });
});
