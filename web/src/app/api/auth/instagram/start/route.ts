import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import {
  createInstagramOAuthState,
  INSTAGRAM_OAUTH_STATE_COOKIE,
  INSTAGRAM_OAUTH_STATE_MAX_AGE_SECONDS,
  instagramOAuthServerConfig,
} from "@/lib/instagram-oauth-config";
import { createClient } from "@/lib/supabase/server";
import { CONNECTION_ID_PATTERN, safeInstagramReturnPath, buildInstagramAuthUrl } from "@/lib/instagram-oauth-url";
import { captureWebFailure } from "@/lib/sentry";

/** Start a direct Instagram Business Login flow with a short-lived CSRF cookie. */
export async function GET(request: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.redirect(
      new URL("/login?next=/settings/connections", request.url),
    );
  }

  try {
    const connectionId = request.nextUrl.searchParams.get("connection_id");
    let igUserId: string | undefined;
    if (connectionId) {
      if (!CONNECTION_ID_PATTERN.test(connectionId)) {
        return NextResponse.redirect(new URL("/settings/connections?instagram_error=connection_unavailable", request.url));
      }
      const client = await createClient();
      const { data, error } = await client.from("instagram_connections")
        .select("id,ig_user_id::text").eq("user_id", user.id).eq("id", connectionId).maybeSingle();
      if (error || !data) {
        return NextResponse.redirect(new URL("/settings/connections?instagram_error=connection_unavailable", request.url));
      }
      igUserId = String(data.ig_user_id);
    }
    const returnTo = safeInstagramReturnPath(request.nextUrl.searchParams.get("return_to"));
    const { appId, redirectUri } = instagramOAuthServerConfig();
    const state = createInstagramOAuthState();
    const authorizationUrl = buildInstagramAuthUrl({ appId, redirectUri, state });
    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(INSTAGRAM_OAUTH_STATE_COOKIE, JSON.stringify({ ownerId: user.id, state, returnTo, connectionId: connectionId ?? undefined, igUserId, expiresAt: Date.now() + INSTAGRAM_OAUTH_STATE_MAX_AGE_SECONDS * 1000 }), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/api/auth/instagram/callback",
      maxAge: INSTAGRAM_OAUTH_STATE_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    captureWebFailure(error, {
      surface: "instagram_oauth",
      operation: "oauth_start",
      status: "failed",
      errorClass: "OAuthConfigError",
    });
    return NextResponse.redirect(
      new URL("/settings/connections?instagram_error=not_configured", request.url),
    );
  }
}
