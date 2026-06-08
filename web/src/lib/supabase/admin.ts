import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

/**
 * Service-role Supabase client. BYPASSES Row Level Security.
 *
 * Server-only. Never import this into a Client Component. Use it sparingly for
 * trusted server-side workflows (e.g. Stripe webhook handlers reconciling
 * plan/subscription state). The Python Hermes worker uses the same service-role
 * key independently.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
