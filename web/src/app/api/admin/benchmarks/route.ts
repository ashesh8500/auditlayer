/**
 * Admin API route for wellness benchmarks CRUD.
 *
 * GET    /api/admin/benchmarks           — list all, optional ?niche= filter
 * GET    /api/admin/benchmarks?id=<uuid> — single benchmark with peers
 * POST   /api/admin/benchmarks           — create
 * PUT    /api/admin/benchmarks?id=<uuid> — update
 * DELETE /api/admin/benchmarks?id=<uuid> — delete
 *
 * All endpoints require authenticated admin (profiles.role = 'admin').
 */

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured, isSupabaseConfigured } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function verifyAdmin(): Promise<NextResponse | null> {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Service role not configured" },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null; // admin verified
}

// ---------------------------------------------------------------------------
// GET — list benchmarks or fetch one by id
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const authError = await verifyAdmin();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const niche = searchParams.get("niche");

  const admin = createAdminClient();

  if (id) {
    // Single benchmark with peers
    const [{ data: benchmark, error: bErr }, { data: peers }] =
      await Promise.all([
        admin
          .from("wellness_benchmarks")
          .select("*")
          .eq("id", id)
          .maybeSingle(),
        admin.from("peer_graph").select("*").eq("benchmarks_id", id),
      ]);

    if (bErr)
      return NextResponse.json({ error: bErr.message }, { status: 500 });
    if (!benchmark)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      ...benchmark,
      peers: peers ?? [],
    });
  }

  // List — optionally filtered by niche
  let query = admin.from("wellness_benchmarks").select("*");
  if (niche) query = query.eq("niche", niche);

  const { data, error } = await query.order("niche").order("followers_bracket");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

// ---------------------------------------------------------------------------
// POST — create a new benchmark
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const authError = await verifyAdmin();
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  if (!body || !body.niche || !body.followers_bracket) {
    return NextResponse.json(
      { error: "niche and followers_bracket are required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const insert: Database["public"]["Tables"]["wellness_benchmarks"]["Insert"] =
    {
      niche: body.niche,
      followers_bracket: body.followers_bracket,
      avg_engagement: body.avg_engagement ?? 0,
      top_formats: body.top_formats ?? [],
      post_freq: body.post_freq ?? "",
      cta: body.cta ?? "",
    };

  const { data, error } = await admin
    .from("wellness_benchmarks")
    .insert(insert)
    .select()
    .single();

  if (error) {
    const status = error.message.includes("duplicate") ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(data, { status: 201 });
}

// ---------------------------------------------------------------------------
// PUT — update a benchmark
// ---------------------------------------------------------------------------

export async function PUT(request: Request) {
  const authError = await verifyAdmin();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { error: "?id=<uuid> is required" },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const update: Database["public"]["Tables"]["wellness_benchmarks"]["Update"] =
    {};
  if (body.niche !== undefined) update.niche = body.niche;
  if (body.followers_bracket !== undefined)
    update.followers_bracket = body.followers_bracket;
  if (body.avg_engagement !== undefined)
    update.avg_engagement = body.avg_engagement;
  if (body.top_formats !== undefined) update.top_formats = body.top_formats;
  if (body.post_freq !== undefined) update.post_freq = body.post_freq;
  if (body.cta !== undefined) update.cta = body.cta;

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 },
    );
  }

  const { data, error } = await admin
    .from("wellness_benchmarks")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(data);
}

// ---------------------------------------------------------------------------
// DELETE — delete a benchmark and its peers (cascade)
// ---------------------------------------------------------------------------

export async function DELETE(request: Request) {
  const authError = await verifyAdmin();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { error: "?id=<uuid> is required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("wellness_benchmarks")
    .delete()
    .eq("id", id);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
