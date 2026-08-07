/**
 * access-boundary.ts — canonical, deterministic tenant/artifact access contract.
 *
 * One pure, typed decision primitive that every private audit/report artifact
 * route and every server-side access module consumes BEFORE any service-role
 * read. Postgres RLS/storage policies remain authoritative at the database
 * layer; this module is the application-layer fail-closed gate that guarantees
 * the browser-facing contract (owner/admin allow; other-user and anonymous
 * deny; share links are an explicit token-scoped exception).
 *
 * This module is intentionally dependency-free (no `server-only`, no
 * `next/headers`, no Supabase clients) so the entire matrix is deterministically
 * testable in Vitest with fixture principals and resources.
 *
 * Fixtures verify the software/security contract only; they do not prove the
 * linked production database or live auth provider state.
 */

// ---------------------------------------------------------------------------
// Principals
// ---------------------------------------------------------------------------

export type PrincipalKind = "owner" | "admin" | "other" | "anonymous";

export interface Principal {
  kind: PrincipalKind;
  /** Authenticated user id (present for owner/admin/other; absent for anonymous). */
  userId: string | null;
  /** Server-verified profile role. Only `"admin"` grants admin authority. */
  role: string | null;
}

export const ADMIN_ROLE = "admin";

/** Canonical fixture principals used to generate the access matrix. */
export const PRINCIPALS: readonly Principal[] = [
  { kind: "owner", userId: "00000000-0000-0000-0000-0000000000aa", role: "client" },
  { kind: "admin", userId: "00000000-0000-0000-0000-0000000000bb", role: ADMIN_ROLE },
  { kind: "other", userId: "00000000-0000-0000-0000-0000000000cc", role: "client" },
  { kind: "anonymous", userId: null, role: null },
] as const;

export function isAdminPrincipal(principal: Principal): boolean {
  return principal.kind === "admin" || principal.role === ADMIN_ROLE;
}

// ---------------------------------------------------------------------------
// Private resource classes
// ---------------------------------------------------------------------------

/**
 * Private intelligence/artifact resource classes protected by the contract.
 * Each class resolves to an owning user id (directly, via subject, or via
 * audit) and must be readable only by owner/admin at the application layer.
 */
export type PrivateResourceClass =
  | "subject"
  | "living_brief"
  | "evidence"
  | "audit"
  | "report_version"
  | "report_object";

export const PRIVATE_RESOURCE_CLASSES: readonly PrivateResourceClass[] = [
  "subject",
  "living_brief",
  "evidence",
  "audit",
  "report_version",
  "report_object",
] as const;

/**
 * Deterministic owner resolution for a private resource row.
 * `ownerUserId` is the canonical owning profile id:
 *   - subjects:                    row.user_id
 *   - living_brief_versions:       subjects.user_id (via subject_id)
 *   - evidence:                    subjects.user_id (via subject_id)
 *   - audits / audit_report_versions / report storage objects:
 *                                  audits.user_id (via audit_id / first path segment)
 */
export interface ArtifactResource {
  resourceClass: PrivateResourceClass;
  ownerUserId: string | null | undefined;
}

export interface ArtifactAccessInput {
  principal: Principal;
  resource: ArtifactResource;
}

export type ArtifactAccessDecision = "allow" | "deny";

/**
 * THE canonical access decision.
 *
 * allow  — owner (principal.userId === resource.ownerUserId) or admin.
 * deny   — every other authenticated user and every anonymous principal.
 *
 * Denial is uniform and opaque: callers must NOT reveal whether the resource
 * exists or where it lives. Routes map `deny` to the same 403/404 family they
 * already use for missing resources.
 */
export function decideArtifactAccess(input: ArtifactAccessInput): ArtifactAccessDecision {
  const { principal, resource } = input;
  if (isAdminPrincipal(principal)) return "allow";
  if (
    principal.kind === "owner" ||
    (principal.kind === "other" && principal.userId !== null)
  ) {
    if (
      resource.ownerUserId !== null &&
      resource.ownerUserId !== undefined &&
      principal.userId === resource.ownerUserId
    ) {
      return "allow";
    }
  }
  return "deny";
}

