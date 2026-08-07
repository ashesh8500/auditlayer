/**
 * Canonical billing-portal session contract (ALM-I-026 — P11/P12 · C14/C15 ·
 * F7/F9 · D3/D4/D8).
 *
 * Composes `authenticated profile + stored Stripe customer link → canonical
 * safe return URL → one billing-portal session → bounded redirect/recovery
 * state` for the portal server action in `web/src/lib/actions/billing.ts`.
 *
 * This module is intentionally dependency-light: it imports no `server-only`,
 * no Stripe SDK, no Supabase client, and no Next.js runtime, so the full
 * orchestration can be exercised deterministically through injected/recordable
 * boundaries without any live provider call.
 *
 * Authority split
 * ---------------
 * - Stripe remains authoritative for portal sessions and subscription facts;
 *   valid input makes exactly one `billingPortal.sessions.create` call.
 * - W013 webhook reconciliation (`stripe-reconciliation.ts` +
 *   `reconcile_stripe_subscription`) remains authoritative for entitlements.
 * - `profiles` (via the authenticated profile) is authoritative only for the
 *   current customer link; the module validates presence and local shape
 *   without ever treating the local value as proof of live Stripe state.
 * - The dashboard `billing=` query vocabulary (success/cancelled/unconfigured/
 *   error) is the only redirect/recovery surface; failure outcomes stay in
 *   `unconfigured|error` and never project success.
 *
 * Live Stripe customer existence and provider replay/idempotency are UNKNOWN
 * offline: the module never probes the provider and never claims the customer
 * still exists or that a repeated submission is deduplicated. Fixtures prove
 * adapter call shape and fail-closed recovery only.
 */

// ---------------------------------------------------------------------------
// Version + bounded recovery vocabulary
// ---------------------------------------------------------------------------

/** Version of the billing-portal contract (part of the artifact identity). */
export const BILLING_PORTAL_VERSION = "1.0.0";

/** Recovery outcomes surfaced through the existing dashboard vocabulary. */
export type BillingPortalRecoveryOutcome = "unconfigured" | "error";

/** Exact reason behind a bounded recovery (recorded in the evidence artifact). */
export type BillingPortalRecoveryCode =
  | "missing_stripe"
  | "missing_customer_link"
  | "stale_customer_link"
  | "unsafe_return_url"
  | "portal_session_failed"
  | "missing_session_url"
  | "unsafe_session_url";

export type BillingPortalResult =
  | { kind: "redirect"; url: string }
  | {
      kind: "recover";
      outcome: BillingPortalRecoveryOutcome;
      code: BillingPortalRecoveryCode;
      url: string;
    };

/** The one dashboard recovery URL for an outcome (never success). */
export function billingPortalRecoveryUrl(outcome: BillingPortalRecoveryOutcome): string {
  return outcome === "unconfigured"
    ? "/dashboard?billing=unconfigured"
    : "/dashboard?billing=error";
}

function recovery(
  outcome: BillingPortalRecoveryOutcome,
  code: BillingPortalRecoveryCode,
): BillingPortalResult {
  return { kind: "recover", outcome, code, url: billingPortalRecoveryUrl(outcome) };
}

// ---------------------------------------------------------------------------
// Local link / URL safety (deterministic, no provider probe)
// ---------------------------------------------------------------------------

/**
 * Local shape check for the stored Stripe customer link. Stripe customer IDs
 * are `cus_` + alphanumeric; this only proves the stored value could be a
 * current provider reference. Live existence at Stripe stays UNKNOWN.
 */
export function isPlausibleStripeCustomerId(value: string | null | undefined): boolean {
  return typeof value === "string" && /^cus_[A-Za-z0-9]+$/.test(value);
}

/**
 * The canonical portal return URL: `${siteUrl}/dashboard` with no query or
 * fragment. This is the only return target the portal path may use.
 */
export function canonicalPortalReturnUrl(siteUrlValue: string): string {
  return `${siteUrlValue.replace(/\/+$/, "")}/dashboard`;
}

/**
 * True when a constructed return URL is safe to hand to Stripe: absolute,
 * HTTPS (or HTTP only for loopback dev hosts), no query/fragment, a canonical
 * `/dashboard` path, and the SAME origin as the configured site URL. A
 * misconfigured site URL that would return the user to a wrong origin/path
 * fails closed BEFORE any provider call.
 */
