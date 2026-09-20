import { NextResponse } from "next/server";
import { randomBytes, randomInt } from "node:crypto";
import { isValidShareToken } from "@/lib/access-boundary";
import { isSupabaseAdminConfigured } from "@/lib/env";
import { setShareSession } from "@/lib/share-access";
import { isShareEmailConfigured, sendShareCode, shareCodeHash, shareHash, shareSecurityRpc } from "@/lib/share-security";

export const runtime = "nodejs";
function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
/** Anonymous capability endpoint; authoritative transitions use service-only locked RPCs. */
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!isValidShareToken(token)) return reply({ error: "Invalid link." }, 400);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply({ error: "Invalid origin." }, 403);
  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 2048) return reply({ error: "Request too large." }, 413);
    body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch { return reply({ error: "Invalid JSON." }, 400); }
  const { action, code } = body;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !["send_code", "verify_code"].includes(String(action))) {
    return reply({ error: "Invalid request." }, 400);
  }
  if (!isSupabaseAdminConfigured()) return reply({ error: "Verification is temporarily unavailable." }, 503);
  try {
    if (action === "send_code") {
      if (!isShareEmailConfigured()) return reply({ error: "Email delivery is temporarily unavailable." }, 503);
      const rawCode = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const args = { p_token: token, p_email: email, p_hash: shareCodeHash(token, email, rawCode), p_session_hash: null };
      const reserved = await shareSecurityRpc("share_email_challenge", { ...args, p_action: "reserve" });
      if (reserved.error) return reply({ error: "Verification is temporarily unavailable." }, 503);
      if (reserved.data === "invalid") return reply({ ok: true });
      if (reserved.data === "limited") return reply({ error: "Please wait before requesting another code. At most 5 sends per hour." }, 429);
      if (reserved.data !== "reserved") return reply({ error: "This link is unavailable or expired." }, 410);
      if (!await sendShareCode(email, rawCode)) return reply({ error: "Email could not be sent. Please wait a minute and retry." }, 503);
      const activated = await shareSecurityRpc("share_email_challenge", { ...args, p_action: "activate" });
      if (activated.error || activated.data !== "sent") return reply({ error: "Code could not be activated. Please request another code." }, 503);
      return reply({ ok: true });
    }
    if (typeof code !== "string" || !/^\d{6}$/.test(code)) return reply({ error: "Enter a 6-digit code." }, 400);
    const session = randomBytes(32).toString("base64url");
    const result = await shareSecurityRpc("share_email_challenge", {
      p_action: "verify", p_token: token, p_email: email,
      p_hash: shareCodeHash(token, email, code), p_session_hash: shareHash(session),
    });
    if (result.error) return reply({ error: "Verification is temporarily unavailable." }, 503);
    if (result.data !== "verified") return reply({ error: "Invalid or expired code. Retry or request a new code after a minute." }, result.data === "limited" ? 429 : 400);
    await setShareSession(token, session);
    return reply({ ok: true, verified: true });
  } catch { return reply({ error: "Verification is temporarily unavailable." }, 503); }
}
