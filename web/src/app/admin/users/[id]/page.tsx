import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";
import {
  PLATFORM_LABELS,
  type AuditStatus,
  type Platform,
} from "@/lib/domain";
import { AccessAssignmentForm } from "./user-forms";

export default async function AdminUserDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!isSupabaseAdminConfigured()) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-10 text-sm text-muted-foreground">
        Service-role key required to manage users.
      </main>
    );
  }

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!profile) notFound();

  const [{ data: audits }, { data: actions }] = await Promise.all([
    admin
      .from("audits")
      .select("id, handle, platform, status, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    (admin as any)
      .from("admin_actions")
      .select("id, actor_id, action, detail, created_at")
      .eq("target_user_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const auditList = audits ?? [];
  const actionList = actions ?? [];

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to users
      </Link>

      {/* Profile header */}
      <header className="mt-4 border-b border-border pb-5">
        <h1 className="text-2xl font-bold tracking-tight">
          {profile.full_name || profile.email || "Unknown"}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{profile.email ?? "No email"}</span>
          <span>·</span>
          <span className="font-mono text-xs">
            Joined {new Date(profile.created_at).toLocaleDateString()}
          </span>
          <Badge tone="info">{profile.onboarding_status}</Badge>
        </div>
      </header>

      {/* Account status card */}
      <section className="mt-6 rounded-[var(--radius)] border border-border bg-card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Account status
        </h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Plan:</span>
            <Badge tone="accent">{profile.plan}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Type:</span>
            <AccountTypeBadge type={profile.account_type} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Gifted:</span>
            <span className="font-mono text-sm font-medium">
              {profile.gifted_audits}
            </span>
          </div>
        </div>
      </section>

      {/* Atomic founder-managed commercial access */}
      <section className="mt-6 rounded-[var(--radius)] border border-border bg-card p-5">
        <h3 className="text-sm font-semibold">Commercial access</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Assign trial, comp, paid, or manual enterprise access. This does not create Stripe seats or invoices.
        </p>
        <AccessAssignmentForm
          userId={id}
          plan={profile.plan}
          accountType={profile.account_type}
          giftedAudits={profile.gifted_audits}
        />
      </section>

      {/* Recent audits */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Recent audits
        </h2>
        <div className="mt-3 overflow-hidden rounded-[var(--radius)] border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Handle</th>
                <th className="px-4 py-2 font-medium">Platform</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {auditList.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    No audits yet.
                  </td>
                </tr>
              ) : (
                auditList.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-4 py-2">
                      <Link
                        href={`/admin/audits/${a.id}`}
                        className="font-medium hover:text-[color:var(--accent)]"
                      >
                        @{a.handle}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {PLATFORM_LABELS[a.platform as Platform] ?? a.platform}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={a.status as AuditStatus} />
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {new Date(a.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Action history */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Action history
        </h2>
        <div className="mt-3">
          {actionList.length === 0 ? (
            <p className="text-sm text-muted-foreground">No admin actions yet.</p>
          ) : (
            <ol className="space-y-2">
              {actionList.map((a: any) => {
                const detail = typeof a.detail === "string" ? JSON.parse(a.detail) : a.detail;
                return (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-[var(--radius)] border border-border bg-card px-4 py-2 text-xs"
                  >
                    <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                      {new Date(a.created_at).toLocaleString()}
                    </span>
                    <Badge tone="accent">{a.action}</Badge>
                    <span className="text-muted-foreground">
                      {formatActionDetail(a.action, detail)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>
    </main>
  );
}

function AccountTypeBadge({ type }: { type: string }) {
  const tone =
    type === "trial" ? "accent" : type === "comp" ? "info" : "neutral";
  return <Badge tone={tone as any}>{type}</Badge>;
}

function formatActionDetail(
  action: string,
  detail: Record<string, any> | null,
): string {
  if (!detail) return "";
  switch (action) {
    case "plan_change":
      return `Plan: ${detail.from} → ${detail.to}${detail.reason ? ` (${detail.reason})` : ""}`;
    case "gifted_adjust":
      return `Gifted: ${detail.from} → ${detail.to} (${detail.adjustment >= 0 ? "+" : ""}${detail.adjustment})${detail.reason ? ` — ${detail.reason}` : ""}`;
    case "account_type_change":
      return `Type: ${detail.from} → ${detail.to}${detail.reason ? ` (${detail.reason})` : ""}`;
    default:
      return JSON.stringify(detail);
  }
}
