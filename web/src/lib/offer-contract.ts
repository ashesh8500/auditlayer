/**
 * Canonical web offer contract (ALM-I-005 — P11 · C14 · F7/F8 · D2/D8).
 *
 * One versioned, typed projection of every public plan promise, tied to:
 *
 * - deterministic entitlements (audit limits, report-type access, prices,
 *   self-serve/contact-sales mode, trial overlay rules) that the runtime
 *   enforces in `domain.ts`, `offer-pricing.ts`/`stripe.ts`, and the
 *   service-role entitlement SQL (migration 0022); and
 * - explicit evidence status per promise: `enforced` (deterministic code/SQL
 *   guarantees it), `observed` (an implemented runtime behavior produces it,
 *   but content quality is model output), or `unknown` (no deterministic
 *   support and no implemented behavior — never rendered as delivered value).
 *
 * Empirical business facts (delivery cost, funnel, willingness to pay,
 * efficacy) are typed `unknown` until observed data exists; they are never
 * invented demand. This module is dependency-free (no `server-only`, no
 * filesystem) so both server components and the parity tests share it.
 */

import type { Plan, ReportType } from "./domain";
import { PLAN_LIMITS, allowedReportTypes } from "./domain";
import { PLAN_PRICES } from "./offer-pricing";

/** Version of the offer contract itself; bump when the manifest changes. */
export const OFFER_CONTRACT_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OfferPromiseStatus = "enforced" | "observed" | "unknown";
export type OfferMode = "self_serve" | "contact_sales";
export type OfferCadence = "month" | "one_time" | "none" | "contact";

export interface EvidenceRef {
  /** Repo-relative path (relative to the repository root). */
  path: string;
  /** What that artifact proves about this promise. */
  note: string;
}

export interface OfferPrice {
  /** USD per cadence; `null` when the offer has no public self-serve price. */
  amountUsd: number | null;
  cadence: OfferCadence;
  mode: OfferMode;
  /** Display string, e.g. "$30", "Free", "Custom". */
  display: string;
  /** Display suffix, e.g. "/ month". */
  cadenceLabel: string;
}

export interface OfferPromise {
  id: string;
  /** Public copy as rendered on the landing pricing surface. */
  label: string;
  status: OfferPromiseStatus;
  evidence: EvidenceRef[];
  /** Required for `unknown` promises: why the claim is unsupported. */
  note?: string;
}

export interface EmpiricalGap {
  id: "delivery_cost" | "funnel" | "willingness_to_pay" | "efficacy";
  label: string;
  status: "unknown";
  note: string;
  /** Points at the future measurement vehicle or budget contract. */
  evidence: EvidenceRef[];
}

export interface TrialOverlayRule {
  /** Founder/admin profiles always behave as enterprise. */
  adminTreatedAsEnterprise: boolean;
  /** An active trial overrides the base plan for limit purposes. */
  activeTrialPlanOverridesBase: boolean;
  /** An active trial unions its report types into the base entitlement. */
  activeTrialReportTypesUnionedWithBase: boolean;
  /** Expired trials never extend entitlements. */
  expiredTrialIgnored: boolean;
  /** Gifted audit credits are consumed before the recurring plan cap. */
  giftedAuditsConsumedBeforePlanCap: boolean;
  /** Admins bypass paid-plan caps. */
  adminsBypassPlanCaps: boolean;
  evidence: EvidenceRef[];
}

export interface PlanOffer {
  plan: Plan;
  name: string;
  tagline: string;
  price: OfferPrice;
  auditLimit: {
    value: number;
    status: "enforced";
    evidence: EvidenceRef[];
  };
  reportTypes: {
    types: ReportType[];
    status: "enforced";
    evidence: EvidenceRef[];
  };
  trialOverlay: TrialOverlayRule;
  promises: OfferPromise[];
  empirical: EmpiricalGap[];
}

export interface OneTimeOffer {
  id: string;
  name: string;
  tagline: string;
  price: OfferPrice;
  promises: OfferPromise[];
  /** Contact/support path used to purchase (no self-serve checkout). */
  purchasePath: string;
  empirical: EmpiricalGap[];
}

