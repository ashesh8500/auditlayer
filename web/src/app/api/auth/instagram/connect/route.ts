import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const APP_ID = process.env.FACEBOOK_APP_ID;
const APP_SECRET = process.env.FACEBOOK_APP_SECRET;

/**
 * POST /api/auth/instagram/connect
 * Receives a Facebook access token from the JS SDK, exchanges it for a
 * long-lived token, finds the user's Instagram Business account, and stores
 * the connection in Supabase.
 */
export async function POST(request: NextRequest) {
  try {
    const { access_token } = await request.json();
    if (!access_token) {
      return NextResponse.json({ error: "No access token provided" }, { status: 400 });
    }

    // Get the authenticated user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!APP_ID || !APP_SECRET) {
      return NextResponse.json(
        { error: "App not configured — missing FACEBOOK_APP_ID or FACEBOOK_APP_SECRET" },
        { status: 500 },
      );
    }

    // Step 1: Exchange short-lived FB token for long-lived token
    const llParams = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: APP_ID,
      client_secret: APP_SECRET,
      fb_exchange_token: access_token,
    });
    const llRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?${llParams}`,
    );
    if (!llRes.ok) throw new Error("Failed to exchange for long-lived token");
    const { access_token: longLivedToken, expires_in } = await llRes.json();

    // Step 2: Get the user's Facebook Pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedToken}`,
    );
    if (!pagesRes.ok) throw new Error("Failed to fetch Facebook Pages");
    const { data: pages } = await pagesRes.json();

    // Step 3: Find Instagram Business accounts connected to those Pages
    let igAccount: any = null;
    for (const page of pages || []) {
      const igRes = await fetch(
        `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account{id,username,followers_count,media_count,account_type}&access_token=${longLivedToken}`,
      );
      if (!igRes.ok) continue;
      const pageData = await igRes.json();
      if (pageData.instagram_business_account) {
        igAccount = pageData.instagram_business_account;
        break;
      }
    }

    if (!igAccount) {
      return NextResponse.json({
        error:
          "No Instagram Business or Creator account found. Make sure your Instagram account is set to Business or Creator type and connected to a Facebook Page.",
      }, { status: 400 });
    }

    // Step 4: Store in Supabase
    const adminClient = createAdminClient();
    const { error: dbError } = await (adminClient as any)
      .from("instagram_connections")
      .upsert(
        {
          user_id: user.id,
          ig_user_id: parseInt(igAccount.id, 10),
          ig_username: igAccount.username,
          long_lived_token: longLivedToken,
          long_lived_expires_at: new Date(
            Date.now() + (expires_in || 60 * 24 * 60 * 60) * 1000,
          ).toISOString(),
          account_type: igAccount.account_type || "BUSINESS",
          followers_count: igAccount.followers_count || 0,
          media_count: igAccount.media_count || 0,
          is_active: true,
          last_refreshed_at: new Date().toISOString(),
        },
        { onConflict: "user_id, ig_user_id" },
      );

    if (dbError) throw dbError;

    return NextResponse.json({
      success: true,
      ig_username: igAccount.username,
    });
  } catch (err: any) {
    console.error("Instagram connect error:", err);
    return NextResponse.json(
      { error: err.message?.slice(0, 300) || "Unknown error" },
      { status: 500 },
    );
  }
}
