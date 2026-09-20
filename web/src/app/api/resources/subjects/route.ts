import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { listSubjectsForUser } from "@/lib/intelligence/subjects";
export async function GET() {
  const profile = await getProfile();
  const headers = { "Cache-Control": "private, no-store" };
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    // Reuse the canonical owner-filtered, paginated, channel-deduplicating read.
    const { subjects } = await listSubjectsForUser();
    return NextResponse.json({ ownerId: profile.id, fetchedAt: new Date().toISOString(), subjects }, { headers });
  } catch {
    return NextResponse.json({ error: "Subjects unavailable" }, { status: 503, headers });
  }
}
