import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { completeInstagramOAuth } from "@/lib/facebook-oauth";

/**
 * Facebook OAuth callback for Instagram Graph API connection.
 * GET /api/auth/instagram/callback?code=...&state=...
 *
 * Completes the OAuth flow: code → tokens → Instagram account → Supabase storage.
 * Redirects back to the dashboard with success/error query params.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Facebook returned an error (user denied permissions, etc.)
  if (error) {
    const msg = errorDescription
      ? `permission_denied: ${errorDescription}`
      : "permission_denied";
    return NextResponse.redirect(
      new URL(`/dashboard?instagram_error=${encodeURIComponent(msg)}`, request.url),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/dashboard?instagram_error=no_code", request.url),
    );
  }

  try {
    // Get the authenticated user
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.redirect(
        new URL("/login?instagram_error=not_authenticated", request.url),
      );
    }

    // Complete OAuth — exchange code for tokens and fetch IG accounts
    const tokens = await completeInstagramOAuth(code);

    // Store in Supabase using admin client (bypasses RLS)
    const adminClient = createAdminClient();

    const { error: dbError } = await (adminClient as any)
      .from("instagram_connections")
      .upsert(
        {
          user_id: user.id,
          ig_user_id: tokens.igUserId,
          ig_username: tokens.igUsername,
          long_lived_token: tokens.accessToken,
          long_lived_expires_at: new Date(
            Date.now() + 60 * 24 * 60 * 60 * 1000, // 60 days
          ).toISOString(),
          account_type: tokens.accountType,
          followers_count: tokens.followersCount,
          media_count: tokens.mediaCount,
          is_active: true,
          last_refreshed_at: new Date().toISOString(),
        },
        { onConflict: "user_id, ig_user_id" },
      );

    if (dbError) throw dbError;

    return NextResponse.redirect(
      new URL(
        `/dashboard?instagram_connected=${encodeURIComponent(tokens.igUsername)}`,
        request.url,
      ),
    );
  } catch (err: any) {
    console.error("Instagram OAuth callback error:", err);
    const msg = err.message?.slice(0, 200) || "unknown_error";
    return NextResponse.redirect(
      new URL(
        `/dashboard?instagram_error=${encodeURIComponent(msg)}`,
        request.url,
      ),
    );
  }
}
