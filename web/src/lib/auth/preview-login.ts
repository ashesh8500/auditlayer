/**
 * Preview-only test login helpers.
 *
 * Creates (or updates) a dedicated Supabase Auth user, bootstraps plan + demo
 * subjects, and signs the browser session in via password.
 * Hard-gated: never runs when VERCEL_ENV=production.
 */

import "server-only";

import {
  isPreviewLoginAllowed,
  isSupabaseAdminConfigured,
  isSupabaseConfigured,
  previewLoginSecret,
  previewTestUserEmail,
  previewTestUserPassword,
  previewTestUserPlan,
} from "@/lib/env";
import { bootstrapPreviewTesterWorkspace } from "@/lib/auth/preview-seed";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type PreviewLoginResult =
  | { ok: true; email: string }
  | { ok: false; error: string };

function assertPreviewLoginAllowed(): string | null {
  if (!isPreviewLoginAllowed()) {
    return "Preview login is disabled outside Vercel Preview / local development.";
  }
  if (!isSupabaseConfigured() || !isSupabaseAdminConfigured()) {
    return "Supabase is not configured for preview login.";
  }
  if (!previewTestUserPassword()) {
    return "PREVIEW_TEST_USER_PASSWORD is not set.";
  }
  return null;
}

async function ensurePreviewAuthUser(
  email: string,
  password: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const metadata = {
    full_name: "Preview Tester",
    preview_login: true,
  };

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (!created.error && created.data.user?.id) {
    return { ok: true, userId: created.data.user.id };
  }

  // User likely already exists — resolve id via generateLink (no email sent).
  const link = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });
  const userId = link.data?.user?.id;
  if (!userId) {
    return {
      ok: false,
      error: `Could not ensure preview user: ${created.error?.message ?? link.error?.message ?? "unknown"}`,
    };
  }

  const updated = await admin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
    user_metadata: {
      ...(link.data.user?.user_metadata ?? {}),
      ...metadata,
    },
  });
  if (updated.error) {
    return {
      ok: false,
      error: `Could not refresh preview user: ${updated.error.message}`,
    };
  }
  return { ok: true, userId };
}

/**
 * Ensure the preview test user exists with a known password, then establish
 * a cookie session via the SSR anon client.
 *
 * UI button: call without options (preview env is the gate).
 * API / CI: pass `{ requireSecret: true, secret }` so the endpoint stays locked.
 */
export async function establishPreviewTestSession(options?: {
  secret?: string;
  requireSecret?: boolean;
}): Promise<PreviewLoginResult> {
  const blocked = assertPreviewLoginAllowed();
  if (blocked) return { ok: false, error: blocked };

  if (options?.requireSecret) {
    const expected = previewLoginSecret();
    if (!expected) {
      return { ok: false, error: "PREVIEW_TEST_LOGIN_SECRET is not set." };
    }
    if (!options.secret || options.secret !== expected) {
      return { ok: false, error: "Invalid preview login secret." };
    }
  }

  const email = previewTestUserEmail();
  const password = previewTestUserPassword();

  const ensured = await ensurePreviewAuthUser(email, password);
  if (!ensured.ok) return ensured;

  try {
    await bootstrapPreviewTesterWorkspace(
      ensured.userId,
      previewTestUserPlan(),
    );
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to bootstrap preview workspace.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, error: `Sign-in failed: ${error.message}` };
  }

  return { ok: true, email };
}
