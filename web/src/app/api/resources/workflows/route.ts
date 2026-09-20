import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { readWorkflows } from "@/lib/workflows/server";

export async function GET() {
  const profile = await getProfile();
  const headers = { "Cache-Control": "private, no-store" };
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const resource = await readWorkflows(profile.id);
    return NextResponse.json(resource, { headers });
  } catch {
    return NextResponse.json({ error: "Workflows unavailable" }, { status: 503, headers });
  }
}