export function isSafeReturnUrl(returnUrl: string, siteUrlValue: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(returnUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (parsed.protocol === "http:") {
    const host = parsed.hostname;
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") return false;
  }
  if (parsed.pathname !== "/dashboard") return false;
  if (parsed.search !== "" || parsed.hash !== "") return false;

  // Wrong-origin return URL: the constructed URL must sit on the configured
  // site origin, never a different host.
  let site: URL;
  try {
    site = new URL(siteUrlValue);
  } catch {
    return false;
  }
  return parsed.origin === site.origin;
}

/**
 * Stripe's documented Customer Portal session host. Portal session URLs are
 * `https://billing.stripe.com/session/...`; anything else (non-HTTPS, wrong
 * origin, unparseable) is rejected before redirect.
 */
export const PORTAL_SESSION_HOST = "billing.stripe.com";

/**
 * True when a provider-returned portal session URL is safe to redirect to:
 * absolute HTTPS on the documented Customer Portal host.
 */
export function isSafePortalSessionUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === "https:" && parsed.hostname === PORTAL_SESSION_HOST;
}

// ---------------------------------------------------------------------------
// Recording boundary types (injected by `billing.ts` production wiring)
// ---------------------------------------------------------------------------

/** The authenticated profile fields the portal path may use. */
export interface BillingPortalProfile {
  id: string;
  stripe_customer_id: string | null;
}

/** Stripe `billingPortal.sessions.create` params the portal path sends. */
export interface BillingPortalSessionParams {
  customer: string;
  return_url: string;
}

/**
 * The minimal Stripe surface the portal path touches. Structurally satisfied
 * by the real `Stripe` instance (`billingPortal.sessions.create` accepts these
 * params and resolves a session with `url`), so `billing.ts` passes the
 * canonical client through without any provider wrapper.
 */
export interface BillingPortalStripeBoundary {
  billingPortal: {
    sessions: {
      create(params: BillingPortalSessionParams): Promise<{ url: string | null }>;
    };
  };
}

