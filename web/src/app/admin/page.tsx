import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";
import {
  PLATFORM_LABELS,
  type AuditStatus,
  type Platform,
} from "@/lib/domain";
import { OnboardingSelect } from "./onboarding-select";

export default async function AdminHome() {
  if (!isSupabaseAdminConfigured()) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <p className="rounded-[var(--radius)] border border-border bg-card p-6 text-sm text-muted-foreground">
          The founder console needs the Supabase service-role key. Set
          <code className="mx-1 font-mono">SUPABASE_SERVICE_ROLE_KEY</code>
          to load client and audit data.
        </p>
      </main>
    );
  }

  const admin = createAdminClient();
  const [{ data: profiles }, { data: audits }] = await Promise.all([
    admin
      .from("profiles")
      .select(
        "id, email, full_name, role, plan, subscription_status, onboarding_status, created_at",
      )
      .order("created_at", { ascending: false }),
    admin
      .from("audits")
      .select("id, user_id, handle, platform, status, created_at")
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  const clients = profiles ?? [];
  const auditList = audits ?? [];
  const queued = auditList.filter((a) => a.status === "queued").length;
  const review = auditList.filter((a) => a.status === "needs_review").length;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Founder console</h1>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <Badge tone="neutral">{clients.length} clients</Badge>
        <Badge tone="info">{queued} queued</Badge>
        <Badge tone="warning">{review} need review</Badge>
      </div>

      {/* Audits */}
      <section className="mt-8">
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

      {/* Clients */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Clients
        </h2>
        <div className="mt-3 overflow-hidden rounded-[var(--radius)] border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Plan</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Onboarding</th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    No clients yet.
                  </td>
                </tr>
              ) : (
                clients.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-4 py-2">
                      <div className="font-medium">{c.email ?? "—"}</div>
                      {c.full_name && (
                        <div className="text-xs text-muted-foreground">
                          {c.full_name}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 capitalize">
                      {c.plan}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {c.subscription_status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {c.role === "admin" ? (
                        <Badge tone="accent">admin</Badge>
                      ) : (
                        <span className="text-muted-foreground">client</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <OnboardingSelect
                        profileId={c.id}
                        current={c.onboarding_status}
                      />
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
