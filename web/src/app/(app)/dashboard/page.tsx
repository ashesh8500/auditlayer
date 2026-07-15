import Link from "next/link";
import { ArrowRight, ArrowUpRight, Filter, Plus, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InstagramConnect } from "@/components/instagram-connect";
import { StatusBadge } from "@/components/status-badge";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  auditLimitForProfile,
  isAdminUnlimited,
  PLATFORM_LABELS,
  retryStatusLabel,
  USAGE_STATUSES,
  STATUS_LABELS,
  type AuditStatus,
  type Platform,
} from "@/lib/domain";
import {
  startStarterCheckout,
  startProCheckout,
  openBillingPortal,
} from "@/lib/actions/billing";

export const metadata = { title: "Dashboard — AuditLayerMedia" };

const BILLING_MESSAGES: Record<string, { tone: string; text: string }> = {
  success: {
    tone: "var(--green)",
    text: "Subscription active — your new plan limits apply immediately.",
  },
  cancelled: { tone: "var(--amber)", text: "Checkout cancelled. No charge was made." },
  unconfigured: {
    tone: "var(--amber)",
    text: "Billing isn't configured yet. Reach out and we'll sort it.",
  },
  error: { tone: "var(--red)", text: "Something went wrong starting checkout." },
};

// All known audit statuses for filter pills
const FILTERABLE_STATUSES: (AuditStatus | "all")[] = [
  "all",
  "running",
  "ready",
  "queued",
  "failed",
  "needs_review",
  "draft",
  "blocked",
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    billing?: string;
    instagram_connected?: string;
    instagram_error?: string;
    status?: string;
  }>;
}) {
  const params = await searchParams;
  const { billing, instagram_connected, instagram_error, status: statusFilter } = params;
  const supabase = await createClient();

  const query = supabase
    .from("audits")
    .select(
      "id, handle, platform, status, goal, milestone_label, created_at, retry_count, last_failed_at",
    )
    .order("created_at", { ascending: false });

  const instagramQuery = (supabase as any)
    .from("instagram_connections")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  const [profile, { data: audits }, { data: igConnections }] = await Promise.all([
    requireProfile(),
    query,
    instagramQuery,
  ]);
  let list = audits ?? [];

  // Apply status filter client-side (avoids Supabase generics constraints)
  if (statusFilter && statusFilter !== "all") {
    list = list.filter((a) => a.status === statusFilter);
  }

  const usage = (audits ?? []).filter((a) =>
    USAGE_STATUSES.includes(a.status as AuditStatus),
  ).length;

  // The first query already has every status. Derive counts locally instead of
  // paying for a second trans-Pacific database round trip.
  const statusCounts: Record<string, number> = {};
  for (const a of audits ?? []) {
    statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
  }
  const totalAudits = (audits ?? []).length;
  const connectedIg = igConnections?.[0] ?? null;

  const limit = auditLimitForProfile(profile);
  const atCap = !isAdminUnlimited(profile.role) && usage >= limit;
  const billingMsg = billing ? BILLING_MESSAGES[billing] : undefined;
  const activeAudit = (audits ?? []).find((audit) =>
    ["queued", "running", "needs_review"].includes(audit.status),
  );
  const latestReady = (audits ?? []).find((audit) => audit.status === "ready");

  return (
    <main className="alm-shell py-8 sm:py-12 animate-page-in">
      {billingMsg && (
        <div
          className="mb-6 rounded-[var(--radius)] border px-4 py-3 text-sm"
          style={{
            borderColor: `color-mix(in oklch, ${billingMsg.tone}, transparent 70%)`,
            background: `color-mix(in oklch, ${billingMsg.tone}, transparent 92%)`,
            color: billingMsg.tone,
          }}
        >
          {billingMsg.text}
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-border pb-7">
        <div>
          <p className="alm-kicker">Research desk</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            {profile.full_name ? `${profile.full_name.split(" ")[0]}'s workspace` : "Your workspace"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">Active work, next action, and completed intelligence.</p>
        </div>
        <Link href="/audits/new">
          <Button size="lg" disabled={atCap} className="font-medium">
            <Plus className="size-4" />
            New audit
          </Button>
        </Link>
      </div>

      {(activeAudit || latestReady) && (
        <section className="mt-8 grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          {activeAudit ? (
            <Link href={`/audits/${activeAudit.id}`} className="group bg-[#14241f] p-6 text-white shadow-[var(--shadow-lg)] sm:p-8 alm-focus">
              <div className="flex items-center justify-between gap-4">
                <span className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.13em] text-[#8de0d3]">Active audit · {STATUS_LABELS[activeAudit.status as AuditStatus]}</span>
                <ArrowUpRight className="size-5 text-white/50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </div>
              <h2 className="mt-10 text-3xl font-semibold tracking-tight">@{activeAudit.handle}</h2>
              <p className="mt-2 max-w-lg text-sm text-white/60">{activeAudit.status === "needs_review" ? "A founder review is needed before research can continue." : "Open the audit to follow verified worker phases and current progress."}</p>
              <div className="mt-8 h-1 bg-white/10"><div className={`h-full bg-[#8de0d3] ${activeAudit.status === "running" ? "w-2/3" : "w-1/4"}`} /></div>
            </Link>
          ) : (
            <Link href={`/audits/${latestReady!.id}`} className="group bg-[#14241f] p-6 text-white shadow-[var(--shadow-lg)] sm:p-8 alm-focus">
              <span className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.13em] text-[#8de0d3]">Latest report</span>
              <h2 className="mt-10 text-3xl font-semibold tracking-tight">@{latestReady!.handle}</h2>
              <p className="mt-2 text-sm text-white/60">Your report is ready to read, share, refine, or download.</p>
              <span className="mt-8 inline-flex items-center gap-2 text-sm font-medium">Open report <ArrowRight className="size-4" /></span>
            </Link>
          )}
          <aside className="alm-panel flex flex-col justify-between p-6">
            <div><p className="alm-kicker">Next action</p><h2 className="mt-4 text-xl font-semibold">{activeAudit ? "Stay with the current run" : "Start another account review"}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{activeAudit ? "The status view updates from real audit events. No action is needed unless review is requested." : "Use a Pulse audit for a focused diagnostic or a full report for deeper strategy."}</p></div>
            <Link href={activeAudit ? `/audits/${activeAudit.id}` : "/audits/new"} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--accent)]">{activeAudit ? "View status" : "Create audit"}<ArrowRight className="size-4" /></Link>
          </aside>
        </section>
      )}

      {/* Usage + plan */}
      <section className="mt-6 grid gap-4 sm:grid-cols-[1.4fr_1fr]">
        <div className="rounded-[var(--radius)] border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Audit usage
            </span>
            <span className="font-mono text-sm">
              {usage} /{" "}
              {isAdminUnlimited(profile.role) || limit >= 10_000 ? "∞" : limit}
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[color:var(--accent)] transition-all"
              style={{
                width: `${Math.min(100, limit ? (usage / limit) * 100 : 0)}%`,
              }}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground capitalize">
            {isAdminUnlimited(profile.role)
              ? "Founder · unlimited audits"
              : `${profile.plan} plan`}
            {profile.subscription_status &&
            profile.subscription_status !== "trial"
              ? ` · ${profile.subscription_status}`
              : ""}
          </p>
        </div>

        <div className="rounded-[var(--radius)] border border-border bg-card p-5">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Plan
          </span>
          <div className="mt-3 flex flex-col gap-2">
            {!isAdminUnlimited(profile.role) &&
              profile.plan !== "pro" &&
              profile.plan !== "enterprise" && (
              <form action={startProCheckout}>
                <Button type="submit" size="sm" className="w-full font-medium">
                  Upgrade to Pro · $50/mo
                </Button>
              </form>
            )}
            {profile.plan === "free" && (
              <form action={startStarterCheckout}>
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  className="w-full font-medium"
                >
                  Starter · $30/mo
                </Button>
              </form>
            )}
            {profile.stripe_customer_id && (
              <form action={openBillingPortal}>
                <Button
                  type="submit"
                  size="sm"
                  variant="ghost"
                  className="w-full"
                >
                  Manage billing
                </Button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Instagram connect */}
      <section className="mt-6">
        <InstagramConnect
          connectedAccount={connectedIg}
          plan={profile.plan}
          searchParams={{ instagram_connected, instagram_error }}
        />
      </section>

      {/* Audit list */}
      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div><p className="alm-kicker">Report library</p><h2 className="mt-1 text-xl font-semibold tracking-tight">All audits</h2></div>
          <span className="font-mono text-xs text-muted-foreground">{totalAudits} total</span>
        </div>
        {list.length === 0 && !statusFilter ? (
          /* Enhanced empty state */
          <div className="rounded-[var(--radius)] border border-dashed border-border bg-card p-12 text-center">
            <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-[color:var(--accent-muted)]">
              <SlidersHorizontal className="size-6 text-[color:var(--accent)]" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Your research desk is ready</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground leading-relaxed">
              Start with a free Pulse audit for a score, key gaps, and three immediate moves. No credit card required.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Link href="/audits/new">
                <Button size="lg" className="font-semibold">
                  <Plus className="size-4" />
                  Run a Free Pulse Audit
                </Button>
              </Link>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Instagram · TikTok · YouTube · X · LinkedIn
            </p>
          </div>
        ) : (
          <>
            {/* Status filter pills */}
            {totalAudits > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Filter className="size-3.5 text-muted-foreground shrink-0" />
                {FILTERABLE_STATUSES.map((s) => {
                  const count = s === "all" ? totalAudits : (statusCounts[s] || 0);
                  if (count === 0 && s !== "all") return null;
                  const isActive =
                    (s === "all" && !statusFilter) || s === statusFilter;
                  return (
                    <Link
                      key={s}
                      href={`/dashboard${s === "all" ? "" : `?status=${s}`}`}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        isActive
                          ? "border-[color:var(--accent)] bg-[color:var(--accent-muted)] text-[color:var(--accent)]"
                          : "border-border bg-card text-muted-foreground hover:border-[color:var(--accent)]/30 hover:text-foreground"
                      }`}
                    >
                      {s === "all" ? "All" : STATUS_LABELS[s as AuditStatus]}
                      <span className="tabular-nums text-[10px] opacity-60">
                        {count}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}

            {list.length === 0 && statusFilter ? (
              <div className="rounded-[var(--radius)] border border-dashed border-border bg-card p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No audits with status &ldquo;{STATUS_LABELS[statusFilter as AuditStatus] || statusFilter}&rdquo;.
                </p>
                <Link href="/dashboard" className="mt-3 inline-block">
                  <Button variant="ghost" size="sm">Clear filter</Button>
                </Link>
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((audit) => (
                  <li key={audit.id}>
                    <Link
                      href={`/audits/${audit.id}`}
                      className="group flex flex-col rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:border-[color:var(--accent)]/50 hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-bold text-base">
                              @{audit.handle}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {PLATFORM_LABELS[audit.platform as Platform] ??
                              audit.platform}
                          </p>
                        </div>
                        <StatusBadge status={audit.status as AuditStatus} />
                      </div>
                      <div className="mt-3 flex items-center justify-between pt-3 border-t border-border">
                        <div className="min-w-0">
                          {audit.milestone_label && (
                            <p className="text-xs text-muted-foreground truncate">
                              {audit.milestone_label}
                            </p>
                          )}
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {new Date(audit.created_at).toLocaleDateString(
                              "en-US",
                              { month: "short", day: "numeric", year: "numeric" },
                            )}
                          </p>
                        </div>
                        <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 shrink-0" />
                      </div>
                      {audit.status === "failed" && (
                        <div className="mt-2 text-[10px] font-medium text-[color:var(--red)]">
                          {retryStatusLabel(audit.retry_count ?? 0)}
                        </div>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </main>
  );
}
