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
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
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
