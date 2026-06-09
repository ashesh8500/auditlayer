import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/env";

function magicLinkHtml(signInUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:32px 16px;background:#f8fafc;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr><td align="center">
        <table role="presentation" width="100%" style="max-width:480px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;">
          <tr><td style="padding:32px 32px 8px;font-size:15px;font-weight:700;">
            <span style="display:inline-block;width:32px;height:32px;border-radius:8px;background:#0d9488;color:#fff;font-family:monospace;font-size:12px;line-height:32px;text-align:center;">AL</span>
            AuditLayer
          </td></tr>
          <tr><td style="padding:8px 32px 0;">
            <h1 style="margin:0 0 8px;font-size:22px;">Your secure sign-in link</h1>
            <p style="margin:0;font-size:14px;color:#64748b;">Tap below to open your account. This link expires in one hour and works once.</p>
          </td></tr>
          <tr><td style="padding:24px 32px 28px;">
            <a href="${signInUrl}" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:8px;">Sign in to AuditLayerMedia</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

async function sendResendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.AUTH_EMAIL_FROM ?? "AuditLayerMedia <onboarding@resend.dev>";

  if (!apiKey) {
    return { ok: false, message: "RESEND_API_KEY is not configured." };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });

  if (!response.ok) {
    const body = await response.text();
    return {
      ok: false,
      message: `Email delivery failed (${response.status}): ${body.slice(0, 200)}`,
    };
  }

  return { ok: true };
}

/**
 * Generates a token_hash magic link via the service role and sends a branded
 * email through Resend. Works across devices (no PKCE verifier cookie needed).
 */
export async function sendBrandedMagicLink(
  email: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const admin = createAdminClient();
  const redirectTo = `${siteUrl()}/auth/callback`;

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });

  if (error || !data?.properties?.hashed_token) {
    return {
      ok: false,
      message: error?.message ?? "Could not create a sign-in link.",
    };
  }

  const signInUrl = `${redirectTo}?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=email`;

  return sendResendEmail({
    to: email,
    subject: "Sign in to AuditLayerMedia",
    html: magicLinkHtml(signInUrl),
  });
}

export function isBrandedMagicLinkConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}