// ---------------------------------------------------------------------------
// Evidence references (repo-relative paths)
// ---------------------------------------------------------------------------

const E = {
  domainLimits: (): EvidenceRef => ({
    path: "web/src/lib/domain.ts",
    note: "PLAN_LIMITS (free 1, starter 5, pro 15, enterprise 10000)",
  }),
  domainReportTypes: (): EvidenceRef => ({
    path: "web/src/lib/domain.ts",
    note: "allowedReportTypes() per plan",
  }),
  domainTrial: (): EvidenceRef => ({
    path: "web/src/lib/domain.ts",
    note: "effectivePlanForProfile / allowedReportTypesForProfile trial union rules",
  }),
  sqlEntitlements: (): EvidenceRef => ({
    path: "supabase/migrations/0022_commercial_entitlements.sql",
    note: "submit_entitled_audit(): effective_plan, allowed_types, plan_limit, trial union; admin_set_access()",
  }),
  sqlTrialRpc: (): EvidenceRef => ({
    path: "supabase/migrations/0022_commercial_entitlements.sql",
    note: "redeem_trial_link(): offer_plan/report_types/access_days copied to expiring profile trial",
  }),
  stripePrices: (): EvidenceRef => ({
    path: "web/src/lib/offer-pricing.ts",
    note: "PLAN_PRICES starter $30, pro $50 (re-exported by web/src/lib/stripe.ts)",
  }),
  workerSections: (): EvidenceRef => ({
    path: "worker/auditlayer_worker/core.py",
    note: "PULSE/STANDARD/EXTENDED/BLUEPRINT_SECTIONS + assemble_report_html heading gate (deterministic section count)",
  }),
  workerBenchmark: (): EvidenceRef => ({
    path: "worker/auditlayer_worker/benchmark.py",
    note: "same-tier peer cases, include_extended deep-dives, cost/latency budgets",
  }),
  sixAnswerCoverage: (): EvidenceRef => ({
    path: "worker/auditlayer_worker/intelligence/coverage.py",
    note: "six customer answers (current_state, blockers, better_peers, next_week_actions, milestone_path, money_move)",
  }),
  methodologyScoring: (): EvidenceRef => ({
    path: "docs/audit-methodology.md",
    note: "weighted 8-dimension scoring contract (six-dimension claim unsupported)",
  }),
  refinementGuardrails: (): EvidenceRef => ({
    path: "web/src/lib/refinement.ts",
    note: "section-scoped refinement validation; NO per-plan refinement count gate exists in web or SQL",
  }),
  outcomeLedger: (): EvidenceRef => ({
    path: "supabase/migrations/20260807000000_recommendation_outcome_ledger.sql",
    note: "future vehicle for observed outcome/efficacy data; no observed efficacy data exists yet",
  }),
  enterprisePage: (): EvidenceRef => ({
    path: "web/src/app/enterprise/page.tsx",
    note: "contact-sales enterprise copy: conversation-led, scoped engagements",
  }),
  productSpec: (): EvidenceRef => ({
    path: "docs/product-spec.md",
    note: "historical pricing narrative and white-label/API enterprise claims (no implementation evidence)",
  }),
  supportForm: (): EvidenceRef => ({
    path: "web/src/app/support/support-form.tsx",
    note: "blueprint and enterprise purchase path is the support flow, not self-serve checkout",
  }),
} as const;

// ---------------------------------------------------------------------------
// Trial overlay rules (single definition shared by every plan offer)
// ---------------------------------------------------------------------------

export const TRIAL_OVERLAY_RULES: TrialOverlayRule = {
  adminTreatedAsEnterprise: true,
  activeTrialPlanOverridesBase: true,
  activeTrialReportTypesUnionedWithBase: true,
  expiredTrialIgnored: true,
  giftedAuditsConsumedBeforePlanCap: true,
  adminsBypassPlanCaps: true,
  evidence: [E.domainTrial(), E.sqlEntitlements(), E.sqlTrialRpc()],
};

// ---------------------------------------------------------------------------
// Empirical gaps shared by every paid offer
// ---------------------------------------------------------------------------

