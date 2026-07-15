import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";
import { RevokeButton } from "./revoke-button";

export default async function AdminTrialsPage() {
  if (!isSupabaseAdminConfigured()) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <p className="rounded-[var(--radius)] border border-border bg-card p-6 text-sm text-muted-foreground">
          The founder console needs the Supabase service-role key. Set
          <code className="mx-1 font-mono">SUPABASE_SERVICE_ROLE_KEY</code>
          to manage trial links.
        </p>
      </main>
    );
  }

  const admin = createAdminClient();
  const { data: links } = await (admin as any)
    .from("trial_links")
    .select("*")
    .order("created_at", { ascending: false });

  const trialLinks = (links ?? []) as any[];

  return (
    <main className="alm-shell py-8 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-7">
        <div><p className="alm-kicker">Trial operations</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Trial links</h1><p className="mt-2 text-sm text-muted-foreground">Issue, monitor, and revoke invite access.</p></div>
        <Link
          href="/admin/trials/new"
          className="inline-flex h-9 items-center rounded-lg bg-[color:var(--accent)] px-4 text-sm font-medium text-white hover:bg-[color:var(--accent)]/90"
        >
          Create Trial Link
        </Link>
      </div>

      <div className="mt-4">
        <Badge tone="neutral">{trialLinks.length} links</Badge>
      </div>

      <div className="alm-table-wrap mt-3">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-[0.72rem] uppercase tracking-[0.05em] text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Label</th>
              <th className="px-4 py-2 font-medium">Token</th>
              <th className="px-4 py-2 font-medium">Audits</th>
              <th className="px-4 py-2 font-medium">Offer</th>
              <th className="px-4 py-2 font-medium">Uses</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {trialLinks.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                  No trial links yet.
                </td>
              </tr>
            ) : (
              trialLinks.map((link: any) => {
                const isExpired =
                  link.expires_at && new Date(link.expires_at) < new Date();
                const isRevoked = !!link.revoked_at;
                const isExhausted = link.max_uses != null && link.used_count >= link.max_uses;
                const isActive = !isRevoked && !isExpired && !isExhausted;

                let statusTone: any = "success";
                let statusLabel = "Active";
                if (isRevoked) {
                  statusTone = "danger";
                  statusLabel = "Revoked";
                } else if (isExpired) {
                  statusTone = "neutral";
                  statusLabel = "Expired";
                } else if (isExhausted) {
                  statusTone = "neutral";
                  statusLabel = "Exhausted";
                }

                return (
                  <tr key={link.id} className="border-t border-border">
                    <td className="px-4 py-2">
                      {link.label || "—"}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {link.token.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {link.audits_granted}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{link.offer_plan}</span>
                      <br />{(link.report_types ?? []).join(", ")} · {link.access_days}d
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {link.used_count}
                      {link.max_uses ? `/${link.max_uses}` : ""}
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={statusTone}>{statusLabel}</Badge>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {new Date(link.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2">
                      {isActive && <RevokeButton trialId={link.id} />}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
