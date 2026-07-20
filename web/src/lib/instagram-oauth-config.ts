import "server-only";

import { randomBytes } from "node:crypto";

import { siteUrl } from "@/lib/env";

export const INSTAGRAM_OAUTH_STATE_COOKIE = "alm_instagram_oauth_state";
export const INSTAGRAM_OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

export function instagramOAuthRedirectUri(): string {
  return `${siteUrl()}/api/auth/instagram/callback`;
}

export function instagramOAuthServerConfig() {
  const appId = process.env.INSTAGRAM_APP_ID ?? "";
  const appSecret = process.env.INSTAGRAM_APP_SECRET ?? "";
  const redirectUri = instagramOAuthRedirectUri();
  if (!appId || !appSecret) throw new Error("instagram_oauth_not_configured");
  return { appId, appSecret, redirectUri };
}

export function createInstagramOAuthState(): string {
  return randomBytes(32).toString("hex");
}
