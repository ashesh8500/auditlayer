import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";

import {
  isSupabaseConfigured,
  supabaseAnonKey,
  supabaseUrl,
} from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

const AUTH_NEXT_COOKIE = "auth_next";

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

  response.cookies.set(AUTH_NEXT_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}
