import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; account_type?: string }>;
}) {
  const { q, account_type } = await searchParams;

  if (!isSupabaseAdminConfigured()) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <p className="rounded-[var(--radius)] border border-border bg-card p-6 text-sm text-muted-foreground">
          The founder console needs the Supabase service-role key. Set
          <code className="mx-1 font-mono">SUPABASE_SERVICE_ROLE_KEY</code>
          to manage users.
        </p>
      </main>
    );
  }

  const admin = createAdminClient();

  let query = admin
    .from("profiles")
    .select(
      "id, email, full_name, plan, role, account_type, gifted_audits, onboarding_status, created_at",
    )
    .order("created_at", { ascending: false });

  if (account_type && ["standard", "trial", "comp"].includes(account_type)) {
    query = query.eq("account_type", account_type);
  }
  if (q) {
    const term = `%${q}%`;
    query = query.or(`email.ilike.${term},full_name.ilike.${term}`);
  }

  const { data: profiles } = await query;

  const users = profiles ?? [];

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Users</h1>

      {/* Search & filter bar */}
      <form className="mt-4 flex flex-wrap gap-3">
        <input
          name="q"
          type="search"
          placeholder="Search name or email…"
          defaultValue={q ?? ""}
          className="h-9 w-full max-w-xs rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
        />
        <select
          name="account_type"
          defaultValue={account_type ?? ""}
          className="h-9 rounded-lg border border-border bg-background px-3 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
        >
          <option value="">All types</option>
          <option value="standard">Standard</option>
          <option value="trial">Trial</option>
          <option value="comp">Comp</option>
        </select>
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-lg bg-[color:var(--accent)] px-4 text-sm font-medium text-white hover:bg-[color:var(--accent)]/90"
        >
          Filter
        </button>
      </form>

      <div className="mt-4">
        <Badge tone="neutral">{users.length} users</Badge>
      </div>

      {/* Table */}
      <div className="mt-3 overflow-hidden rounded-[var(--radius)] border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Plan</th>
              <th className="px-4 py-2 font-medium">Account Type</th>
              <th className="px-4 py-2 font-medium">Gifted</th>
              <th className="px-4 py-2 font-medium">Onboarding</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  No users found.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="font-medium hover:text-[color:var(--accent)]"
                    >
                      {u.email ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {u.full_name || "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span className="capitalize">{u.plan}</span>
                  </td>
                  <td className="px-4 py-2">
                    <AccountTypeBadge type={u.account_type} />
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {u.gifted_audits}
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-xs text-muted-foreground">
                      {u.onboarding_status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="text-xs font-medium text-[color:var(--accent)] hover:underline"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function AccountTypeBadge({ type }: { type: string }) {
  const tone = type === "trial" ? "accent" : type === "comp" ? "info" : "neutral";
  return <Badge tone={tone as any}>{type}</Badge>;
}
