import { INSTAGRAM_OAUTH_PERMISSIONS } from "./instagram-oauth-url";

type InstagramOAuthConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type InstagramTokens = {
  accessToken: string;
  igUserId: string;
  igUsername: string;
  accountType: "BUSINESS" | "CREATOR";
  followersCount: number | null;
  mediaCount: number | null;
  expiresIn: number;
  grantedPermissions: string[];
};

function reportOAuthResponseFailure(
  errorCode: string,
  response: Response,
  payload: unknown,
) {
  const record = payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : {};
  const nested = record.error && typeof record.error === "object"
    ? record.error as Record<string, unknown>
    : {};
  const message = typeof record.error_message === "string"
    ? record.error_message
    : typeof nested.message === "string" ? nested.message : "";
  const upstreamCode = record.code ?? nested.code;
  // Never log upstream text, credentials, IDs, URLs, or token contents.
  console.warn("Instagram OAuth response rejected", {
    stage: errorCode,
    httpStatus: response.status,
    upstreamCode: typeof upstreamCode === "number" ? upstreamCode : null,
    category: /secret/i.test(message) ? "app_secret"
      : /redirect/i.test(message) ? "redirect_uri"
      : /code/i.test(message) ? "authorization_code"
      : /client|app/i.test(message) ? "app_configuration"
      : /permission|scope/i.test(message) ? "permissions" : "other",
    hasToken: typeof record.access_token === "string",
    hasUserId: record.user_id != null,
    hasPermissions: record.permissions != null,
    dataCount: Array.isArray(record.data) ? record.data.length : null,
  });
}

async function responseJson<T>(response: Response, errorCode: string): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    reportOAuthResponseFailure(errorCode, response, null);
    throw new Error(errorCode);
  }
  if (!response.ok) {
    reportOAuthResponseFailure(errorCode, response, payload);
    throw new Error(errorCode);
  }
  return payload as T;
}

async function boundedFetch(
  fetchImpl: typeof fetch,
  input: string,
  init: RequestInit,
  errorCode: string,
): Promise<Response> {
  try {
    return await fetchImpl(input, init);
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
  const timeoutMs = config.timeoutMs ?? 10_000;
  const requestSignal = () => AbortSignal.timeout(timeoutMs);
  const tokenBody = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
    code,
  });
  const shortResponse = await boundedFetch(
    fetchImpl,
    "https://api.instagram.com/oauth/access_token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody,
      cache: "no-store",
      signal: requestSignal(),
    },
    "instagram_token_exchange_failed",
  );
  const shortPayload = await responseJson<{
    data?: Array<{
      access_token?: string;
      user_id?: string | number;
      permissions?: string | string[];
    }>;
  }>(shortResponse, "instagram_token_exchange_failed");
  if (!Array.isArray(shortPayload.data) || shortPayload.data.length !== 1) {
    reportOAuthResponseFailure("instagram_token_exchange_failed", shortResponse, shortPayload);
    throw new Error("instagram_token_exchange_failed");
  }
  const shortToken = shortPayload.data[0];
  if (!shortToken.access_token || shortToken.user_id == null) {
    throw new Error("instagram_token_exchange_failed");
  }
  const grantedPermissions = Array.isArray(shortToken.permissions)
    ? shortToken.permissions
    : (shortToken.permissions ?? "")
        .split(",")
        .map((permission) => permission.trim())
        .filter(Boolean);
  if (
    !INSTAGRAM_OAUTH_PERMISSIONS.every((permission) =>
      grantedPermissions.includes(permission),
    )
  ) {
    throw new Error("instagram_permissions_not_granted");
  }

  const longParams = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: config.appSecret,
    access_token: shortToken.access_token,
  });
  const longResponse = await boundedFetch(
    fetchImpl,
    `https://graph.instagram.com/access_token?${longParams}`,
    { cache: "no-store", signal: requestSignal() },
    "instagram_long_lived_exchange_failed",
  );
  const longToken = await responseJson<{
    access_token?: string;
    expires_in?: number;
  }>(longResponse, "instagram_long_lived_exchange_failed");
  if (!longToken.access_token) {
    throw new Error("instagram_long_lived_exchange_failed");
  }

  const profileParams = new URLSearchParams({
    fields: "user_id,username,account_type,followers_count,media_count",
    access_token: longToken.access_token,
  });
  const profileResponse = await boundedFetch(
    fetchImpl,
    `https://graph.instagram.com/v21.0/me?${profileParams}`,
    { cache: "no-store", signal: requestSignal() },
    "instagram_profile_fetch_failed",
  );
  const profile = await responseJson<{
    user_id?: string | number;
    username?: string;
    account_type?: string;
    followers_count?: number;
    media_count?: number;
  }>(profileResponse, "instagram_profile_fetch_failed");

  const accountType = profile.account_type?.toUpperCase();
  const normalizedAccountType =
    accountType === "MEDIA_CREATOR" || accountType === "CREATOR"
      ? "CREATOR"
      : accountType === "BUSINESS"
        ? "BUSINESS"
        : null;
  if (!normalizedAccountType) {
    throw new Error("instagram_professional_account_required");
  }
  if (!profile.username || profile.user_id == null) {
    throw new Error("instagram_profile_fetch_failed");
  }

  return {
    accessToken: longToken.access_token,
    igUserId: String(profile.user_id),
    igUsername: profile.username,
    accountType: normalizedAccountType,
    followersCount:
      typeof profile.followers_count === "number" && Number.isFinite(profile.followers_count)
        ? profile.followers_count
        : null,
    mediaCount:
      typeof profile.media_count === "number" && Number.isFinite(profile.media_count)
        ? profile.media_count
        : null,
    expiresIn: Number(longToken.expires_in ?? 5_184_000),
    grantedPermissions,
  };
}
