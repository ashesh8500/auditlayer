import { NextResponse } from "next/server";

import { isSupabaseAdminConfigured } from "@/lib/env";
import { normalizeSentryWebhook } from "@/lib/sentry-privacy";
import { isValidSentrySignature } from "@/lib/sentry-webhook";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.SENTRY_WEBHOOK_SECRET ?? "";
  if (!secret || !isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: "Observability intake is not configured" }, { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 262_144) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 262_144) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const signature = request.headers.get("sentry-hook-signature");
  if (!isValidSentrySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const incident = normalizeSentryWebhook(payload);
  if (!incident) return NextResponse.json({ accepted: false }, { status: 202 });

  const admin = createAdminClient();
  const { error } = await admin.rpc("ingest_operator_incident", {
    p_fingerprint: incident.fingerprint,
    p_source: incident.source,
    p_severity: incident.severity,
    p_environment: incident.environment,
    p_title: incident.title,
    p_external_url: incident.externalUrl,
    p_metadata: incident.metadata,
  });
  if (error) return NextResponse.json({ error: "Incident write failed" }, { status: 500 });

  return NextResponse.json({ accepted: true }, { status: 202 });
}
