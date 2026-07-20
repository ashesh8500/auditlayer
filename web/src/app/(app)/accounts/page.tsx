import Link from "next/link";
import { ArrowRight, Bot, Building2, Plus, TrendingDown, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import {
  summarizeProgression,
  type ProgressionPoint,
} from "@/lib/account-progress";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Accounts — AuditLayerMedia" };

type AccountRow = {
  id: string;
  handle: string;
  platform: string;
  display_name: string | null;
  avatar_url: string | null;
  last_researched_at: string | null;
  created_at: string | null;
};

type ConnectionRow = {
  ig_username: string;
  is_active: boolean;
  long_lived_expires_at: string;
};

function formatDelta(value: number | null) {
  if (value == null) return "No previous audit";
  return `${value > 0 ? "+" : ""}${value}`;
}

export default async function AccountsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: accounts }, { data: progression }, { data: connections }] =
    await Promise.all([
      (supabase as any)
        .from("accounts")
        .select(
          "id, handle, platform, display_name, avatar_url, last_researched_at, created_at",
        )
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false }),
      (supabase as any)
        .from("account_progression")
        .select("account_id, score, followers, engagement, recorded_at")
        .order("recorded_at", { ascending: false }),
      (supabase as any)
        .from("instagram_connections")
        .select("ig_username, is_active, long_lived_expires_at")
        .eq("user_id", profile.id),
    ]);

  const list = (accounts ?? []) as AccountRow[];
  const pointsByAccount = new Map<string, ProgressionPoint[]>();
  for (const point of progression ?? []) {
    const current = pointsByAccount.get(point.account_id) ?? [];
    current.push(point as ProgressionPoint);
    pointsByAccount.set(point.account_id, current);
  }
  const liveHandles = new Set(
    ((connections ?? []) as ConnectionRow[])
      .filter(
        (connection) =>
          connection.is_active &&
          new Date(connection.long_lived_expires_at).getTime() > Date.now(),
      )
      .map((connection) => connection.ig_username.toLowerCase()),
  );

  return (
    <main className="alm-shell py-8 sm:py-12 animate-page-in">
      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-border pb-7">
        <div>
          <p className="alm-kicker">Your accounts</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            Tracked accounts
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            See the latest score, live metrics, and change from the previous audit.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/settings/ai-connections">
            <Button size="lg" variant="outline" className="font-medium">
              <Bot className="size-4" />
              AI Connections
            </Button>
          </Link>
          <Link href="/audits/new">
            <Button size="lg" className="font-medium">
              <Plus className="size-4" />
              New audit
            </Button>
          </Link>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="mt-10 rounded-[var(--radius)] border border-dashed border-border bg-card p-12 text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-[color:var(--accent-muted)]">
            <Building2 className="size-6 text-[color:var(--accent)]" />
          </div>
          <h2 className="text-xl font-bold text-foreground">No accounts yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Run your first audit and its account history will appear here automatically.
          </p>
          <Link href="/audits/new" className="mt-6 inline-block">
            <Button size="lg" className="font-semibold">
              <Plus className="size-4" />
              Run an audit
            </Button>
          </Link>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((account) => {
            const summary = summarizeProgression(
              pointsByAccount.get(account.id) ?? [],
            );
            const live =
              account.platform === "instagram" &&
              liveHandles.has(account.handle.toLowerCase());
            const scoreUp = (summary.scoreDelta ?? 0) >= 0;

            return (
              <li
                key={account.id}
                className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-[var(--shadow)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-[color:var(--accent-muted)] text-sm font-semibold text-[color:var(--accent)]">
                      {account.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={account.avatar_url}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        "@"
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold">
                        {account.display_name || `@${account.handle}`}
                      </h2>
                      <p className="truncate text-xs capitalize text-muted-foreground">
                        @{account.handle} · {account.platform}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <span
                      className={`size-2 rounded-full ${
                        live
                          ? "bg-[color:var(--green)]"
                          : "bg-[color:var(--amber)]"
                      }`}
                    />
                    {live ? "Live data" : "Public data"}
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3 border-y border-border py-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                      Score
                    </p>
                    <p className="mt-1 font-mono text-2xl font-semibold">
                      {summary.latestScore ?? "—"}
                    </p>
                    <p
                      className={`mt-1 flex items-center gap-1 text-[11px] ${
                        summary.scoreDelta == null
                          ? "text-muted-foreground"
                          : scoreUp
                            ? "text-[color:var(--green)]"
                            : "text-[color:var(--red)]"
                      }`}
                    >
                      {summary.scoreDelta != null &&
                        (scoreUp ? (
                          <TrendingUp className="size-3" />
                        ) : (
                          <TrendingDown className="size-3" />
                        ))}
                      {formatDelta(summary.scoreDelta)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                      Followers
                    </p>
                    <p className="mt-1 font-mono text-base font-semibold">
                      {summary.followers?.toLocaleString() ?? "Data needed"}
                    </p>
                    {summary.followersDelta != null && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {formatDelta(summary.followersDelta)}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                      Engagement
                    </p>
                    <p className="mt-1 font-mono text-base font-semibold">
                      {summary.engagement != null
                        ? `${summary.engagement.toFixed(2)}%`
                        : "Data needed"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-[11px] text-muted-foreground">
                    {summary.observedAt
                      ? `Updated ${new Date(summary.observedAt).toLocaleDateString()}`
                      : "Run an audit to establish a baseline"}
                  </p>
                  <Link
                    href={`/accounts/${account.id}`}
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[color:var(--accent)] hover:underline"
                  >
                    View account
                    <ArrowRight className="size-3" />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