export function standardEmpiricalGaps(): EmpiricalGap[] {
  return [
    {
      id: "delivery_cost",
      label: "Delivery cost per audit",
      status: "unknown",
      note: "The worker benchmark defines a standard-report cost budget (<= $0.50) and hard latency budgets, but no observed live delivery-cost data exists.",
      evidence: [
        E.workerBenchmark(),
        { path: "docs/data-sources-and-billing.md", note: "cost drivers; no measured per-audit cost dataset" },
      ],
    },
    {
      id: "funnel",
      label: "Onboarding/conversion funnel",
      status: "unknown",
      note: "No typed funnel or conversion dataset exists; profiles.onboarding_status is state, not measured conversion.",
      evidence: [{ path: "docs/product-spec.md", note: "funnel language is narrative, not measurement" }],
    },
    {
      id: "willingness_to_pay",
      label: "Willingness to pay",
      status: "unknown",
      note: "No A/B price test or observed purchase data; the product-spec pricing evolution is historical narrative, not measured WTP.",
      evidence: [{ path: "docs/product-spec.md", note: "pricing history; no observed WTP evidence" }],
    },
    {
      id: "efficacy",
      label: "Observed creator/business outcomes",
      status: "unknown",
      note: "No observed outcome data yet; the recommendation-outcome ledger is the future vehicle and unlinked outcomes cannot support efficacy claims.",
      evidence: [E.outcomeLedger()],
    },
  ];
}

// ---------------------------------------------------------------------------
// Plan offers
// ---------------------------------------------------------------------------

