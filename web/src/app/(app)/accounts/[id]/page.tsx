import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Plus,
  Radio,
} from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  isLiveInstagramConnection,
  WORKSPACE_ACCOUNT_STATUSES,
} from "@/lib/account-ownership";
import {
  summarizeProgression,
  type ProgressionPoint,
} from "@/lib/account-progress";
import { requireProfile } from "@/lib/auth";
import type { AuditStatus } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Account — AuditLayerMedia" };

type AccountRow = {
  id: string;
  handle: string;
  platform: string;
  display_name: string | null;
  avatar_url: string | null;
  last_researched_at: string | null;
  cache_valid_until: string | null;
  ownership_status: "connected" | "managed";
};

type AccountProgressionRow = ProgressionPoint & {
  id: string;
  audit_id: string;
  avg_likes: number | null;
  avg_comments: number | null;
};

type AuditRow = {
  id: string;
  status: AuditStatus;
  report_type: string | null;
  created_at: string;
  report_version: number | null;
  prompt_version: string | null;
};

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: account } = await (supabase as any)
    .from("accounts")
    .select(
      "id, handle, platform, display_name, avatar_url, last_researched_at, cache_valid_until, ownership_status",
    )
    .eq("id", id)
    .eq("user_id", profile.id)
    .in("ownership_status", [...WORKSPACE_ACCOUNT_STATUSES])
    .maybeSingle();

  if (!account) notFound();
  const ownedAccount = account as AccountRow;

  const [{ data: progression }, { data: audits }, { data: connections }] =
    await Promise.all([
      (supabase as any)
        .from("account_progression")
        .select(
          "id, audit_id, score, followers, engagement, avg_likes, avg_comments, recorded_at",
        )
        .eq("account_id", id)
        .order("recorded_at", { ascending: false }),
      (supabase as any)
        .from("audits")
        .select("id, status, report_type, created_at, report_version, prompt_version")
        .eq("account_id", id)
        .order("created_at", { ascending: false }),
      (supabase as any)
        .from("instagram_connections")
        .select(
          "ig_username, is_active, long_lived_expires_at, last_refreshed_at",
        )
        .eq("user_id", profile.id)
        .ilike("ig_username", ownedAccount.handle)
        .limit(1),
    ]);

  const points = (progression ?? []) as AccountProgressionRow[];
  const history = [...points].reverse();
  const summary = summarizeProgression(points);
  const auditList = (audits ?? []) as AuditRow[];
  const connection = (connections ?? [])[0] as
    | {
        is_active: boolean;
        long_lived_expires_at: string;
        last_refreshed_at: string | null;
      }
    | undefined;
  const live = isLiveInstagramConnection(connection);

  return (
    <main className="alm-shell py-8 sm:py-12 animate-page-in">
      <Link
        href="/accounts"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to accounts
      </Link>

      <header className="mt-5 flex flex-wrap items-end justify-between gap-5 border-b border-border pb-7">
        <div className="flex min-w-0 items-center gap-4">
          <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-[color:var(--accent-muted)] text-lg font-semibold text-[color:var(--accent)]">
            {ownedAccount.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ownedAccount.avatar_url}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              "@"
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                {ownedAccount.display_name || `@${ownedAccount.handle}`}
              </h1>
              <Badge tone={live ? "success" : "warning"}>
                {live ? "Live Instagram data" : "Reconnect Instagram"}
              </Badge>
            </div>
            <p className="mt-1 text-sm capitalize text-muted-foreground">
              @{ownedAccount.handle} · {ownedAccount.platform}
            </p>
          </div>
        </div>
        <Link href={`/audits/new?account_id=${encodeURIComponent(id)}`}>
          <Button size="lg">
            <Plus className="size-4" />
            New audit
          </Button>
        </Link>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Latest score"
          value={summary.latestScore?.toString() ?? "Data needed"}
          detail={
            summary.scoreDelta == null
              ? "No previous score"
              : `${summary.scoreDelta > 0 ? "+" : ""}${summary.scoreDelta} since last audit`
          }
        />
        <MetricCard
          label="Followers"
          value={summary.followers?.toLocaleString() ?? "Data needed"}
          detail={
            summary.followersDelta == null
              ? "Connect Instagram for live data"
              : `${summary.followersDelta > 0 ? "+" : ""}${summary.followersDelta.toLocaleString()} since last audit`
          }
        />
        <MetricCard
          label="Engagement"
          value={
            summary.engagement == null
              ? "Data needed"
              : `${summary.engagement.toFixed(2)}%`
          }
          detail="Audit-time observation"
        />
        <MetricCard
          label="Audits"
          value={auditList.length.toString()}
          detail={
            summary.observedAt
              ? `Latest ${new Date(summary.observedAt).toLocaleDateString()}`
              : "No completed baseline yet"
          }
        />
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-[var(--shadow)] sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="alm-kicker">Progression</p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em]">
                Score history
              </h2>
            </div>
            <BarChart3 className="size-5 text-[color:var(--accent)]" />
          </div>

          {history.length === 0 ? (
            <div className="mt-6 rounded-[var(--radius)] border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Run a new audit to establish the first scored baseline.
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {history.map((point) => (
                <div key={point.id} className="grid gap-2 sm:grid-cols-[90px_1fr_44px] sm:items-center">
                  <span className="text-xs text-muted-foreground">
                    {new Date(point.recorded_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "2-digit",
                    })}
                  </span>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    {point.score == null ? (
                      <div className="h-full w-full bg-muted" />
                    ) : (
                      <div
                        className="h-full rounded-full bg-[color:var(--accent)]"
                        style={{ width: `${point.score}%` }}
                      />
                    )}
                  </div>
                  <span className="font-mono text-sm font-semibold sm:text-right">
                    {point.score ?? "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-[var(--shadow)] sm:p-6">
          <div className="flex items-center gap-2">
            <Radio className="size-4 text-[color:var(--accent)]" />
            <h2 className="text-base font-semibold">Data status</h2>
          </div>
          <dl className="mt-5 space-y-4 text-sm">
            <DataRow
              label="Source"
              value={live ? "Connected Instagram Graph" : "Public research"}
            />
            <DataRow
              label="Live metrics observed"
              value={
                connection?.last_refreshed_at
                  ? new Date(connection.last_refreshed_at).toLocaleString()
                  : "Not available"
              }
            />
            <DataRow
              label="Web research refreshed"
              value={
                ownedAccount.last_researched_at
                  ? new Date(ownedAccount.last_researched_at).toLocaleString()
                  : "Not available"
              }
            />
          </dl>
          {!live && ownedAccount.platform === "instagram" && (
            <Link href="/settings/ai-connections" className="mt-5 block">
              <Button variant="outline" className="w-full">
                Connect Instagram
              </Button>
            </Link>
          )}
        </section>
      </div>

      <section className="mt-8">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-[color:var(--accent)]" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Audit history
          </h2>
        </div>
        <div className="alm-table-wrap mt-3">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Report</th>
                <th className="px-4 py-3 font-medium">Version</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Open</th>
              </tr>
            </thead>
            <tbody>
              {auditList.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No audits linked to this account yet.
                  </td>
                </tr>
              ) : (
                auditList.map((audit) => (
                  <tr key={audit.id} className="border-t border-border">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {new Date(audit.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {audit.report_type || "standard"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      v{audit.report_version ?? 1}
                      {audit.prompt_version ? ` · ${audit.prompt_version}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={audit.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/audits/${audit.id}`}
                        className="inline-flex items-center gap-1 font-medium text-[color:var(--accent)] hover:underline"
                      >
                        View
                        <ArrowRight className="size-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-[var(--shadow)]">
      <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-mono text-2xl font-semibold tracking-[-0.03em]">
        {value}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-border pb-3 last:border-0 last:pb-0">
      <dt className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
