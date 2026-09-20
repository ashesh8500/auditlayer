import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadAuditAllowance } from "@/lib/allowance";
import { STATUS_LABELS } from "@/lib/domain";
export async function GET(request: Request) {
  const profile = await getProfile();
  const headers = { "Cache-Control": "private, no-store" };
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  const raw = params.get("page") ?? "1";
  const page = /^\d{1,6}$/.test(raw) ? Math.max(1, Number(raw)) : 1;
  const status = params.get("status");
  if (status && status !== "all" && !Object.hasOwn(STATUS_LABELS, status)) return NextResponse.json({ error: "Invalid status" }, { status: 400, headers });
  const supabase = await createClient();
  const query = supabase.from("audits")
    .select("id, handle, platform, status, goal, milestone_label, created_at, retry_count, last_failed_at, report_version", { count: "exact" })
    .eq("user_id", profile.id).order("created_at", { ascending: false }).order("id")
    .range((page - 1) * 24, page * 24 - 1).abortSignal(request.signal);
  if (status && status !== "all") query.eq("status", status);
  const [list, allowance] = await Promise.all([query,
    loadAuditAllowance(supabase, profile.id).catch(() => null),
  ]);
  if (list.error) return NextResponse.json({ error: "Reports unavailable" }, { status: 503, headers });
  if (!allowance) return NextResponse.json({ error: "Audit allowance unavailable. Please retry.", code: "allowance_unavailable" }, { status: 503, headers });
  return NextResponse.json({ ownerId: profile.id, fetchedAt: new Date().toISOString(), audits: list.data ?? [], count: list.count ?? 0, usage: allowance.usage, allowance,
    profile: { full_name: profile.full_name, role: profile.role, plan: profile.plan, gifted_audits: profile.gifted_audits, subscription_status: profile.subscription_status, hasBilling: Boolean(profile.stripe_customer_id) },
  }, { headers });
}
