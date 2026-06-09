// Instagram Business Login token exchange.
// Server-only — never import in client components.
import "server-only";

const APP_ID = process.env.FACEBOOK_APP_ID;
const APP_SECRET = process.env.FACEBOOK_APP_SECRET;

function getRedirectUri() {
  return `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/instagram/callback`;
}

export interface InstagramTokens {
  accessToken: string;
  igUserId: number;
  igUsername: string;
  accountType: "BUSINESS" | "CREATOR";
  followersCount: number;
  mediaCount: number;
}

/**
 * Exchange authorization code for short-lived Instagram access token.
 * POST https://api.instagram.com/oauth/access_token
 */
async function exchangeCode(
  code: string,
): Promise<{ access_token: string; user_id: number }> {
  const body = new URLSearchParams({
    client_id: APP_ID!,
    client_secret: APP_SECRET!,
    grant_type: "authorization_code",
    redirect_uri: getRedirectUri(),
    code,
  });

  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Instagram token error: ${JSON.stringify(err)}`);
  }

  return res.json();
}

/**
 * Exchange short-lived token for long-lived (60-day) token.
 * GET https://graph.instagram.com/access_token
 */
async function exchangeForLongLivedToken(
  shortLivedToken: string,
): Promise<{ access_token: string; expires_in: number }> {
  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: APP_SECRET!,
    access_token: shortLivedToken,
  });

  const res = await fetch(
    `https://graph.instagram.com/access_token?${params}`,
  );

  if (!res.ok) throw new Error("Failed to exchange for long-lived token");
  return res.json();
}

/**
 * Get Instagram Business/Creator profile data using the access token.
 * GET https://graph.instagram.com/v21.0/me
 */
async function getInstagramProfile(
  accessToken: string,
): Promise<{
  id: string;
  username: string;
  account_type: string;
  followers_count: number;
  media_count: number;
}> {
  const params = new URLSearchParams({
    fields:
      "id,username,account_type,followers_count,media_count",
    access_token: accessToken,
  });

  const res = await fetch(
    `https://graph.instagram.com/v21.0/me?${params}`,
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Instagram profile fetch failed: ${err}`);
  }

  return res.json();
}

/**
 * Complete Instagram Business Login flow:
 * code → short-lived token → long-lived token → profile data.
 */
export async function completeInstagramOAuth(
  code: string,
): Promise<InstagramTokens> {
  if (!APP_ID || !APP_SECRET) {
    throw new Error(
      "FACEBOOK_APP_ID and FACEBOOK_APP_SECRET are not configured",
    );
  }

  // Step 1: Exchange code for short-lived token
  const { access_token: shortLivedToken, user_id: igUserId } =
    await exchangeCode(code);

  // Step 2: Exchange for long-lived (60-day) token
  const { access_token: longLivedToken } =
    await exchangeForLongLivedToken(shortLivedToken);

  // Step 3: Get profile data
  const profile = await getInstagramProfile(longLivedToken);

  return {
    accessToken: longLivedToken,
    igUserId,
    igUsername: profile.username,
    accountType: (profile.account_type as "BUSINESS" | "CREATOR") || "BUSINESS",
    followersCount: profile.followers_count || 0,
    mediaCount: profile.media_count || 0,
  };
}
