import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import {
  createInstagramOAuthState,
  INSTAGRAM_OAUTH_STATE_COOKIE,
  INSTAGRAM_OAUTH_STATE_MAX_AGE_SECONDS,
  instagramOAuthServerConfig,
} from "@/lib/instagram-oauth-config";
import { buildInstagramAuthUrl } from "@/lib/instagram-oauth-url";

/** Start a direct Instagram Business Login flow with a short-lived CSRF cookie. */
export async function GET(request: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.redirect(
      new URL("/login?next=/dashboard", request.url),
    );
  }

  try {
    const { appId, redirectUri } = instagramOAuthServerConfig();
    const state = createInstagramOAuthState();
    const authorizationUrl = buildInstagramAuthUrl({ appId, redirectUri, state });
    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(INSTAGRAM_OAUTH_STATE_COOKIE, `${user.id}:${state}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/auth/instagram/callback",
      maxAge: INSTAGRAM_OAUTH_STATE_MAX_AGE_SECONDS,
    });
    return response;
  } catch {
    return NextResponse.redirect(
      new URL("/dashboard?instagram_error=not_configured", request.url),
    );
  }
}
