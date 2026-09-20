import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/** Temporary narrow RPC boundary until generated types include the additive migration. */
type ShareRpc = {
  rpc(name: "share_email_challenge" | "share_session_valid", args: Record<string, string | null>): PromiseLike<{ data: unknown; error: unknown }>;
};
export async function shareSecurityRpc(name: "share_email_challenge" | "share_session_valid", args: Record<string, string | null>) {
  return (createAdminClient() as unknown as ShareRpc).rpc(name, args);
}
export function shareHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
export function shareCodeHash(token: string, email: string, code: string): string {
  return shareHash(JSON.stringify([token, email, code]));
}
export function isShareEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && (process.env.SHARE_EMAIL_FROM || process.env.AUTH_EMAIL_FROM));
}
export async function sendShareCode(email: string, code: string): Promise<boolean> {
  if (!isShareEmailConfigured()) return false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.SHARE_EMAIL_FROM || process.env.AUTH_EMAIL_FROM,
        to: [email], subject: "Your AuditLayerMedia report verification code",
        text: `Your verification code is ${code}. It expires in 10 minutes and can be used once. If you did not request this, ignore this email.`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    // Never return/log provider response bodies, recipient addresses, codes or credentials.
    return response.ok;
  } catch { return false; }
}
