import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { completeInstagramOAuth } from "@/lib/instagram-oauth";
import {
  INSTAGRAM_OAUTH_STATE_COOKIE,
  instagramOAuthServerConfig,
} from "@/lib/instagram-oauth-config";
import { instagramOAuthStateMatches } from "@/lib/instagram-oauth-url";
import { isSupabaseConfigured } from "@/lib/env";
import {
  captureWebFailure,
  type WebFailureContext,
} from "@/lib/sentry";

const STATE_COOKIE_PATH = "/api/auth/instagram/callback";

function clearStateCookie(response: NextResponse) {
  response.cookies.set(INSTAGRAM_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: STATE_COOKIE_PATH,
    maxAge: 0,
  });
}

function dashboardRedirect(
  request: NextRequest,
  parameter: "instagram_connected" | "instagram_error",
  value: string,
) {
  const response = NextResponse.redirect(
    new URL(`/dashboard?${parameter}=${encodeURIComponent(value)}`, request.url),
  );
  clearStateCookie(response);
  return response;
}

function unauthenticatedRedirect(request: NextRequest) {
  const response = NextResponse.redirect(
    new URL("/login?next=/dashboard&instagram_error=not_authenticated", request.url),
  );
  clearStateCookie(response);
  return response;
}

const OAUTH_FAILURE_CONTEXT: Record<string, WebFailureContext> = {
  instagram_oauth_not_configured: {
    surface: "instagram_oauth",
    operation: "oauth_callback",
    status: "failed",
    errorClass: "OAuthConfigError",
  },
  instagram_token_exchange_failed: {
    surface: "instagram_oauth",
    operation: "token_exchange",
    status: "failed",
    errorClass: "OAuthTokenExchangeError",
  },
  instagram_permissions_not_granted: {
    surface: "instagram_oauth",
    operation: "permission_validation",
    status: "rejected",
    errorClass: "OAuthExchangeError",
  },
  instagram_long_lived_exchange_failed: {
    surface: "instagram_oauth",
    operation: "long_lived_token_exchange",
    status: "failed",
    errorClass: "OAuthLongLivedExchangeError",
  },
  instagram_profile_fetch_failed: {
    surface: "instagram_oauth",
    operation: "profile_fetch",
    status: "failed",
    errorClass: "InstagramProfileFetchError",
  },
  instagram_professional_account_required: {
    surface: "instagram_oauth",
    operation: "profile_fetch",
    status: "rejected",
    errorClass: "InstagramProfessionalAccountRequiredError",
  },
  instagram_connection_store_failed: {
    surface: "instagram_persistence",
    operation: "connection_persist",
    status: "failed",
    errorClass: "InstagramConnectionStoreError",
  },
};

/**
 * Direct Instagram Business Login callback.
 * Validates user-bound CSRF state, exchanges the code server-side, and stores
 * the professional connection plus workspace account in one DB transaction.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const returnedState = searchParams.get("state");
  const stateCookie = request.cookies.get(INSTAGRAM_OAUTH_STATE_COOKIE)?.value;

  if (!isSupabaseConfigured()) {
    return unauthenticatedRedirect(request);
  }

  let user: { id: string } | null = null;
  try {
    const supabase = await createClient();
    const { data, error: authError } = await supabase.auth.getUser();
    if (!authError) user = data.user;
  } catch (error) {
    captureWebFailure(error, {
      surface: "instagram_oauth",
      operation: "oauth_callback",
      status: "failed",
      errorClass: "OAuthExchangeError",
    });
    user = null;
  }
  if (!user) {
    return unauthenticatedRedirect(request);
  }

  const userBoundState = returnedState ? `${user.id}:${returnedState}` : null;
  if (!instagramOAuthStateMatches(stateCookie, userBoundState)) {
    captureWebFailure(new Error("instagram_oauth_state_invalid"), {
      surface: "instagram_oauth",
      operation: "oauth_callback",
      status: "rejected",
      errorClass: "OAuthExchangeError",
    });
    return dashboardRedirect(request, "instagram_error", "invalid_state");
  }
  if (searchParams.get("error")) {
    return dashboardRedirect(request, "instagram_error", "permission_denied");
  }
  if (!code) {
    return dashboardRedirect(request, "instagram_error", "no_code");
  }

  try {
    const config = instagramOAuthServerConfig();
    const tokens = await completeInstagramOAuth(code, config);
    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();
    const adminClient = createAdminClient();
    const { error: dbError } = await (adminClient as any).rpc(
      "persist_instagram_connection",
      {
        p_user_id: user.id,
        p_ig_user_id: tokens.igUserId,
        p_ig_username: tokens.igUsername,
        p_long_lived_token: tokens.accessToken,
        p_long_lived_expires_at: expiresAt,
        p_account_type: tokens.accountType,
        p_followers_count: tokens.followersCount,
        p_media_count: tokens.mediaCount,
        p_graph_api_family: "instagram",
      },
    );
    if (dbError) throw new Error("instagram_connection_store_failed");

    return dashboardRedirect(
      request,
      "instagram_connected",
      tokens.igUsername,
    );
  } catch (error) {
    const errorCode =
      error instanceof Error &&
      [
        "instagram_oauth_not_configured",
        "instagram_token_exchange_failed",
        "instagram_permissions_not_granted",
        "instagram_long_lived_exchange_failed",
        "instagram_profile_fetch_failed",
        "instagram_professional_account_required",
        "instagram_connection_store_failed",
      ].includes(error.message)
        ? error.message
        : "connection_failed";
    captureWebFailure(
      error,
      OAUTH_FAILURE_CONTEXT[errorCode] ?? {
        surface: "instagram_oauth",
        operation: "oauth_callback",
        status: "failed",
        errorClass: "OAuthExchangeError",
      },
    );
    console.error("Instagram OAuth callback failed", { code: errorCode });
    return dashboardRedirect(request, "instagram_error", errorCode);
  }
}
