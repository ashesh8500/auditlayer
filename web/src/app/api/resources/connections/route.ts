import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { INSTAGRAM_CONNECTION_CARD_FIELDS, type InstagramConnectionCard } from "@/lib/instagram-connection-public";
import { CONNECTION_ID_PATTERN } from "@/lib/instagram-oauth-url";
export async function GET(request: Request) {
  const profile = await getProfile();
  const headers = { "Cache-Control": "private, no-store" };
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  const raw = params.get("page") ?? "1";
  const page = /^\d{1,6}$/.test(raw) ? Math.max(1, Number(raw)) : 1;
  const id = params.get("connection_id");
  const supabase = await createClient();
  const { data, error, count } = await supabase.from("instagram_connections")
    .select(INSTAGRAM_CONNECTION_CARD_FIELDS, { count: "exact" })
    .eq("user_id", profile.id).order("created_at", { ascending: false }).order("id")
    .abortSignal(request.signal).range((page - 1) * 24, page * 24 - 1);
  if (error) return NextResponse.json({ error: "Connections unavailable" }, { status: 503, headers });
  const connections = (data ?? []) as InstagramConnectionCard[];
  let target = connections.find(row => row.id === id) ?? null;
  if (id && !target && CONNECTION_ID_PATTERN.test(id)) {
    const result = await supabase.from("instagram_connections").select(INSTAGRAM_CONNECTION_CARD_FIELDS)
      .eq("user_id", profile.id).eq("id", id).abortSignal(request.signal).maybeSingle();
    if (result.error) return NextResponse.json({ error: "Connections unavailable" }, { status: 503, headers });
    target = result.data as InstagramConnectionCard | null;
  }
  return NextResponse.json({ ownerId: profile.id, fetchedAt: new Date().toISOString(), connections, count: count ?? 0, target }, { headers });
}
