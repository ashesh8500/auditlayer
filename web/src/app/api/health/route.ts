import { NextResponse } from "next/server";

import { isSupabaseAdminConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const started = Date.now();
  const headers = { "Cache-Control": "no-store" };

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      {
        status: "degraded",
        service: "auditlayer-web",
        checks: { database: "not_configured" },
      },
      { status: 503, headers },
    );
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("app_settings").select("id").limit(1);
    if (error) throw error;

    return NextResponse.json(
      {
        status: "ok",
        service: "auditlayer-web",
        checks: { database: "ok" },
        latency_ms: Date.now() - started,
        observed_at: new Date().toISOString(),
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        service: "auditlayer-web",
        checks: { database: "unavailable" },
        latency_ms: Date.now() - started,
      },
      { status: 503, headers },
    );
  }
}
