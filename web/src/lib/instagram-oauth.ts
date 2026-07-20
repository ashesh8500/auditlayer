type InstagramOAuthConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
};

export type InstagramTokens = {
  accessToken: string;
  igUserId: string;
  igUsername: string;
  accountType: "BUSINESS" | "CREATOR";
  followersCount: number;
  mediaCount: number;
  expiresIn: number;
};

async function responseJson<T>(response: Response, errorCode: string): Promise<T> {
  if (!response.ok) throw new Error(errorCode);
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(errorCode);
  }
}

/**
 * Complete the Instagram API with Instagram Login exchange.
 * Keep this module server-side: its caller supplies the protected app secret.
 */
export async function completeInstagramOAuth(
  code: string,
  config: InstagramOAuthConfig,
): Promise<InstagramTokens> {
  if (!code || !config.appId || !config.appSecret || !config.redirectUri) {
    throw new Error("instagram_oauth_not_configured");
  }

  const fetchImpl = config.fetchImpl ?? fetch;
  const tokenBody = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
    code,
  });
  const shortResponse = await fetchImpl(
    "https://api.instagram.com/oauth/access_token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody,
      cache: "no-store",
    },
  );
  const shortToken = await responseJson<{
    access_token?: string;
    user_id?: string | number;
  }>(shortResponse, "instagram_token_exchange_failed");
  if (!shortToken.access_token || shortToken.user_id == null) {
    throw new Error("instagram_token_exchange_failed");
  }

  const longParams = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: config.appSecret,
    access_token: shortToken.access_token,
  });
  const longResponse = await fetchImpl(
    `https://graph.instagram.com/access_token?${longParams}`,
    { cache: "no-store" },
  );
  const longToken = await responseJson<{
    access_token?: string;
    expires_in?: number;
  }>(longResponse, "instagram_long_lived_exchange_failed");
  if (!longToken.access_token) {
    throw new Error("instagram_long_lived_exchange_failed");
  }

  const profileParams = new URLSearchParams({
    fields: "id,username,account_type,followers_count,media_count",
    access_token: longToken.access_token,
  });
  const profileResponse = await fetchImpl(
    `https://graph.instagram.com/v21.0/me?${profileParams}`,
    { cache: "no-store" },
  );
  const profile = await responseJson<{
    id?: string | number;
    username?: string;
    account_type?: string;
    followers_count?: number;
    media_count?: number;
  }>(profileResponse, "instagram_profile_fetch_failed");

  const normalizedAccountType =
    profile.account_type === "MEDIA_CREATOR" || profile.account_type === "CREATOR"
      ? "CREATOR"
      : profile.account_type === "BUSINESS"
        ? "BUSINESS"
        : null;
  if (!normalizedAccountType) {
    throw new Error("instagram_professional_account_required");
  }
  if (!profile.username) throw new Error("instagram_profile_fetch_failed");

  return {
    accessToken: longToken.access_token,
    igUserId: String(profile.id ?? shortToken.user_id),
    igUsername: profile.username,
    accountType: normalizedAccountType,
    followersCount: Number(profile.followers_count ?? 0),
    mediaCount: Number(profile.media_count ?? 0),
    expiresIn: Number(longToken.expires_in ?? 5_184_000),
  };
}
