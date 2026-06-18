"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  isBrandedMagicLinkConfigured,
  sendBrandedMagicLink,
} from "@/lib/auth/magic-link-email";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, siteUrl } from "@/lib/env";

const AUTH_NEXT_COOKIE = "auth_next";
const TRIAL_COOKIE = "alm_trial_token";

export interface AuthFormState {
  status: "idle" | "sent" | "error";
  message?: string;
}

const emailSchema = z.email({ error: "Enter a valid email address." });

function safeNext(next: FormDataEntryValue | null): string {
  const value = typeof next === "string" ? next : "";
  // Only allow same-site relative paths to prevent open redirects.
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return "/dashboard";
}

/** Persist the trial token cookie to survive the auth redirect flow. */
async function persistTrialCookie(trial: FormDataEntryValue | null): Promise<void> {
  const token = typeof trial === "string" ? trial.trim() : "";
  if (!token) return;
  const cookieStore = await cookies();
  cookieStore.set(TRIAL_COOKIE, token, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export async function signInWithMagicLink(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Authentication is not configured yet. Check back shortly.",
    };
  }

  const parsed = emailSchema.safeParse(
    String(formData.get("email") ?? "").trim().toLowerCase(),
  );
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message };
  }

  const next = safeNext(formData.get("next"));
  const cookieStore = await cookies();
  cookieStore.set(AUTH_NEXT_COOKIE, next, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 3600,
    path: "/",
  });

  // Persist trial token through the magic-link redirect
  await persistTrialCookie(formData.get("trial"));

  if (isBrandedMagicLinkConfigured()) {
    const sent = await sendBrandedMagicLink(parsed.data);
    if (!sent.ok) {
      return { status: "error", message: sent.message };
    }
  } else {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data,
      options: {
        // Requires supabase/templates/magic_link.html on the project (token_hash
        // link). Default Supabase {{ .ConfirmationURL }} breaks in mail apps.
        emailRedirectTo: `${siteUrl()}/auth/callback`,
      },
    });

    if (error) {
      return { status: "error", message: error.message };
    }
  }

  return {
    status: "sent",
    message: "Check your inbox for a secure sign-in link.",
  };
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  if (!isSupabaseConfigured()) {
    redirect("/login?error=unconfigured");
  }

  const next = safeNext(formData.get("next"));

  // Persist trial token through the Google OAuth redirect
  await persistTrialCookie(formData.get("trial"));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data?.url) {
    redirect("/login?error=oauth");
  }

  redirect(data.url);
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
