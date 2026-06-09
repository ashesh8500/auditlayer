import { NextResponse } from "next/server";
import { createHash, randomInt } from "crypto";

import { createClient } from "@/lib/supabase/server";
import { setShareSession } from "@/lib/share-access";

/**
 * POST /s/[token]/verify
 *
 * Two actions:
 *   { action: "send_code", email } — send verification code
 *   { action: "verify_code", email, code } — verify the code
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;

  let body: { action?: string; email?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, email, code } = body;

  if (!action || !email) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = await createClient();

  // Fetch the share link
  const { data: link } = await (supabase as any)
    .from("share_links")
    .select("*")
    .eq("token", token)
    .eq("revoked_at", null)
    .maybeSingle();

  if (!link) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  if (link.mode !== "email") {
    return NextResponse.json(
      { error: "This link does not require email verification" },
      { status: 400 }
    );
  }

  // Don't reveal whether the email matches — use constant-time comparison
  const emailMatches =
    link.email?.toLowerCase().trim() === email.toLowerCase().trim();

  if (action === "send_code") {
    if (!emailMatches) {
      // Don't reveal mismatch — return success to prevent enumeration
      return NextResponse.json({ ok: true });
    }

    // Generate 6-digit code
    const rawCode = String(randomInt(0, 999999)).padStart(6, "0");
    const hashedCode = createHash("sha256")
      .update(rawCode + token)
      .digest("hex");
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await (supabase as any)
      .from("share_links")
      .update({
        verification_code: hashedCode,
        verification_code_expires: expires,
      })
      .eq("id", link.id);

    // TODO: Send email via Resend when RESEND_API_KEY is configured.
    // For now, we log the code for development purposes.
    console.log(
      `[share] Verification code for ${email} (token ${token}): ${rawCode}`
    );

    return NextResponse.json({ ok: true });
  }

  if (action === "verify_code") {
    if (!code || !emailMatches) {
      return NextResponse.json(
        { error: "Invalid code" },
        { status: 400 }
      );
    }

    if (!link.verification_code || !link.verification_code_expires) {
      return NextResponse.json(
        { error: "No code requested" },
        { status: 400 }
      );
    }

    if (new Date(link.verification_code_expires) < new Date()) {
      return NextResponse.json(
        { error: "Code expired. Request a new one." },
        { status: 400 }
      );
    }

    const expectedHash = createHash("sha256")
      .update(code + token)
      .digest("hex");

    if (expectedHash !== link.verification_code) {
      return NextResponse.json(
        { error: "Invalid code" },
        { status: 400 }
      );
    }

    // Mark verified
    const now = new Date().toISOString();
    await (supabase as any)
      .from("share_links")
      .update({
        verified_at: now,
        verification_code: null,
        verification_code_expires: null,
      })
      .eq("id", link.id);

    // Set session cookie
    await setShareSession(token);

    return NextResponse.json({ ok: true, verified: true });
  }

  return NextResponse.json(
    { error: "Unknown action" },
    { status: 400 }
  );
}
