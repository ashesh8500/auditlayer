import { NextResponse } from "next/server";

import { establishPreviewTestSession } from "@/lib/auth/preview-login";
import { isPreviewLoginAllowed } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CI / Playwright entry for preview auto-login.
 * Requires header `x-preview-login-secret` matching PREVIEW_TEST_LOGIN_SECRET.
 * Hard-disabled when VERCEL_ENV=production.
 */
export async function POST(request: Request) {
  if (!isPreviewLoginAllowed()) {
    return NextResponse.json(
      { ok: false, error: "preview_login_disabled" },
      { status: 403 },
    );
  }

  const secret =
    request.headers.get("x-preview-login-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  let next = "/accounts";
  try {
    const body = (await request.json()) as { next?: string };
    if (
      typeof body.next === "string" &&
      body.next.startsWith("/") &&
      !body.next.startsWith("//")
    ) {
      next = body.next;
    }
  } catch {
    // empty body is fine
  }

  const result = await establishPreviewTestSession({
    requireSecret: true,
    secret,
  });

  if (!result.ok) {
    const status = result.error.includes("Invalid") ? 401 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({ ok: true, email: result.email, next });
}
