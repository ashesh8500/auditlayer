import Link from "next/link";
import { AlertTriangle, ArrowRight, Search } from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";
import {
  PLATFORM_LABELS,
  type AuditStatus,
  type Platform,
} from "@/lib/domain";
import { needsFounderAction } from "@/lib/admin-review";
import { OnboardingSelect } from "./onboarding-select";

type AdminAuditRow = {
  id: string;
  user_id: string;
  handle: string;
  platform: string;
  status: string;
  created_at: string | null;
  report_version: number | null;
  prompt_version: string | null;
};

type AdminClientRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  plan: string;
  subscription_status: string;
  onboarding_status: string;
  created_at: string | null;
};

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const { search } = await searchParams;
  const searchLower = search?.toLowerCase() ?? "";
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
    (admin as any)
      .from("audits")
      .select("id, user_id, handle, platform, status, created_at, report_version, prompt_version")
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  const clients = (profiles ?? []) as AdminClientRow[];
  const filteredClients = searchLower
    ? clients.filter(
        (c) =>
          c.email?.toLowerCase().includes(searchLower) ||
          c.full_name?.toLowerCase().includes(searchLower),
      )
    : clients;
  const auditList = (audits ?? []) as AdminAuditRow[];
  const queued = auditList.filter((a) => a.status === "queued").length;
  const actionRequired = auditList.filter((a) => needsFounderAction(a.status));

  return (
    <main className="alm-shell py-8 sm:py-12 animate-page-in">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-7">
        <div><p className="alm-kicker">Founder operations</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Client and audit control.</h1><p className="mt-2 text-sm text-muted-foreground">Review queue health, onboarding, and recent client work.</p></div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge tone="neutral">{clients.length} clients</Badge>
          <Badge tone="info">{queued} queued</Badge>
          <Badge tone="warning">{actionRequired.length} need action</Badge>
        </div>
      </div>

      {actionRequired.length > 0 && (
        <section className="mt-8 rounded-[var(--radius)] border border-[color:var(--amber)]/30 bg-[color:var(--amber-muted)] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-card text-[color:var(--amber)]">
              <AlertTriangle className="size-4" />
            </div>
            <div>
              <p className="alm-kicker text-[color:var(--amber)]">Action required</p>
              <h2 className="mt-1 text-lg font-semibold">Reports waiting on a founder decision</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Review quality holds, blocked audits, and exhausted failures before they reach clients.
              </p>
            </div>
          </div>
          <ul className="mt-5 divide-y divide-[color:var(--amber)]/20 border-y border-[color:var(--amber)]/20">
            {actionRequired.slice(0, 8).map((audit) => (
              <li key={audit.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <StatusBadge status={audit.status as AuditStatus} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">@{audit.handle}</p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {PLATFORM_LABELS[audit.platform as Platform] ?? audit.platform} · {new Date(audit.created_at ?? "").toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/admin/audits/${audit.id}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--accent)] hover:underline"
                >
                  Review
                  <ArrowRight className="size-3" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Audits */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Recent audits
        </h2>
        <div className="alm-table-wrap mt-3">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Handle</th>
                <th className="px-4 py-2 font-medium">Platform</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Version</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {auditList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
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
                      v{a.report_version ?? 1}
                      {a.prompt_version ? ` · ${a.prompt_version}` : ""}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {new Date(a.created_at ?? "").toLocaleDateString()}
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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Clients
          </h2>
          <form className="relative w-full max-w-xs" method="GET" action="/admin">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              name="search"
              placeholder="Search by name or email..."
              defaultValue={search ?? ""}
              className="h-9 pl-9 text-sm"
            />
          </form>
        </div>
        <div className="alm-table-wrap">
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
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    {searchLower ? "No clients match your search." : "No clients yet."}
                  </td>
                </tr>
              ) : (
                filteredClients.map((c) => (
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
