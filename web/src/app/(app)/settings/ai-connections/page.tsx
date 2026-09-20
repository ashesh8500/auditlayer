import { JourneyLoadError } from "@/components/journey-load-error";
import { ConnectorAddress } from "@/components/connector-address";
import { Bot, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { siteUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { revokeAiConnection } from "./actions";

export const metadata = { title: "AI Connections • AuditLayerMedia" };
export const dynamic = "force-dynamic";

export default async function AiConnectionsPage() {
  await requireUser();
  const supabase = await createClient();
  const { data: grants, error: grantsError } = await supabase.auth.oauth.listGrants();
  const mcpUrl = `${siteUrl()}/mcp`;

  return (
    <main className="alm-shell py-8 sm:py-12 animate-page-in">
      <div className="border-b border-border pb-7">
        <p className="alm-kicker">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">AI Connections</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Use your real Instagram metrics, audit history, and research context inside compatible AI tools.
        </p>
      </div>

      <section className="mt-8 rounded-[var(--radius)] border border-border bg-card p-5 shadow-[var(--shadow)] sm:p-6">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Bot className="size-4 text-[color:var(--accent)]" />
          Connector address
        </div>
        <ConnectorAddress url={mcpUrl} />
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Add this URL as a custom MCP server in ChatGPT, Claude, or another compatible AI tool. You will return here to approve access.
        </p>
      </section>

      <section className="mt-6 rounded-[var(--radius)] border border-border bg-card p-5 shadow-[var(--shadow)] sm:p-6">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 text-[color:var(--green)]" />
          Approved services
        </div>
        {grantsError ? <JourneyLoadError label="Approved services" /> : (grants ?? []).length ? (
          <ul className="mt-4 divide-y divide-border">
            {(grants ?? []).map((grant) => (
              <li key={grant.client.id} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-semibold">{grant.client.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Approved {new Date(grant.granted_at).toLocaleDateString()} • {grant.scopes.join(", ") || "Basic access"}
                  </p>
                </div>
                <form action={revokeAiConnection}>
                  <input type="hidden" name="client_id" value={grant.client.id} />
                  <Button type="submit" variant="outline" size="sm">Revoke</Button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No AI services have access yet.</p>
        )}
      </section>
    </main>
  );
}