export const PLAN_OFFERS: Record<Plan, PlanOffer> = {
  free: {
    plan: "free",
    name: "Pulse",
    tagline: "One focused decision-ready diagnostic",
    price: {
      amountUsd: 0,
      cadence: "none",
      mode: "self_serve",
      display: "Free",
      cadenceLabel: "",
    },
    auditLimit: {
      value: PLAN_LIMITS.free,
      status: "enforced",
      evidence: [E.domainLimits(), E.sqlEntitlements()],
    },
    reportTypes: {
      types: allowedReportTypes("free"),
      status: "enforced",
      evidence: [E.domainReportTypes(), E.sqlEntitlements()],
    },
    trialOverlay: TRIAL_OVERLAY_RULES,
    promises: [
      {
        id: "pulse_six_dimension_score",
        label: "Six-dimension score",
        status: "unknown",
        evidence: [E.sixAnswerCoverage(), E.methodologyScoring()],
        note: "Unsupported distinction: the canonical weighted scoring contract defines eight dimensions (docs/audit-methodology.md, worker SCORE_DIMENSIONS); the six-answer framework is a separate construct and no deterministic six-dimension scoring exists.",
      },
      {
        id: "pulse_primary_constraint",
        label: "Primary constraint",
        status: "observed",
        evidence: [
          E.workerSections(),
          { path: "web/src/app/page.tsx", note: "rendered copy maps to Key Gaps / Root Cause content" },
        ],
      },
      {
        id: "pulse_three_immediate_moves",
        label: "Three immediate moves",
        status: "enforced",
        evidence: [E.workerSections()],
      },
    ],
    empirical: standardEmpiricalGaps(),
  },
  starter: {
    plan: "starter",
    name: "Starter",
    tagline: "5 complete reports per month",
    price: {
      amountUsd: PLAN_PRICES.find((p) => p.plan === "starter")?.amount ?? 30,
      cadence: "month",
      mode: "self_serve",
      display: "$30",
      cadenceLabel: "/ month",
    },
    auditLimit: {
      value: PLAN_LIMITS.starter,
      status: "enforced",
      evidence: [E.domainLimits(), E.sqlEntitlements()],
    },
    reportTypes: {
      types: allowedReportTypes("starter"),
      status: "enforced",
      evidence: [E.domainReportTypes(), E.sqlEntitlements()],
    },
    trialOverlay: TRIAL_OVERLAY_RULES,
    promises: [
      {
        id: "starter_fifteen_section_report",
        label: "15-section intelligence report",
        status: "enforced",
        evidence: [E.workerSections()],
      },
      {
        id: "starter_same_tier_peer_benchmarking",
        label: "Same-tier peer benchmarking",
        status: "observed",
        evidence: [E.workerBenchmark()],
      },
      {
        id: "starter_seven_and_90_day_plans",
        label: "7-day and 90-day plans",
        status: "observed",
        evidence: [E.workerSections()],
      },
      {
        id: "starter_one_refinement",
        label: "One refinement",
        status: "unknown",
        evidence: [E.refinementGuardrails()],
        note: "No per-plan refinement count gate exists in web code or SQL; refinement enqueue validates section scope and ready status only.",
      },
    ],
    empirical: standardEmpiricalGaps(),
  },
  pro: {
    plan: "pro",
    name: "Pro",
    tagline: "15 extended reports per month",
    price: {
      amountUsd: PLAN_PRICES.find((p) => p.plan === "pro")?.amount ?? 50,
      cadence: "month",
      mode: "self_serve",
      display: "$50",
      cadenceLabel: "/ month",
    },
    auditLimit: {
      value: PLAN_LIMITS.pro,
      status: "enforced",
      evidence: [E.domainLimits(), E.sqlEntitlements()],
    },
    reportTypes: {
      types: allowedReportTypes("pro"),
      status: "enforced",
      evidence: [E.domainReportTypes(), E.sqlEntitlements()],
    },
    trialOverlay: TRIAL_OVERLAY_RULES,
    promises: [
      {
        id: "pro_everything_in_starter",
        label: "Everything in Starter",
        status: "enforced",
        evidence: [
          E.domainReportTypes(),
          E.domainLimits(),
          { path: "web/src/lib/offer-contract.ts", note: "superset verified by parity test: pro report types ⊇ starter and 15 > 5 limit" },
        ],
      },
      {
        id: "pro_extended_content_diagnosis",
        label: "Extended content diagnosis",
        status: "enforced",
        evidence: [E.workerSections()],
      },
      {
        id: "pro_competitor_deep_dives",
        label: "Competitor deep-dives",
        status: "observed",
        evidence: [E.workerBenchmark()],
      },
      {
        id: "pro_two_refinements",
        label: "Two refinements",
        status: "unknown",
        evidence: [E.refinementGuardrails()],
        note: "No per-plan refinement count gate exists in web code or SQL; the Starter/Pro refinement-count distinction is not deterministically delivered.",
      },
    ],
    empirical: standardEmpiricalGaps(),
  },
  enterprise: {
    plan: "enterprise",
    name: "Enterprise",
    tagline: "Custom engagements, scoped to your portfolio and operating rhythm",
    price: {
      amountUsd: null,
      cadence: "contact",
      mode: "contact_sales",
      display: "Custom",
      cadenceLabel: "",
    },
    auditLimit: {
      value: PLAN_LIMITS.enterprise,
      status: "enforced",
      evidence: [E.domainLimits(), E.sqlEntitlements()],
    },
    reportTypes: {
      types: allowedReportTypes("enterprise"),
      status: "enforced",
      evidence: [E.domainReportTypes(), E.sqlEntitlements()],
    },
    trialOverlay: TRIAL_OVERLAY_RULES,
    promises: [
      {
        id: "enterprise_custom_engagements",
        label: "Custom engagements with hands-on onboarding",
        status: "observed",
        evidence: [E.enterprisePage(), E.supportForm()],
      },
      {
        id: "enterprise_scoped_portfolio",
        label: "Scoped to your portfolio and operating rhythm",
        status: "observed",
        evidence: [E.enterprisePage()],
      },
      {
        id: "enterprise_white_label_reports",
        label: "White-label reports",
        status: "unknown",
        evidence: [E.productSpec()],
        note: "Promised in product-spec only; no implementation evidence exists in the repository.",
      },
      {
        id: "enterprise_api_access",
        label: "API access",
        status: "unknown",
        evidence: [E.productSpec()],
        note: "Promised in product-spec only; no implementation evidence exists in the repository.",
      },
    ],
    empirical: standardEmpiricalGaps(),
  },
};

// ---------------------------------------------------------------------------
// One-time offers (Blueprints, purchased through the support flow)
// ---------------------------------------------------------------------------

