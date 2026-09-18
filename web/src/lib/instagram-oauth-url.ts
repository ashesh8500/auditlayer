/** Client-safe helpers for Instagram Business Login OAuth. */

export const INSTAGRAM_OAUTH_PERMISSIONS = [
  "instagram_business_basic",
  "instagram_business_manage_insights",
] as const;

export const INSTAGRAM_OAUTH_SCOPE = INSTAGRAM_OAUTH_PERMISSIONS.join(",");

type InstagramAuthUrlOptions = {
  appId: string;
  redirectUri: string;
  state: string;
};

/** Build the direct Instagram Business Login authorization URL. */
export function buildInstagramAuthUrl({
  appId,
  redirectUri,
  state,
}: InstagramAuthUrlOptions): string {
  if (!appId || !redirectUri || !state) {
    throw new Error("instagram_oauth_not_configured");
  }

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: INSTAGRAM_OAUTH_SCOPE,
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${params}`;
}

export const CONNECTIONS_PATH = "/settings/connections";
export const CONNECTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Exact route allowlist: never normalize an untrusted URL before checking it. */
export function safeInstagramReturnPath(value: string | null | undefined): string {
  if (value && ([CONNECTIONS_PATH, "/subjects", "/accounts", "/dashboard", "/audits/new"].includes(value) ||
    /^\/(subjects|accounts|audits)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))) return value;
  return CONNECTIONS_PATH;
}

export type InstagramOAuthIntent = {
  ownerId: string;
  state: string;
  expiresAt: number;
  returnTo: string;
  connectionId?: string;
  igUserId?: string;
};

/** Cookie is HttpOnly, short-lived and bound to the authenticated initiating owner. */
export function readInstagramOAuthIntent(cookie: string | undefined, ownerId: string, state: string | null): InstagramOAuthIntent | null {
  try {
    const value = JSON.parse(cookie ?? "") as InstagramOAuthIntent;
    if (!value || value.ownerId !== ownerId || !state || value.state !== state ||
      typeof value.expiresAt !== "number" || value.expiresAt <= Date.now() || value.expiresAt > Date.now() + 600000 ||
      (value.connectionId !== undefined && (typeof value.connectionId !== "string" || !CONNECTION_ID_PATTERN.test(value.connectionId) || typeof value.igUserId !== "string" || !value.igUserId))) return null;
    return { ...value, returnTo: safeInstagramReturnPath(value.returnTo) };
  } catch { return null; }
}

/** Reject absent state as well as mismatches. */
export function instagramOAuthStateMatches(
  expected: string | undefined,
  returned: string | null | undefined,
): boolean {
  return Boolean(expected && returned && expected === returned);
}
