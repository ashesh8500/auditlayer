/**
 * Centralised environment access with build-safe guards.
 *
 * The app must build, lint, and render the public landing + login pages
 * WITHOUT live Supabase/Stripe credentials. Never throw at module-eval time;
 * only surface "not configured" at call sites that genuinely need a service.
 */

export function supabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}

export function supabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
}

export function supabaseServiceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

/** True when the browser/SSR Supabase clients can be constructed safely. */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}

/** True when the service-role (trusted server) client can be constructed. */
export function isSupabaseAdminConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseServiceRoleKey());
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** True only when the server can reach the profile-routed canonical ALM API. */
export function isOperatorConfigured(): boolean {
  return Boolean(process.env.ALM_OPERATOR_API_BASE && process.env.ALM_OPERATOR_API_KEY);
}

/** Absolute site origin used for auth redirects and Stripe return URLs. */
export function siteUrl(): string {
  // Vercel Preview deployments must never inherit production Site URL —
  // Google OAuth / magic-link redirectTo would bounce users to prod.
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

/**
 * Preview / local test login. Hard-disabled on Vercel production.
 * Enable locally with AUDITLAYER_ALLOW_PREVIEW_LOGIN=1.
 */
export function isPreviewLoginAllowed(): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  if (process.env.AUDITLAYER_ALLOW_PREVIEW_LOGIN === "0") return false;
  if (process.env.VERCEL_ENV === "preview") return true;
  if (process.env.AUDITLAYER_ALLOW_PREVIEW_LOGIN === "1") return true;
  if (process.env.NODE_ENV === "development") return true;
  return false;
}

/** Email used by the preview auto-login path (never a real customer). */
export function previewTestUserEmail(): string {
  return (
    process.env.PREVIEW_TEST_USER_EMAIL?.trim().toLowerCase() ||
    "preview-tester@auditlayermedia.com"
  );
}

export function previewTestUserPassword(): string {
  return process.env.PREVIEW_TEST_USER_PASSWORD?.trim() || "";
}

export function previewLoginSecret(): string {
  return process.env.PREVIEW_TEST_LOGIN_SECRET?.trim() || "";
}