// ---------------------------------------------------------------------------
// Share-link state machine (explicit token-scoped exception)
// ---------------------------------------------------------------------------

export type ShareMode = "public" | "email";

export type ShareDenyReason =
  | "not_found"
  | "revoked"
  | "expired"
  | "not_ready"
  | "needs_verification";

export type ShareDecision =
  | { allow: true; mode: ShareMode }
  | { allow: false; reason: ShareDenyReason };

export interface ShareLinkState {
  /** The share link row exists. */
  exists: boolean;
  mode: ShareMode;
  revokedAt: string | null;
  expiresAt: string | null;
  verifiedAt: string | null;
  /** Verified session cookie present for this exact token. */
  hasVerifiedSession: boolean;
  /** Underlying audit is `ready` and has a report_path. */
  auditReady: boolean;
}

/**
 * Canonical share-link decision. Share access is the ONLY explicit exception
 * to the private-resource rule, and it is token-scoped: a valid public link or
 * a verified email link may reach exactly one audit's ready report.
 *
 * `now` is injectable so expiry checks are deterministic in tests.
 */
export function decideShareAccess(
  state: ShareLinkState,
  now: Date = new Date(),
): ShareDecision {
  if (!state.exists) return { allow: false, reason: "not_found" };
  if (state.revokedAt !== null && state.revokedAt !== undefined) {
    return { allow: false, reason: "revoked" };
  }
  if (state.expiresAt !== null && state.expiresAt !== undefined) {
    const expires = new Date(state.expiresAt);
    if (!Number.isNaN(expires.getTime()) && expires.getTime() <= now.getTime()) {
      return { allow: false, reason: "expired" };
    }
  }
  if (!state.auditReady) return { allow: false, reason: "not_ready" };

  if (state.mode === "public") return { allow: true, mode: "public" };

  // Email mode: either the link was explicitly verified (verified_at) or the
  // current session carries the verified cookie for this exact token.
  const verified =
    (state.verifiedAt !== null && state.verifiedAt !== undefined) ||
    state.hasVerifiedSession;
  if (verified) return { allow: true, mode: "email" };
  return { allow: false, reason: "needs_verification" };
}

// ---------------------------------------------------------------------------
// Report-version scoping
// ---------------------------------------------------------------------------

export type ReportVersionRequest =
  | { ok: true; version: number }
  | { ok: false; reason: "invalid" | "out_of_scope" };

/**
 * Validate and scope a `?version=` report request to the authorized audit.
 *
 * The version lookup in artifact routes MUST stay scoped to the audit that the
 * canonical access decision already authorized. This primitive rejects
 * non-positive/non-integer versions and any request whose audit id differs from
 * the authorized audit.
 */
export function resolveReportVersionRequest(input: {
  requestedVersion: number | null;
  auditId: string;
  authorizedAuditId: string;
}): ReportVersionRequest {
  if (input.requestedVersion === null) return { ok: true, version: -1 };
  if (
    !Number.isInteger(input.requestedVersion) ||
    input.requestedVersion <= 0
  ) {
    return { ok: false, reason: "invalid" };
  }
  if (input.auditId !== input.authorizedAuditId) {
    return { ok: false, reason: "out_of_scope" };
  }
  return { ok: true, version: input.requestedVersion };
}

// ---------------------------------------------------------------------------
// Route gate helpers (pure status mapping used BEFORE any service-role read)
// ---------------------------------------------------------------------------

export type AuditAccessError = "not_found" | "forbidden" | "unauthorized";

export interface GateError {
  status: 401 | 403 | 404 | 410;
  error: string;
}

/**
 * Pure mapping of the audit artifact access result to an HTTP gate.
 * Routes MUST evaluate this gate before constructing a service-role client or
 * downloading anything; the mapping itself has no I/O and cannot leak paths.
 */
