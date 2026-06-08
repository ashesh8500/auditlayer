import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  auditLimitForProfile,
  isAdminUnlimited,
  PLATFORM_LABELS,
  USAGE_STATUSES,
  type AuditStatus,
  type Platform,
} from "@/lib/domain";
import {
  startStarterCheckout,
  startProCheckout,
  openBillingPortal,
} from "@/lib/actions/billing";

export const metadata = { title: "Dashboard — AuditLayer" };

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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string }>;
}) {
  const { billing } = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: audits } = await supabase
    .from("audits")
    .select(
      "id, handle, platform, status, goal, milestone_label, created_at",
    )
    .order("created_at", { ascending: false });

  const list = audits ?? [];
  const usage = list.filter((a) =>
    USAGE_STATUSES.includes(a.status as AuditStatus),
  ).length;
  const limit = auditLimitForProfile(profile);
  const atCap = !isAdminUnlimited(profile.role) && usage >= limit;
  const billingMsg = billing ? BILLING_MESSAGES[billing] : undefined;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
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

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your audits</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {profile.full_name ? `Welcome back, ${profile.full_name}. ` : ""}
            Track generation, view reports, and request refinements.
          </p>
        </div>
        <Link href="/audits/new">
          <Button size="lg" disabled={atCap} className="font-medium">
            <Plus className="size-4" />
            New audit
          </Button>
        </Link>
      </div>

      {/* Usage + plan */}
      <section className="mt-8 grid gap-4 sm:grid-cols-[1.4fr_1fr]">
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

      {/* Audit list */}
      <section className="mt-8">
        {list.length === 0 ? (
          <div className="rounded-[var(--radius)] border border-dashed border-border bg-card p-10 text-center">
            <h2 className="text-base font-semibold">No audits yet</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Run your first audit free. Drop a handle, pick a goal, and watch
              the analysis come together live.
            </p>
            <Link href="/audits/new" className="mt-5 inline-block">
              <Button className="font-medium">Start your free audit</Button>
            </Link>
          </div>
        ) : (
          <ul className="grid gap-3">
            {list.map((audit) => (
              <li key={audit.id}>
                <Link
                  href={`/audits/${audit.id}`}
                  className="group flex items-center justify-between rounded-[var(--radius)] border border-border bg-card px-5 py-4 transition-colors hover:border-[color:var(--accent)]/40"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        @{audit.handle}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {PLATFORM_LABELS[audit.platform as Platform] ??
                          audit.platform}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {audit.milestone_label ?? "—"} ·{" "}
                      {new Date(audit.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={audit.status as AuditStatus} />
                    <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
