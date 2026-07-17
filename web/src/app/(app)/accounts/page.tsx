import Link from "next/link";
import { Bot, Building2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Accounts — AuditLayerMedia" };

export default async function AccountsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: accounts } = await (supabase as any)
    .from("accounts")
    .select("id, handle, platform, last_researched_at, created_at")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  const list = (accounts ?? []) as Array<{
    id: string;
    handle: string;
    platform: string;
    last_researched_at: string | null;
    created_at: string | null;
  }>;

  return (
    <main className="alm-shell py-8 sm:py-12 animate-page-in">
      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-border pb-7">
        <div>
          <p className="alm-kicker">Your accounts</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            Tracked accounts
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The accounts you audit live here. Start a new audit from any of them.
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
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground leading-relaxed">
            Run your first audit and the account will be tracked here automatically.
          </p>
          <Link href="/audits/new" className="mt-6 inline-block">
            <Button size="lg" className="font-semibold">
              <Plus className="size-4" />
              Run an audit
            </Button>
          </Link>
        </div>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((account) => (
            <li key={account.id}>
              <Link
                href={`/audits/new?account_id=${encodeURIComponent(account.id)}`}
                className="group flex flex-col rounded-[var(--radius)] border border-border bg-card p-5 transition-shadow hover:shadow-[var(--shadow-md)] alm-focus"
              >
                <div className="flex items-center gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[color:var(--accent-muted)] text-sm font-semibold text-[color:var(--accent)]">
                    @
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">@{account.handle}</h3>
                    <p className="text-xs capitalize text-muted-foreground">{account.platform}</p>
                  </div>
                </div>
                <p className="mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground">
                  {account.last_researched_at
                    ? `Researched ${new Date(account.last_researched_at).toLocaleDateString()}`
                    : "No research yet"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
