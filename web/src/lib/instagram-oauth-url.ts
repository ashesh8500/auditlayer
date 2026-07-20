/** Client-safe helpers for Instagram Business Login OAuth. */

export const INSTAGRAM_OAUTH_SCOPE = "instagram_business_basic";

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

/** Reject absent state as well as mismatches. */
export function instagramOAuthStateMatches(
  expected: string | undefined,
  returned: string | null | undefined,
): boolean {
  return Boolean(expected && returned && expected === returned);
}
