import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * Returns the authenticated user (verified against the Supabase Auth server),
 * or null. Build-safe: returns null when Supabase env is absent so public
 * pages can render without credentials.
 *
 * Memoized per-request via React `cache` so repeated calls in a render pass
 * don't re-hit the auth server.
 */
export const getSession = cache(async (): Promise<User | null> => {
  // Touch cookies() unconditionally so every consuming route is treated as
  // dynamic (session-dependent) regardless of whether env is configured at
  // build time. Without this, routes can be wrongly prerendered as static.
  await cookies();
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ?? null;
  } catch {
    return null;
  }
});

/** The current user's profile row, or null if unauthenticated. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getSession();
  if (!user) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
});

/** Require an authenticated user or redirect to /login. */
export async function requireUser(): Promise<User> {
  const user = await getSession();
  if (!user) redirect("/login");
  return user;
}

/** Require an authenticated user + profile or redirect to /login. */
export async function requireProfile(): Promise<Profile> {
  await requireUser();
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}

/** Require an admin (server-side `profiles.role = 'admin'`) or redirect. */
export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  return profile;
}

/** Non-redirecting admin check for conditional UI. */
export async function isAdmin(): Promise<boolean> {
  const profile = await getProfile();
  return profile?.role === "admin";
}
