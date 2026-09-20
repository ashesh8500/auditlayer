import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";

import {
  isSupabaseConfigured,
  supabaseAnonKey,
  supabaseUrl,
} from "@/lib/env";
import { randomUUID } from "node:crypto";
import { safeNext, loginRecoveryUrl } from "@/lib/auth/redirects";
import type { Database } from "@/lib/supabase/types";

const AUTH_NEXT_COOKIE = "auth_next";
const TRIAL_TOKEN_COOKIE = "alm_trial_token";


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

  const trialToken = request.cookies.get(TRIAL_TOKEN_COOKIE)?.value;
  const recovery = (error: string) => NextResponse.redirect(`${origin}${loginRecoveryUrl(next, error, trialToken)}`);

  if (!isSupabaseConfigured()) {
    return recovery("unconfigured");
  }

  const response = NextResponse.redirect(`${origin}${trialToken ? loginRecoveryUrl(next, undefined, trialToken) : next}`);

  // Start the explicit authentication exchange without the previous session.
  // A revoked refresh token must not erase this login's fresh PKCE verifier.
  // Retain writes in this request-local jar so trial redemption sees the newly
  // verified session, not the old one. Never trust the verifier as a session.
  const authCookies = new Map(
    request.cookies.getAll().map(({ name, value }) =>
      [name, { name, value: /-code-verifier(?:\.\d+)?$/.test(name) ? value : "" }],
    ),
  );

  const supabase = createServerClient<Database>(
    supabaseUrl(),
    supabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return [...authCookies.values()];
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            authCookies.set(name, { name, value });
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
      return recovery("auth");
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (error) {
      console.error("[auth/callback] verifyOtp failed:", error.message);
      return recovery("auth");
    }
  } else {
    return recovery("auth");
  }

  // Trial redemption is an explicit authenticated POST on the claim screen.
  // Never clear an unclaimed invite or imply sign-in also granted entitlements.
  for (const resource of ["reports", "subjects"] as const) {
    response.cookies.set(`alm-${resource}-revision`, randomUUID(), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
    });
  }

  response.cookies.set(AUTH_NEXT_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}
