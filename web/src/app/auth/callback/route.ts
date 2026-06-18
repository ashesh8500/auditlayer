import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";

import {
  isSupabaseConfigured,
  supabaseAnonKey,
  supabaseUrl,
} from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

const AUTH_NEXT_COOKIE = "auth_next";
const TRIAL_TOKEN_COOKIE = "alm_trial_token";

function safeNext(value: string | null | undefined): string {
  if (value?.startsWith("/") && !value.startsWith("//")) return value;
  return "/dashboard";
}

/**
 * Auth callback for Google OAuth (`code` PKCE exchange) and magic links
 * (`token_hash` + server-side verifyOtp). Magic links must use the custom
 * email template — PKCE `code` links fail when opened from mail apps.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const cookieStore = await cookies();
  const next = safeNext(
    searchParams.get("next") ?? cookieStore.get(AUTH_NEXT_COOKIE)?.value,
  );

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(`${origin}/login?error=unconfigured`);
  }

  let response = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient<Database>(
    supabaseUrl(),
    supabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.redirect(`${origin}${next}`);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
      return NextResponse.redirect(`${origin}/login?error=auth`);
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (error) {
      console.error("[auth/callback] verifyOtp failed:", error.message);
      return NextResponse.redirect(`${origin}/login?error=auth`);
    }
  } else {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  // Process trial token cookie if present (both OAuth and magic link paths)
  const trialToken = request.cookies.get(TRIAL_TOKEN_COOKIE)?.value;
  if (trialToken) {
    try {
      const admin = createAdminClient();

      // Validate trial link
      const { data: trialLink, error: trialError } = await (admin as any)
        .from("trial_links")
        .select("id, audits_granted, revoked_at, expires_at, max_uses, used_count")
        .eq("token", trialToken)
        .maybeSingle();

      if (
        !trialError &&
        trialLink &&
        !trialLink.revoked_at &&
        (!trialLink.expires_at || new Date(trialLink.expires_at) > new Date()) &&
        (trialLink.max_uses === null || trialLink.used_count < trialLink.max_uses)
      ) {
        // Get the authenticated user
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          // Update profile: set account_type, gifted_audits, trial_link_id
          await admin
            .from("profiles")
            .update({
              account_type: "trial",
              gifted_audits: trialLink.audits_granted,
              trial_link_id: trialLink.id,
            })
            .eq("id", user.id);

          // Increment used_count on trial link
          await (admin as any)
            .from("trial_links")
            .update({ used_count: trialLink.used_count + 1 })
            .eq("id", trialLink.id);

          // Log admin action
          try {
            await (admin as any).from("admin_actions").insert({
              actor_id: user.id,
              target_user_id: user.id,
              action: "trial_redeemed",
              detail: {
                trial_link_id: trialLink.id,
                token: trialToken,
                audits_granted: trialLink.audits_granted,
              },
            });
          } catch (e: any) {
            console.error("admin_actions insert failed (trial_redeemed):", e.message);
          }
        }
      }
    } catch (e: any) {
      console.error("[auth/callback] trial token processing failed:", e.message);
    }

    // Always clear the trial token cookie
    response.cookies.set(TRIAL_TOKEN_COOKIE, "", { maxAge: 0, path: "/" });
  }

  response.cookies.set(AUTH_NEXT_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}