export const ONE_TIME_OFFERS: OneTimeOffer[] = [
  {
    id: "blueprint",
    name: "Blueprint",
    tagline: "A complete pre-launch foundation and 90-day roadmap. No subscription.",
    price: {
      amountUsd: 79,
      cadence: "one_time",
      mode: "contact_sales",
      display: "$79",
      cadenceLabel: " one-time",
    },
    promises: [
      {
        id: "blueprint_fifteen_section_foundation",
        label: "Your 15-section launch foundation",
        status: "enforced",
        evidence: [E.workerSections()],
      },
      {
        id: "blueprint_niche_positioning_audit",
        label: "Niche and positioning audit",
        status: "observed",
        evidence: [E.workerSections()],
      },
      {
        id: "blueprint_competitive_landscape",
        label: "Competitive landscape",
        status: "observed",
        evidence: [E.workerSections()],
      },
      {
        id: "blueprint_content_pillar_architecture",
        label: "Content pillar architecture",
        status: "observed",
        evidence: [E.workerSections()],
      },
      {
        id: "blueprint_profile_optimization_checklist",
        label: "Profile optimization checklist",
        status: "observed",
        evidence: [E.workerSections()],
      },
      {
        id: "blueprint_visual_identity_framework",
        label: "Visual identity framework",
        status: "observed",
        evidence: [E.workerSections()],
      },
      {
        id: "blueprint_brand_voice_format_mix",
        label: "Brand voice and format mix",
        status: "observed",
        evidence: [E.workerSections()],
      },
      {
        id: "blueprint_month_one_content_calendar",
        label: "Month-one content calendar",
        status: "observed",
        evidence: [E.workerSections()],
      },
      {
        id: "blueprint_launch_readiness_blind_spots",
        label: "Launch readiness and blind spots",
        status: "observed",
        evidence: [E.workerSections()],
      },
      {
        id: "blueprint_ninety_day_roadmap",
        label: "90-day roadmap",
        status: "observed",
        evidence: [E.workerSections()],
      },
    ],
    purchasePath: "/support?topic=blueprint",
    empirical: standardEmpiricalGaps(),
  },
];

export const OFFER_MANIFEST = {
  version: OFFER_CONTRACT_VERSION,
  plans: PLAN_OFFERS,
  oneTimeOffers: ONE_TIME_OFFERS,
} as const;

// ---------------------------------------------------------------------------
// Fail-closed projection for public surfaces
// ---------------------------------------------------------------------------

/** Promises that may be rendered as delivered product value. */
export function renderablePromises(offer: PlanOffer | OneTimeOffer): OfferPromise[] {
  return offer.promises.filter((promise) => promise.status !== "unknown");
}

/** Promises classified `unknown` (never rendered as delivered value). */
export function unsupportedPromises(offer: PlanOffer | OneTimeOffer): OfferPromise[] {
  return offer.promises.filter((promise) => promise.status === "unknown");
}

export interface PublicPricingTier {
  name: string;
  price: string;
  cadence: string;
  note: string;
  features: string[];
  cta: string;
  href: string;
  featured: boolean;
}

const CTA_BY_PLAN: Record<Plan, { cta: string; href: string }> = {
  free: { cta: "Run a Free Pulse Audit", href: "/login" },
  starter: { cta: "Choose Starter", href: "/login" },
  pro: { cta: "Choose Pro", href: "/login" },
  enterprise: { cta: "Enterprise", href: "/enterprise" },
};

const FEATURED_PLAN: Plan = "starter";

/** Derive the landing pricing tiers from the canonical contract. */
export function derivePublicPricing(): PublicPricingTier[] {
  return (["free", "starter", "pro"] as const).map((plan) => {
    const offer = PLAN_OFFERS[plan];
    return {
      name: offer.name,
      price: offer.price.display,
      cadence: offer.price.cadenceLabel,
      note: offer.tagline,
      features: renderablePromises(offer).map((promise) => promise.label),
      cta: CTA_BY_PLAN[plan].cta,
      href: CTA_BY_PLAN[plan].href,
      featured: plan === FEATURED_PLAN,
    };
  });
}

