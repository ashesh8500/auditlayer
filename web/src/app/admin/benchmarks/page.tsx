import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";
import { BenchmarkPageClient } from "./benchmark-page-client";

type BenchmarkRow = Database["public"]["Tables"]["wellness_benchmarks"]["Row"];

// ---------------------------------------------------------------------------
// Page — server component: auth gate + data fetch, then hands off to client
// ---------------------------------------------------------------------------

export default async function AdminBenchmarksPage({
  searchParams,
}: {
  searchParams: Promise<{ niche?: string }>;
}) {
  const { niche: filterNiche } = await searchParams;

  if (!isSupabaseAdminConfigured()) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-8">
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Service-role key not configured.
        </p>
      </main>
    );
  }

  const admin = createAdminClient();

  let query = admin.from("wellness_benchmarks").select("*");
  if (filterNiche) query = query.eq("niche", filterNiche);
  const { data: benchmarks } = await query
    .order("niche")
    .order("followers_bracket");
  const rows: BenchmarkRow[] = benchmarks ?? [];

  // Peer counts per benchmark
  const { data: allPeers } = await admin
    .from("peer_graph")
    .select("benchmarks_id");
  const peerCounts: Record<string, number> = {};
  for (const p of allPeers ?? []) {
    peerCounts[p.benchmarks_id] =
      (peerCounts[p.benchmarks_id] ?? 0) + 1;
  }

  return (
    <BenchmarkPageClient
      benchmarks={rows}
      peerCounts={peerCounts}
      filterNiche={filterNiche}
    />
  );
}