/** Injected boundaries the orchestration uses (recordable in tests). */
export interface BillingPortalDeps {
  getProfile(): Promise<BillingPortalProfile>;
  getStripe(): BillingPortalStripeBoundary | null;
  siteUrl(): string;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Plan and execute one billing-portal session.
 *
 * - Missing Stripe / missing or locally stale customer link → `unconfigured`
 *   recovery with zero provider calls.
 * - Unsafe return URL (non-HTTPS, wrong path, wrong origin) → `error`
 *   recovery with zero provider calls.
 * - Valid input → exactly one `billingPortal.sessions.create` call, then a
 *   redirect ONLY when the returned session URL is present and safe.
 * - Provider exception, missing session URL, unsafe session URL → bounded
 *   `error` recovery, never a success redirect.
 * - `profiles.plan` / subscription / receipts are NEVER written here; the
 *   webhook (service-role) reconciles entitlements after payment.
 */
export async function runBillingPortal(deps: BillingPortalDeps): Promise<BillingPortalResult> {
  const profile = await deps.getProfile();
  const stripe = deps.getStripe();

  if (!stripe) return recovery("unconfigured", "missing_stripe");

  const customerId = profile.stripe_customer_id;
  if (!customerId) return recovery("unconfigured", "missing_customer_link");
  if (!isPlausibleStripeCustomerId(customerId)) {
    return recovery("unconfigured", "stale_customer_link");
  }

  const returnUrl = canonicalPortalReturnUrl(deps.siteUrl());
  const site = deps.siteUrl();
  if (!isSafeReturnUrl(returnUrl, site)) return recovery("error", "unsafe_return_url");

  let session: { url: string | null };
  try {
    session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  } catch {
    return recovery("error", "portal_session_failed");
  }

  if (!session.url) return recovery("error", "missing_session_url");
  if (!isSafePortalSessionUrl(session.url)) return recovery("error", "unsafe_session_url");

  return { kind: "redirect", url: session.url };
}

// ---------------------------------------------------------------------------
// Deterministic contract artifact (no secrets, no environment, no timestamps)
// ---------------------------------------------------------------------------

export interface BillingPortalContract {
  contract: string;
  version: string;
  program: string;
  idea: string;
  object: string;
  authority: Record<string, string>;
  call_matrix: Record<string, string>;
  recovery: {
    unconfigured: string;
    error: string;
    codes: readonly BillingPortalRecoveryCode[];
    never_success_on_failure: boolean;
  };
  unknown: {
    live_customer_existence: string;
    provider_replay_idempotency: string;
  };
  network_calls: number;
  payment_calls: number;
  customer_mutations: number;
  provider_calls: number;
  no_environment_path: boolean;
  no_timestamp: boolean;
  no_customer_data: boolean;
  no_secret_values: boolean;
  no_url_secret: boolean;
  fixture_note: string;
}

/**
 * The inspectable, deterministic contract backing the billing-portal recovery
 * boundary. Static by construction: no timestamps, environment paths,
 * customer data, credentials, or provider calls. Used to emit
 * `web/artifacts/billing-portal-contract.json`.
 */
export function buildBillingPortalContract(): BillingPortalContract {
  return {
    contract: "billing-portal-contract",
    version: BILLING_PORTAL_VERSION,
    program: "P11/P12 · C14/C15 · F7/F9 · D3/D4/D8",
    idea: "ALM-I-026: bound billing portal recovery",
    object:
      "web/src/lib/actions/billing.ts::openBillingPortal + stored Stripe customer link + canonical /dashboard?billing= recovery vocabulary + one recording Stripe boundary",
    authority: {
      portal_sessions:
        "Stripe billingPortal.sessions.create is authoritative for portal sessions and subscription facts",
      entitlements:
        "webhook reconciliation (W013 stripe-reconciliation.ts + reconcile_stripe_subscription) remains authoritative after payment; the portal never writes profiles.plan/subscription/receipts",
      profiles:
        "profiles is authoritative only for the current customer link; presence and local shape are validated, live existence is never claimed",
      dashboard:
        "existing /dashboard?billing=success|cancelled|unconfigured|error query vocabulary is the only redirect/recovery surface",
    },
    call_matrix: {
      configured_success: "session_calls=1 redirect(session.url)",
      missing_stripe: "session_calls=0 recover(unconfigured/missing_stripe)",
      missing_customer_link: "session_calls=0 recover(unconfigured/missing_customer_link)",
      stale_customer_link: "session_calls=0 recover(unconfigured/stale_customer_link)",
      unsafe_return_url: "session_calls=0 recover(error/unsafe_return_url)",
      portal_session_failed: "session_calls=1 recover(error/portal_session_failed)",
      missing_session_url: "session_calls=1 recover(error/missing_session_url)",
      unsafe_session_url: "session_calls=1 recover(error/unsafe_session_url)",
      repeated_valid_submission:
        "one session call per invocation; no dedup claim (provider replay UNKNOWN)",
      repeated_failing_submission:
        "every invocation returns the same bounded recovery; never success",
    },
    recovery: {
      unconfigured: billingPortalRecoveryUrl("unconfigured"),
      error: billingPortalRecoveryUrl("error"),
      codes: [
        "missing_stripe",
        "missing_customer_link",
        "stale_customer_link",
        "unsafe_return_url",
        "portal_session_failed",
        "missing_session_url",
        "unsafe_session_url",
      ],
      never_success_on_failure: true,
    },
    unknown: {
      live_customer_existence:
        "UNKNOWN — fixtures cannot observe whether the stored customer still exists at Stripe",
      provider_replay_idempotency:
        "UNKNOWN — fixtures cannot observe Stripe replay/idempotency for repeated portal sessions",
    },
    network_calls: 0,
    payment_calls: 0,
    customer_mutations: 0,
    provider_calls: 0,
    no_environment_path: true,
    no_timestamp: true,
    no_customer_data: true,
    no_secret_values: true,
    no_url_secret: true,
    fixture_note:
      "Recording fixtures prove adapter call shape and fail-closed recovery semantics only; they do not prove live customer existence, provider idempotency, billing conversion, or entitlement correctness.",
  };
}
