import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { safeNext } from "@/lib/auth/redirects";
import type { Database } from "./types";
import {
  isSupabaseConfigured,
  supabaseAnonKey,
  supabaseUrl,
} from "@/lib/env";

const PROTECTED_PREFIXES = ["/dashboard", "/audits", "/admin", "/subjects", "/accounts", "/settings"];

function isProtected(pathname: string): boolean {
  // /s/ routes are public share links — skip auth
  if (pathname === "/s" || pathname.startsWith("/s/")) return false;
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Refreshes the Supabase auth session cookie and performs an optimistic
 * authentication redirect for protected routes. Secure role checks
 * (admin gating) still happen server-side in the Data Access Layer.
 *
 * Build/runtime safe: when Supabase env is absent this is a no-op pass-through
 * so the public landing + login pages render without credentials.
 */
export async function updateSession(
  request: NextRequest,
): Promise<NextResponse> {
  // OAuth verifier cookies are host-only. Normalize the public alias before
  // rendering login or initiating any flow that returns to the canonical host.
  if (request.nextUrl.hostname === "www.auditlayermedia.com") {
    const canonical = request.nextUrl.clone();
    canonical.hostname = "auditlayermedia.com";
    canonical.protocol = "https:";
    canonical.port = "";
    return NextResponse.redirect(canonical, 308);
  }

  let response = NextResponse.next({ request });

  // The callback authenticates by exchanging the new code itself. Refreshing
  // a revoked previous session here deletes the fresh PKCE verifier first.
  if (request.nextUrl.pathname === "/auth/callback") return response;

  if (!isSupabaseConfigured()) {
    return response;
  }

  const supabase = createServerClient<Database>(
    supabaseUrl(),
    supabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Passive refresh must not cancel an independent in-flight sign-in.
          // Continue clearing revoked session cookies, never its PKCE verifier.
          const sessionCookies = cookiesToSet.filter(
            ({ name }) => !/-code-verifier(?:\.\d+)?$/.test(name),
          );
          sessionCookies.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          sessionCookies.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  if (!user && isProtected(pathname)) {
    const url = request.nextUrl.clone();
    const next = safeNext(pathname + request.nextUrl.search);
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  return response;
}
