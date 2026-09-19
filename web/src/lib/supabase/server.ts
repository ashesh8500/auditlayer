import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "./types";

/**
 * Supabase client for use in Server Components, Route Handlers, and Server
 * Actions. Honours the user's session via the request cookies and refreshes
 * tokens through the cookie store.
 *
 * Note: in Server Components the cookie store is read-only, so writes are
 * swallowed. Token refresh writes happen in middleware / Route Handlers.
 */
export async function createClient({ freshSignIn = false }: { freshSignIn?: boolean } = {}) {
  const cookieStore = await cookies();
  // Keep cookie names for obsolete-chunk cleanup, but never refresh the old
  // session while establishing a new one. This jar is request-local.
  const signInCookies = new Map(cookieStore.getAll().map(({ name, value }) =>
    [name, { name, value: /-code-verifier(?:\.\d+)?$/.test(name) ? value : "" }],
  ));

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return freshSignIn ? [...signInCookies.values()] : cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              signInCookies.set(name, { name, value });
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component where cookies are read-only.
            // Session refresh is handled in middleware / Route Handlers.
          }
        },
      },
    },
  );
}