export interface PublicEnterpriseCopy {
  title: string;
  blurb: string;
  cta: string;
  href: string;
}

export function deriveEnterpriseCopy(): PublicEnterpriseCopy {
  const offer = PLAN_OFFERS.enterprise;
  return {
    title: "Companies and agencies",
    blurb: offer.tagline,
    cta: CTA_BY_PLAN.enterprise.cta,
    href: CTA_BY_PLAN.enterprise.href,
  };
}

export interface PublicBlueprintCopy {
  name: string;
  price: string;
  cadenceLabel: string;
  note: string;
  features: string[];
  cta: string;
  href: string;
}

export function deriveBlueprintCopy(): PublicBlueprintCopy {
  const offer = ONE_TIME_OFFERS.find((o) => o.id === "blueprint")!;
  return {
    name: offer.name,
    price: offer.price.display,
    cadenceLabel: offer.price.cadenceLabel,
    note: offer.tagline,
    features: renderablePromises(offer).map((promise) => promise.label),
    cta: "Get the Blueprint",
    href: offer.purchasePath,
  };
}

// ---------------------------------------------------------------------------
// Parity validator (web-side). SQL-side parity is exercised in the test file
// by statically reading the entitlement migration (no live SQL).
// ---------------------------------------------------------------------------

export interface ParityRow {
  plan: string;
  ok: boolean;
  detail: string;
}

export interface OfferParityReport {
  version: string;
  planCount: number;
  priceParity: ParityRow[];
  limitParity: ParityRow[];
  reportTypeParity: ParityRow[];
  promiseCounts: { enforced: number; observed: number; unknown: number };
  unknownPromises: { plan: string; id: string; label: string; note?: string }[];
  empiricalGapCount: number;
  ok: boolean;
}

export function validateOfferContract(): OfferParityReport {
  const plans: Plan[] = ["free", "starter", "pro", "enterprise"];

  const priceParity: ParityRow[] = [];
  for (const row of PLAN_PRICES) {
    const offer = PLAN_OFFERS[row.plan];
    priceParity.push({
      plan: row.plan,
      ok: offer.price.amountUsd === row.amount,
      detail: `contract $${offer.price.amountUsd} vs stripe $${row.amount}`,
    });
  }

  const limitParity: ParityRow[] = plans.map((plan) => ({
    plan,
    ok: PLAN_OFFERS[plan].auditLimit.value === PLAN_LIMITS[plan],
    detail: `contract ${PLAN_OFFERS[plan].auditLimit.value} vs domain ${PLAN_LIMITS[plan]}`,
  }));

  const reportTypeParity: ParityRow[] = plans.map((plan) => {
    const contract = PLAN_OFFERS[plan].reportTypes.types;
    const domain = allowedReportTypes(plan);
    const same =
      contract.length === domain.length &&
      contract.every((type, index) => type === domain[index]);
    return {
      plan,
      ok: same,
      detail: `contract [${contract.join(",")}] vs domain [${domain.join(",")}]`,
    };
  });

  const allPlans = [...plans.map((p) => PLAN_OFFERS[p]), ...ONE_TIME_OFFERS];
  const promiseCounts = { enforced: 0, observed: 0, unknown: 0 };
  const unknownPromises: OfferParityReport["unknownPromises"] = [];
  for (const offer of allPlans) {
    const key = "plan" in offer ? offer.plan : offer.id;
    for (const promise of offer.promises) {
      promiseCounts[promise.status] += 1;
      if (promise.status === "unknown") {
        unknownPromises.push({
          plan: key,
          id: promise.id,
          label: promise.label,
          note: promise.note,
        });
      }
    }
  }

  const empiricalGapCount = allPlans.reduce(
    (sum, offer) => sum + offer.empirical.length,
    0,
  );

  const allOk =
    priceParity.every((r) => r.ok) &&
    limitParity.every((r) => r.ok) &&
    reportTypeParity.every((r) => r.ok);

  return {
    version: OFFER_CONTRACT_VERSION,
    planCount: plans.length,
    priceParity,
    limitParity,
    reportTypeParity,
    promiseCounts,
    unknownPromises,
    empiricalGapCount,
    ok: allOk,
  };
}