export function auditAccessGate(
  access: { audit: unknown } | { error: AuditAccessError },
): { ok: true } | { ok: false; status: 401 | 403 | 404; error: string } {
  if ("audit" in access) return { ok: true };
  const status = access.error === "unauthorized" ? 401 : access.error === "forbidden" ? 403 : 404;
  return { ok: false, status, error: access.error };
}

export type ShareAccessError =
  | "invalid"
  | "expired"
  | "revoked"
  | "not_ready"
  | "not_found"
  | "needs_verification";

/**
 * Pure mapping of the share-link access result to an HTTP gate. `needsVerification`
 * (email mode without a verified session) is handled by the caller as 403.
 */
export function shareAccessGate(
  access:
    | { audit: unknown; link: unknown; mode: string }
    | { audit: unknown; link: unknown; mode: string; needsVerification: true }
    | { error: ShareAccessError },
): { ok: true; needsVerification?: true } | { ok: false; status: 401 | 403 | 404 | 410; error: string } {
  if ("audit" in access) {
    if ("needsVerification" in access && access.needsVerification) {
      return { ok: false, status: 403, error: "Email verification required" };
    }
    return { ok: true };
  }
  const status =
    access.error === "not_found" ? 404 : access.error === "revoked" || access.error === "expired" ? 410 : 403;
  return { ok: false, status, error: access.error };
}

// ---------------------------------------------------------------------------
// Client-output redaction (private paths / service-role credentials)
// ---------------------------------------------------------------------------

export const REDACTED = "[redacted]";

const PRIVATE_PATH_PATTERN =
  /(?:reports|pdfs)\/[a-z0-9-]+\/(?:revisions\/)?[^\s"'`]+/gi;
const JWT_LIKE_PATTERN =
  /eyJ[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+){2,}/g;
const SECRET_LIKE_PATTERN =
  /\b(?:sb_secret_|service_role|SUPABASE_SERVICE_ROLE_KEY)[A-Za-z0-9_=:.\-]*/gi;
const LONG_TOKEN_PATTERN =
  /\b[A-Za-z0-9_\-]{40,}\b/g;

/**
 * Redact private storage paths and service-role-looking credentials from any
 * string that could reach client output (e.g. storage download error messages).
 * Fails closed: anything that looks like a path or credential becomes
 * `[redacted]`, never a partial echo.
 */
export function redactStorageError(message: string | null | undefined): string {
  if (!message) return "Download failed";
  return message
    .replace(PRIVATE_PATH_PATTERN, REDACTED)
    .replace(JWT_LIKE_PATTERN, REDACTED)
    .replace(SECRET_LIKE_PATTERN, REDACTED)
    .replace(LONG_TOKEN_PATTERN, REDACTED);
}

// ---------------------------------------------------------------------------
// Email-share session cookie reachability
// ---------------------------------------------------------------------------

/**
 * The two routes that must share one verified email session:
 *   - the landing/verification page:  /s/{token}
 *   - the report artifact route:      /api/share/{token}/report
 */
export function shareRoutesForToken(token: string): readonly string[] {
  return [`/s/${token}`, `/api/share/${token}/report`];
}

/**
 * Canonical session cookie path for a share token. A cookie set on `/s/{token}`
 * alone is never sent to `/api/share/{token}/report`, which would silently
 * break the verified email flow. The token-scoped cookie name already isolates
 * one token from another, so the single path that covers BOTH routes is `/`.
 * The value is a bare `verified` marker; no share content or credential lives
 * in the cookie.
 */
export function shareCookiePath(_token: string): string {
  return "/";
}

/** True when every share route for the token is covered by `cookiePath`. */
export function isShareCookieReachable(
  cookiePath: string,
  token: string,
): boolean {
  const normalized = cookiePath.endsWith("/") ? cookiePath : `${cookiePath}/`;
  return shareRoutesForToken(token).every((route) => route.startsWith(normalized));
}

/** Token-scoped, httpOnly session cookie name. */
export function shareSessionCookieName(token: string): string {
  return `alm_share_${token}`;
}

/** Validate a share token shape so cookie names cannot be abused. */
export function isValidShareToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{8,128}$/.test(token);
}
